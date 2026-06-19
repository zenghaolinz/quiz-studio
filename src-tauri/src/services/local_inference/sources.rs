use url::Url;

use crate::{
    error::{AppError, AppResult},
    services::local_inference::manifest::{ModelSource, ModelSourceKind},
};

pub fn download_url(source: &ModelSource, file_name: &str) -> AppResult<Url> {
    validate_source(source, file_name)?;
    let (base, prefix) = match source.kind {
        ModelSourceKind::HuggingFace => ("https://huggingface.co", None),
        ModelSourceKind::ModelScope => ("https://www.modelscope.cn", Some("models")),
    };
    let mut url = Url::parse(base)
        .map_err(|error| AppError::InvalidConfig(format!("下载源地址无效：{error}")))?;
    {
        let mut path = url
            .path_segments_mut()
            .map_err(|_| AppError::InvalidConfig("下载源地址不能写入路径".into()))?;
        if let Some(prefix) = prefix {
            path.push(prefix);
        }
        for segment in source.repository.split('/') {
            path.push(segment);
        }
        path.push("resolve");
        path.push(&source.revision);
        path.push(file_name);
    }
    if matches!(source.kind, ModelSourceKind::HuggingFace) {
        url.query_pairs_mut().append_pair("download", "true");
    }
    Ok(url)
}

fn validate_source(source: &ModelSource, file_name: &str) -> AppResult<()> {
    let repository_is_safe = !source.repository.is_empty()
        && source
            .repository
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..");
    let file_is_safe = !file_name.is_empty()
        && !file_name.contains('/')
        && !file_name.contains('\\')
        && file_name != "."
        && file_name != "..";
    if !repository_is_safe || source.revision.trim().is_empty() || !file_is_safe {
        return Err(AppError::InvalidConfig("模型下载源或文件名不安全".into()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_pinned_percent_encoded_source_urls() {
        let hf = ModelSource {
            kind: ModelSourceKind::HuggingFace,
            repository: "org/model name".into(),
            revision: "commit#1".into(),
        };
        assert_eq!(
            download_url(&hf, "model file.gguf").unwrap().as_str(),
            "https://huggingface.co/org/model%20name/resolve/commit%231/model%20file.gguf?download=true"
        );

        let ms = ModelSource {
            kind: ModelSourceKind::ModelScope,
            repository: "org/model name".into(),
            revision: "commit#1".into(),
        };
        assert_eq!(
            download_url(&ms, "model file.gguf").unwrap().as_str(),
            "https://www.modelscope.cn/models/org/model%20name/resolve/commit%231/model%20file.gguf"
        );
    }

    #[test]
    fn rejects_unpinned_or_unsafe_source_parts() {
        let source = ModelSource {
            kind: ModelSourceKind::HuggingFace,
            repository: "org/model".into(),
            revision: "".into(),
        };
        assert!(download_url(&source, "model.gguf").is_err());
        assert!(download_url(&source, "../model.gguf").is_err());
    }
}
