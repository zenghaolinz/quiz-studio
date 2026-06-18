use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    models::{Asset, AssetLink, NewAsset, NewAssetLink},
};

use super::Database;

impl Database {
    pub fn insert_asset(&self, input: &NewAsset) -> AppResult<Asset> {
        let id = Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339();
        {
            let connection = self.connection()?;
            connection.execute(
                "INSERT OR IGNORE INTO assets
                 (id, sha256, relative_path, original_name, mime_type, byte_size, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    id,
                    input.sha256,
                    input.relative_path,
                    input.original_name,
                    input.mime_type,
                    input.byte_size,
                    created_at,
                ],
            )?;
        }
        self.find_asset_by_hash(&input.sha256)?
            .ok_or_else(|| AppError::Runtime("附件元数据写入后无法读取".into()))
    }

    pub fn get_asset(&self, id: &str) -> AppResult<Option<Asset>> {
        let connection = self.connection()?;
        connection
            .query_row(
                "SELECT id, sha256, relative_path, original_name, mime_type, byte_size, created_at
                 FROM assets WHERE id = ?1",
                [id],
                map_asset,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn find_asset_by_hash(&self, sha256: &str) -> AppResult<Option<Asset>> {
        let connection = self.connection()?;
        connection
            .query_row(
                "SELECT id, sha256, relative_path, original_name, mime_type, byte_size, created_at
                 FROM assets WHERE sha256 = ?1",
                [sha256],
                map_asset,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn insert_asset_link(&self, input: &NewAssetLink) -> AppResult<AssetLink> {
        if !matches!(input.role.as_str(), "source" | "ocr_raw" | "ocr_markdown") {
            return Err(AppError::InvalidConfig("附件关系角色无效".into()));
        }
        let link = AssetLink {
            id: Uuid::new_v4().to_string(),
            asset_id: input.asset_id.clone(),
            parent_asset_id: input.parent_asset_id.clone(),
            role: input.role.clone(),
            provider_id: input.provider_id.clone(),
            model: input.model.clone(),
            created_at: Utc::now().to_rfc3339(),
        };
        let connection = self.connection()?;
        connection.execute(
            "INSERT INTO asset_links
             (id, asset_id, parent_asset_id, role, provider_id, model, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                link.id,
                link.asset_id,
                link.parent_asset_id,
                link.role,
                link.provider_id,
                link.model,
                link.created_at,
            ],
        )?;
        Ok(link)
    }

    pub fn list_asset_links(&self, asset_id: &str) -> AppResult<Vec<AssetLink>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(
            "SELECT id, asset_id, parent_asset_id, role, provider_id, model, created_at
             FROM asset_links WHERE asset_id = ?1 ORDER BY created_at ASC",
        )?;
        let rows = statement.query_map([asset_id], |row| {
            Ok(AssetLink {
                id: row.get(0)?,
                asset_id: row.get(1)?,
                parent_asset_id: row.get(2)?,
                role: row.get(3)?,
                provider_id: row.get(4)?,
                model: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }
}

fn map_asset(row: &rusqlite::Row<'_>) -> rusqlite::Result<Asset> {
    Ok(Asset {
        id: row.get(0)?,
        sha256: row.get(1)?,
        relative_path: row.get(2)?,
        original_name: row.get(3)?,
        mime_type: row.get(4)?,
        byte_size: row.get(5)?,
        created_at: row.get(6)?,
    })
}

#[cfg(test)]
mod tests {
    use std::env;

    use uuid::Uuid;

    use crate::models::{NewAsset, NewAssetLink};

    use super::super::Database;

    fn temp_db() -> Database {
        let path = env::temp_dir().join(format!("quiz-studio-assets-{}.sqlite3", Uuid::new_v4()));
        Database::open(&path).unwrap()
    }

    fn asset(hash: &str) -> NewAsset {
        NewAsset {
            sha256: hash.into(),
            relative_path: format!("assets/{}/{hash}.bin", &hash[..2]),
            original_name: "source.bin".into(),
            mime_type: "application/octet-stream".into(),
            byte_size: 4,
        }
    }

    #[test]
    fn inserts_and_finds_asset_by_hash() {
        let database = temp_db();
        let inserted = database.insert_asset(&asset("aabb")).unwrap();
        let found = database.find_asset_by_hash("aabb").unwrap().unwrap();
        assert_eq!(found.id, inserted.id);
        assert_eq!(found.relative_path, "assets/aa/aabb.bin");
    }

    #[test]
    fn duplicate_hash_returns_existing_asset() {
        let database = temp_db();
        let first = database.insert_asset(&asset("ccdd")).unwrap();
        let second = database.insert_asset(&asset("ccdd")).unwrap();
        assert_eq!(first.id, second.id);
    }

    #[test]
    fn stores_multiple_derivation_links_for_deduplicated_content() {
        let database = temp_db();
        let source = database.insert_asset(&asset("eeff")).unwrap();
        let derived = database.insert_asset(&asset("1122")).unwrap();
        for provider in ["provider-a", "provider-b"] {
            database
                .insert_asset_link(&NewAssetLink {
                    asset_id: derived.id.clone(),
                    parent_asset_id: Some(source.id.clone()),
                    role: "ocr_markdown".into(),
                    provider_id: Some(provider.into()),
                    model: Some("ocr-model".into()),
                })
                .unwrap();
        }
        assert_eq!(database.list_asset_links(&derived.id).unwrap().len(), 2);
    }
}
