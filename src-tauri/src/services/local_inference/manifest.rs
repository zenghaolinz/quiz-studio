use std::collections::HashSet;

use serde::Deserialize;

use crate::error::{AppError, AppResult};

const SUPPORTED_SCHEMA: u32 = 1;
const SUPPORTED_LLAMA_RELEASE: &str = "b9716";
const MAX_MODEL_FILE_BYTES: u64 = 4 * 1024 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCatalog {
    pub schema_version: u32,
    pub models: Vec<ModelManifest>,
}

#[derive(Debug, Deserialize)]
pub struct ModelManifest {
    pub id: String,
    pub runtime: RuntimeRequirement,
    pub files: Vec<ModelFile>,
    pub sources: Vec<ModelSource>,
}

#[derive(Debug, Deserialize)]
pub struct RuntimeRequirement {
    pub kind: String,
    pub release: String,
}

#[derive(Debug, Clone, Copy, Deserialize, Eq, Hash, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ModelFileRole {
    Model,
    Mmproj,
    Extra,
}

#[derive(Debug, Deserialize)]
pub struct ModelFile {
    pub role: ModelFileRole,
    pub path: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ModelSourceKind {
    HuggingFace,
    ModelScope,
}

#[derive(Debug, Deserialize)]
pub struct ModelSource {
    pub kind: ModelSourceKind,
    pub repository: String,
    pub revision: String,
}

impl ModelCatalog {
    pub fn parse(json: &str) -> AppResult<Self> {
        let catalog: Self = serde_json::from_str(json)?;
        catalog.validate()?;
        Ok(catalog)
    }

    pub fn model(&self, id: &str) -> Option<&ModelManifest> {
        self.models.iter().find(|model| model.id == id)
    }

    fn validate(&self) -> AppResult<()> {
        if self.schema_version != SUPPORTED_SCHEMA {
            return Err(invalid("不支持的模型清单版本"));
        }
        if self.models.is_empty() {
            return Err(invalid("模型清单不能为空"));
        }
        let mut ids = HashSet::new();
        for model in &self.models {
            if model.id.trim().is_empty() || !ids.insert(model.id.as_str()) {
                return Err(invalid("模型 ID 不能为空或重复"));
            }
            model.validate()?;
        }
        Ok(())
    }
}

impl ModelManifest {
    pub fn file(&self, role: ModelFileRole) -> Option<&ModelFile> {
        self.files.iter().find(|file| file.role == role)
    }

    fn validate(&self) -> AppResult<()> {
        if self.runtime.kind != "llama.cpp" || self.runtime.release != SUPPORTED_LLAMA_RELEASE {
            return Err(invalid("模型需要不受支持的 llama.cpp 运行时"));
        }
        if self.sources.is_empty() {
            return Err(invalid("模型至少需要一个下载源"));
        }
        for source in &self.sources {
            match source.kind {
                ModelSourceKind::HuggingFace | ModelSourceKind::ModelScope => {}
            }
            if source.repository.trim().is_empty() || source.revision.trim().is_empty() {
                return Err(invalid("模型下载源缺少仓库或固定版本"));
            }
        }

        let mut paths = HashSet::new();
        let mut roles = HashSet::new();
        for file in &self.files {
            let safe_name = std::path::Path::new(&file.path)
                .file_name()
                .and_then(|name| name.to_str());
            if safe_name != Some(file.path.as_str()) || file.path.contains(['/', '\\']) {
                return Err(invalid("模型文件路径不安全"));
            }
            if file.size == 0 || file.size > MAX_MODEL_FILE_BYTES {
                return Err(invalid("模型文件大小无效"));
            }
            if file.sha256.len() != 64
                || !file
                    .sha256
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            {
                return Err(invalid("模型文件 SHA-256 无效"));
            }
            if !paths.insert(file.path.as_str()) || !roles.insert(file.role) {
                return Err(invalid("模型文件路径或角色重复"));
            }
        }
        if self.file(ModelFileRole::Model).is_none() || self.file(ModelFileRole::Mmproj).is_none() {
            return Err(invalid("GLM-OCR 模型必须同时包含主模型和 mmproj"));
        }
        Ok(())
    }
}

fn invalid(message: &str) -> AppError {
    AppError::InvalidConfig(message.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID: &str = r#"{
      "schemaVersion": 1,
      "models": [{
        "id": "glm-ocr-q8",
        "runtime": { "kind": "llama.cpp", "release": "b9716" },
        "files": [
          { "role": "model", "path": "GLM-OCR-Q8_0.gguf", "size": 950433408, "sha256": "f5899ad12b29350282240cf48c28e48aec8eeacbeacd5134a3e7d6c7ffa6819f" },
          { "role": "mmproj", "path": "mmproj-GLM-OCR-Q8_0.gguf", "size": 484403648, "sha256": "e14281d28129fbfafcfcdffd2f1d2d73bdcb5c2d74105d32f45fc3cd1c69e5a5" }
        ],
        "sources": [{ "kind": "huggingFace", "repository": "ggml-org/GLM-OCR-GGUF", "revision": "65a42de1148dbed2297e922b5dbc7d9b70c36578" }]
      }]
    }"#;

    #[test]
    fn parses_a_pinned_glm_ocr_manifest() {
        let manifest = ModelCatalog::parse(VALID).unwrap();
        let model = manifest.model("glm-ocr-q8").unwrap();

        assert_eq!(model.runtime.release, "b9716");
        assert_eq!(model.file(ModelFileRole::Model).unwrap().size, 950_433_408);
        assert_eq!(model.file(ModelFileRole::Mmproj).unwrap().size, 484_403_648);
    }

    #[test]
    fn rejects_unsafe_or_incomplete_manifests() {
        let traversal = VALID.replace("GLM-OCR-Q8_0.gguf", "../model.gguf");
        assert!(ModelCatalog::parse(&traversal).is_err());

        let invalid_hash = VALID.replace(
            "f5899ad12b29350282240cf48c28e48aec8eeacbeacd5134a3e7d6c7ffa6819f",
            "not-a-hash",
        );
        assert!(ModelCatalog::parse(&invalid_hash).is_err());

        let missing_mmproj = VALID.replace("mmproj", "extra");
        assert!(ModelCatalog::parse(&missing_mmproj).is_err());
    }
}
