use serde::Serialize;
use std::path::PathBuf;

use crate::error::{command_error, AppError, AppResult};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadTextFileResult {
    pub content: String,
    pub encoding: String,
}

/// 读取文本文件，先按 UTF-8 解码，失败则回退到 GBK（中文常见编码）。
/// 路径由前端 dialog 选择，本地单机可信，不做额外路径校验。
#[tauri::command]
pub async fn read_text_file(path: String) -> Result<ReadTextFileResult, String> {
    tauri::async_runtime::spawn_blocking(move || read_text_file_blocking(path).map_err(command_error))
        .await
        .map_err(|e| command_error(AppError::Runtime(e.to_string())))?
}

fn read_text_file_blocking(path: String) -> AppResult<ReadTextFileResult> {
    let path = PathBuf::from(&path);
    let bytes = std::fs::read(&path).map_err(|e| {
        AppError::Io(std::io::Error::other(format!("读取文件失败: {e}")))
    })?;

    // 去掉 UTF-8 BOM
    let stripped = if bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
        &bytes[3..]
    } else {
        &bytes
    };

    // 优先 UTF-8
    if let Ok(text) = std::str::from_utf8(stripped) {
        return Ok(ReadTextFileResult {
            content: text.to_string(),
            encoding: "utf-8".into(),
        });
    }

    // 回退 GBK
    let (cow, _, had_errors) = encoding_rs::GBK.decode(stripped);
    if had_errors {
        return Err(AppError::InvalidConfig(
            "文件既非合法 UTF-8 也非合法 GBK，请另存为 UTF-8 后重试".into(),
        ));
    }
    Ok(ReadTextFileResult {
        content: cow.into_owned(),
        encoding: "gbk".into(),
    })
}
