use std::io::{Cursor, Read};

use serde::Serialize;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy)]
pub enum DocumentKind {
    Docx,
    Pdf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedPage {
    pub page: u32,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedDocument {
    pub text: String,
    pub pages: Vec<ExtractedPage>,
    pub needs_ocr: bool,
    pub warnings: Vec<String>,
}

pub fn extract_document(bytes: &[u8], kind: DocumentKind) -> AppResult<ExtractedDocument> {
    match kind {
        DocumentKind::Docx => extract_docx(bytes),
        DocumentKind::Pdf => extract_pdf(bytes),
    }
}

fn extract_docx(bytes: &[u8]) -> AppResult<ExtractedDocument> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| AppError::InvalidConfig(format!("DOCX 文件损坏: {error}")))?;
    let mut xml = String::new();
    archive
        .by_name("word/document.xml")
        .map_err(|_| AppError::InvalidConfig("DOCX 缺少 word/document.xml".into()))?
        .read_to_string(&mut xml)
        .map_err(|error| AppError::InvalidConfig(format!("DOCX 正文读取失败: {error}")))?;
    let document = roxmltree::Document::parse(&xml)
        .map_err(|error| AppError::InvalidConfig(format!("DOCX XML 无效: {error}")))?;
    let lines = document
        .descendants()
        .filter(|node| node.is_element() && node.tag_name().name() == "p")
        .filter_map(|paragraph| {
            let text = paragraph
                .descendants()
                .filter(|node| node.is_element() && node.tag_name().name() == "t")
                .filter_map(|node| node.text())
                .collect::<String>();
            let trimmed = text.trim();
            (!trimmed.is_empty()).then(|| trimmed.to_string())
        })
        .collect::<Vec<_>>()
        .join("\n");
    if lines.trim().is_empty() {
        return Err(AppError::InvalidConfig(
            "DOCX 中没有可导入的正文文字".into(),
        ));
    }
    Ok(ExtractedDocument {
        text: lines.clone(),
        pages: vec![ExtractedPage {
            page: 1,
            text: lines,
        }],
        needs_ocr: false,
        warnings: vec!["DOCX 分页信息不可可靠提取，预览按连续文本显示".into()],
    })
}

fn extract_pdf(bytes: &[u8]) -> AppResult<ExtractedDocument> {
    let document = lopdf::Document::load_mem(bytes)
        .map_err(|error| AppError::InvalidConfig(format!("PDF 文件损坏: {error}")))?;
    let mut pages = Vec::new();
    for (page, _) in document.get_pages() {
        let text = document
            .extract_text(&[page])
            .unwrap_or_default()
            .trim()
            .to_string();
        pages.push(ExtractedPage { page, text });
    }
    let text = pages
        .iter()
        .filter(|page| !page.text.is_empty())
        .map(|page| page.text.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    let needs_ocr = text.trim().is_empty();
    Ok(ExtractedDocument {
        text,
        pages,
        needs_ocr,
        warnings: if needs_ocr {
            vec!["PDF 未检测到可提取文字，请转到 OCR 页面识别扫描内容".into()]
        } else {
            vec![]
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_docx_paragraph_text() {
        let bytes = include_bytes!("../../tests/fixtures/question-bank.docx");
        let result = extract_document(bytes, DocumentKind::Docx).unwrap();
        assert!(result.text.contains("水的化学式"));
        assert!(result.text.contains("H2O"));
        assert!(result.text.contains("答案：B"));
        assert!(!result.needs_ocr);
    }

    #[test]
    fn extracts_text_pdf_with_page_numbers() {
        let bytes = include_bytes!("../../tests/fixtures/question-bank.pdf");
        let result = extract_document(bytes, DocumentKind::Pdf).unwrap();
        assert!(result.text.contains("水的化学式"));
        assert!(result.text.contains("H2O"));
        assert_eq!(result.pages.len(), 1);
        assert_eq!(result.pages[0].page, 1);
        assert!(!result.needs_ocr);
    }

    #[test]
    fn marks_pdf_without_text_for_ocr() {
        let bytes = include_bytes!("../../tests/fixtures/scanned-empty.pdf");
        let result = extract_document(bytes, DocumentKind::Pdf).unwrap();
        assert!(result.needs_ocr);
        assert!(result.text.is_empty());
    }

    #[test]
    fn rejects_malformed_documents() {
        assert!(extract_document(b"not a document", DocumentKind::Docx).is_err());
        assert!(extract_document(b"not a document", DocumentKind::Pdf).is_err());
    }
}
