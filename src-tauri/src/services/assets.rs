use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use base64::{engine::general_purpose::STANDARD, Engine};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    db::Database,
    error::{AppError, AppResult},
    models::{Asset, AssetLink, NewAsset, NewAssetLink},
};

pub const MAX_ASSET_BYTES: u64 = 100 * 1024 * 1024;

#[derive(Clone)]
pub struct AssetStore {
    root: PathBuf,
}

#[derive(Clone)]
pub struct AssetWrite {
    pub bytes: Vec<u8>,
    pub original_name: String,
    pub mime_type: String,
}

pub struct AssetLinkContext {
    pub parent_asset_id: Option<String>,
    pub role: String,
    pub provider_id: Option<String>,
    pub model: Option<String>,
}

impl AssetStore {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn put(&self, database: &Database, input: AssetWrite) -> AppResult<Asset> {
        self.validate_size(input.bytes.len() as u64)?;
        let sha256 = format!("{:x}", Sha256::digest(&input.bytes));
        if let Some(existing) = database.find_asset_by_hash(&sha256)? {
            let path = self.resolve_relative(&existing.relative_path)?;
            if !path.exists() {
                self.write_atomically(&path, &input.bytes)?;
            }
            return Ok(existing);
        }

        let extension = safe_extension(&input.mime_type);
        let relative_path = format!("assets/{}/{}.{}", &sha256[..2], sha256, extension);
        let target = self.resolve_relative(&relative_path)?;
        self.write_atomically(&target, &input.bytes)?;
        database.insert_asset(&NewAsset {
            sha256,
            relative_path,
            original_name: safe_display_name(&input.original_name),
            mime_type: input.mime_type,
            byte_size: input.bytes.len() as i64,
        })
    }

    pub fn put_data_url(
        &self,
        database: &Database,
        data_url: &str,
        original_name: &str,
    ) -> AppResult<Asset> {
        let (header, payload) = data_url
            .split_once(',')
            .ok_or_else(|| AppError::InvalidConfig("附件 data URL 格式无效".into()))?;
        let mime_type = header
            .strip_prefix("data:")
            .and_then(|value| value.strip_suffix(";base64"))
            .filter(|value| !value.is_empty())
            .ok_or_else(|| AppError::InvalidConfig("附件 data URL 必须使用 base64".into()))?;
        let bytes = STANDARD
            .decode(payload)
            .map_err(|_| AppError::InvalidConfig("附件 base64 内容无效".into()))?;
        self.put(
            database,
            AssetWrite {
                bytes,
                original_name: original_name.into(),
                mime_type: mime_type.into(),
            },
        )
    }

    pub fn put_linked(
        &self,
        database: &Database,
        input: AssetWrite,
        context: AssetLinkContext,
    ) -> AppResult<(Asset, AssetLink)> {
        let asset = self.put(database, input)?;
        let link = database.insert_asset_link(&NewAssetLink {
            asset_id: asset.id.clone(),
            parent_asset_id: context.parent_asset_id,
            role: context.role,
            provider_id: context.provider_id,
            model: context.model,
        })?;
        Ok((asset, link))
    }

