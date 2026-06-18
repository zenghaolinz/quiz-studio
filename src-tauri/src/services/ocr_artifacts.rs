use serde::Serialize;
use serde_json::Value;

use crate::{
    db::Database,
    error::AppResult,
    models::NewAssetLink,
    services::assets::{AssetLinkContext, AssetStore, AssetWrite},
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedOcrArtifacts {
    pub source_asset_id: String,
    pub raw_asset_id: String,
    pub markdown_asset_id: String,
}

#[allow(clippy::too_many_arguments)]
pub fn persist_ocr_artifacts(
    store: &AssetStore,
    database: &Database,
    source_data_url: &str,
    source_name: &str,
    provider_id: &str,
    model: &str,
    raw_json: &Value,
    markdown: &str,
) -> AppResult<PersistedOcrArtifacts> {
    let source = store.put_data_url(database, source_data_url, source_name)?;
    database.insert_asset_link(&NewAssetLink {
        asset_id: source.id.clone(),
        parent_asset_id: None,
        role: "source".into(),
        provider_id: None,
        model: None,
    })?;
    let (raw, _) = store.put_linked(
        database,
        AssetWrite {
            bytes: serde_json::to_vec_pretty(raw_json)?,
            original_name: format!("{source_name}.ocr.json"),
            mime_type: "application/json".into(),
        },
        AssetLinkContext {
            parent_asset_id: Some(source.id.clone()),
            role: "ocr_raw".into(),
            provider_id: Some(provider_id.into()),
            model: Some(model.into()),
        },
    )?;
    let (markdown_asset, _) = store.put_linked(
        database,
        AssetWrite {
            bytes: markdown.as_bytes().to_vec(),
            original_name: format!("{source_name}.ocr.md"),
            mime_type: "text/markdown".into(),
        },
        AssetLinkContext {
            parent_asset_id: Some(source.id.clone()),
            role: "ocr_markdown".into(),
            provider_id: Some(provider_id.into()),
            model: Some(model.into()),
        },
    )?;
    Ok(PersistedOcrArtifacts {
        source_asset_id: source.id,
        raw_asset_id: raw.id,
        markdown_asset_id: markdown_asset.id,
    })
}

#[cfg(test)]
mod tests {
    use std::env;

    use serde_json::json;
    use uuid::Uuid;

    use crate::{db::Database, services::assets::AssetStore};

    use super::persist_ocr_artifacts;

    #[test]
    fn persists_source_raw_json_and_markdown_as_linked_assets() {
        let root = env::temp_dir().join(format!("quiz-studio-ocr-assets-{}", Uuid::new_v4()));
        let database = Database::open(&root.join("test.sqlite3")).unwrap();
        let store = AssetStore::new(root);
        let persisted = persist_ocr_artifacts(
            &store,
            &database,
            "data:image/png;base64,cG5n",
            "scan.png",
            "provider-a",
            "ocr-model",
            &json!({"markdown": "# OCR"}),
            "# OCR",
        )
        .unwrap();

        assert_ne!(persisted.source_asset_id, persisted.raw_asset_id);
        assert_ne!(persisted.raw_asset_id, persisted.markdown_asset_id);
        let markdown_links = database
            .list_asset_links(&persisted.markdown_asset_id)
            .unwrap();
        assert_eq!(markdown_links[0].role, "ocr_markdown");
        assert_eq!(
            markdown_links[0].parent_asset_id.as_deref(),
            Some(persisted.source_asset_id.as_str())
        );
    }
}
