#[allow(dead_code)] // Consumed by the model manager in Task 6.
pub mod download;
pub mod manifest;
#[allow(dead_code)]
pub mod sources;

pub use manifest::ModelCatalog;

pub fn bundled_catalog() -> crate::error::AppResult<ModelCatalog> {
    let catalog = ModelCatalog::parse(include_str!("../../../resources/glm-ocr-models.json"))?;
    catalog.model("glm-ocr-q8").ok_or_else(|| {
        crate::error::AppError::InvalidConfig("内置清单缺少默认 GLM-OCR 模型".into())
    })?;
    Ok(catalog)
}