    pub fn read(&self, database: &Database, id: &str) -> AppResult<Vec<u8>> {
        let asset = database
            .get_asset(id)?
            .ok_or_else(|| AppError::NotFound(format!("附件 {id}")))?;
        let path = self.resolve_relative(&asset.relative_path)?;
        let metadata = fs::symlink_metadata(&path)?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(AppError::Runtime("附件路径不是普通文件".into()));
        }
        let canonical_root = fs::canonicalize(&self.root)?;
        let canonical_path = fs::canonicalize(&path)?;
        if !canonical_path.starts_with(&canonical_root) {
            return Err(AppError::InvalidConfig("附件路径越出应用数据目录".into()));
        }
        if metadata.len() != asset.byte_size as u64 {
            return Err(AppError::Runtime("附件大小与元数据不一致".into()));
        }
        fs::read(canonical_path).map_err(Into::into)
    }

    pub(crate) fn validate_size(&self, size: u64) -> AppResult<()> {
        if size > MAX_ASSET_BYTES {
            return Err(AppError::InvalidConfig(format!(
                "附件不能超过 {} MiB",
                MAX_ASSET_BYTES / 1024 / 1024
            )));
        }
        Ok(())
    }

    pub(crate) fn resolve_relative(&self, relative: &str) -> AppResult<PathBuf> {
        let relative = Path::new(relative);
        if relative.is_absolute()
            || relative
                .components()
                .any(|component| !matches!(component, Component::Normal(_)))
        {
            return Err(AppError::InvalidConfig("附件相对路径无效".into()));
        }
        let resolved = self.root.join(relative);
        if !resolved.starts_with(&self.root) {
            return Err(AppError::InvalidConfig("附件路径越出应用数据目录".into()));
        }
        Ok(resolved)
    }

    fn write_atomically(&self, target: &Path, bytes: &[u8]) -> AppResult<()> {
        let parent = target
            .parent()
            .ok_or_else(|| AppError::InvalidConfig("附件目标路径无父目录".into()))?;
        fs::create_dir_all(parent)?;
        if target.exists() {
            return Ok(());
        }
        let temporary = parent.join(format!(".{}.tmp", Uuid::new_v4()));
        fs::write(&temporary, bytes)?;
        match fs::rename(&temporary, target) {
            Ok(()) => Ok(()),
            Err(_error) if target.exists() => {
                let _ = fs::remove_file(&temporary);
                Ok(())
            }
            Err(error) => {
                let _ = fs::remove_file(&temporary);
                Err(error.into())
            }
        }
    }
}

fn safe_extension(mime_type: &str) -> &'static str {
    match mime_type.to_ascii_lowercase().as_str() {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "application/pdf" => "pdf",
        "application/json" => "json",
        "text/markdown" => "md",
        "text/plain" => "txt",
        _ => "bin",
    }
}

fn safe_display_name(original_name: &str) -> String {
    Path::new(original_name)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("attachment")
        .to_string()
}

#[cfg(test)]
mod tests {
    use std::env;

    use uuid::Uuid;

    use crate::db::Database;

    use super::{AssetLinkContext, AssetStore, AssetWrite, MAX_ASSET_BYTES};

    fn setup() -> (AssetStore, Database) {
        let root = env::temp_dir().join(format!("quiz-studio-asset-store-{}", Uuid::new_v4()));
        let database = Database::open(&root.join("test.sqlite3")).unwrap();
        (AssetStore::new(root), database)
    }

    #[test]
    fn stores_reads_and_deduplicates_content() {
        let (store, database) = setup();
        let input = AssetWrite {
            bytes: b"same content".to_vec(),
            original_name: "scan.png".into(),
            mime_type: "image/png".into(),
        };
        let first = store.put(&database, input.clone()).unwrap();
        let second = store.put(&database, input).unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(store.read(&database, &first.id).unwrap(), b"same content");
        assert!(first.relative_path.starts_with("assets/"));
        assert!(!first.relative_path.contains("scan.png"));
    }

    #[test]
    fn rejects_oversized_and_traversal_paths() {
        let (store, _) = setup();
        assert!(store.validate_size(MAX_ASSET_BYTES + 1).is_err());
        assert!(store.resolve_relative("../secret.txt").is_err());
        assert!(store.resolve_relative("C:/secret.txt").is_err());
    }

    #[test]
    fn uses_safe_extension_for_unknown_content() {
        let (store, database) = setup();
        let asset = store
            .put(
                &database,
                AssetWrite {
                    bytes: b"plain".to_vec(),
                    original_name: "../../evil.exe".into(),
                    mime_type: "application/x-unknown".into(),
                },
            )
            .unwrap();
        assert!(asset.relative_path.ends_with(".bin"));
    }

    #[test]
    fn stores_data_url_and_derived_relationships() {
        let (store, database) = setup();
        let source = store
            .put_data_url(&database, "data:image/png;base64,cG5n", "scan.png")
            .unwrap();
        let (_, link) = store
            .put_linked(
                &database,
                AssetWrite {
                    bytes: b"# OCR".to_vec(),
                    original_name: "ocr.md".into(),
                    mime_type: "text/markdown".into(),
                },
                AssetLinkContext {
                    parent_asset_id: Some(source.id.clone()),
                    role: "ocr_markdown".into(),
                    provider_id: Some("provider-a".into()),
                    model: Some("ocr-model".into()),
                },
            )
            .unwrap();
        assert_eq!(link.parent_asset_id.as_deref(), Some(source.id.as_str()));
        assert_eq!(link.provider_id.as_deref(), Some("provider-a"));
    }
}
