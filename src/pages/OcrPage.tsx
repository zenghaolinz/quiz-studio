import { useMemo, useState } from "react";
import { MarkdownContent } from "../components/MarkdownContent";
import type { OcrResult } from "../domain/ocr";
import { OcrQueuePanel } from "../features/ocr/OcrQueuePanel";
import { useOcrQueue } from "../features/ocr/useOcrQueue";
import { createOcrImportDraft } from "../features/import/ocrDraft";
import { saveImportDraft } from "../features/import/importDraftPersistence";
import type { ImportDraft } from "../import-core/types/question-draft";
import { isTauriRuntime } from "../lib/tauri";

interface OcrPageProps {
  onReview: (draft: ImportDraft) => void;
}

export function OcrPage({ onReview }: OcrPageProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [engine, setEngine] = useState<"tesseract" | "glm">("tesseract");
  const [providerId, setProviderId] = useState("glm-ocr-local");
  const ocr = useOcrQueue();
  const completedMarkdown = useMemo(() => ocr.queue?.items
    .filter((item) => item.status === "completed" && item.markdown?.trim())
    .map((item, index) => `## 第 ${index + 1} 页 · ${item.sourceName}\n\n${item.markdown}`)
    .join("\n\n---\n\n") ?? "", [ocr.queue]);

  async function createQueue() {
    if (!files.length) return;
    const queue = await ocr.prepare(files, engine, providerId);
    await ocr.start(queue);
  }

  function reviewResult() {
    if (!ocr.queue || !completedMarkdown) return;
    const result: OcrResult = {
      engine: ocr.queue.engine === "glm" ? "glm_openai_compatible" : "tesseract_builtin",
      markdown: completedMarkdown,
      warnings: ocr.queue.items.some((item) => item.status !== "completed")
        ? ["队列中仍有未完成页面；当前导入仅包含已完成内容。"]
        : [],
      elapsedMs: 0,
      sourceAssetId: ocr.queue.items[0]?.sourceAssetId,
    };
    const sourceName = files.length === 1 ? files[0].name : `OCR 批次 ${ocr.queue.id.slice(0, 8)}`;
    const draft = createOcrImportDraft(result, sourceName);
    saveImportDraft(draft);
    onReview(draft);
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-heading">
          <div><span className="eyebrow">Multi-page OCR</span><h2>题库扫描识别</h2></div>
          <span className="badge">本地附件持久化</span>
        </div>
        <div className="ocr-grid">
          <div className="form-stack">
            <label className="field-label">识别引擎</label>
            <div className="segmented-control">
              <button type="button" className={engine === "tesseract" ? "active" : ""} onClick={() => setEngine("tesseract")}>基础 OCR</button>
              <button type="button" className={engine === "glm" ? "active" : ""} onClick={() => setEngine("glm")}>GLM-OCR</button>
            </div>
            {engine === "glm" ? (
              <label className="field-label">Provider ID
                <input value={providerId} onChange={(event) => setProviderId(event.target.value)} />
              </label>
            ) : <p className="help-text">适合普通印刷文字；复杂公式和表格建议使用视觉模型。</p>}
            <label className="drop-zone">
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              />
              <strong>{files.length ? `已选择 ${files.length} 个文件` : "选择图片或扫描 PDF"}</strong>
              <span>PNG、JPG、WebP、PDF；PDF 将逐页加入队列</span>
            </label>
            {files.length ? <div className="selected-file-list">{files.map((file) => <small key={`${file.name}-${file.size}`}>{file.name}</small>)}</div> : null}
            <button type="button" className="primary-button full-width" disabled={!files.length || ocr.preparing || ocr.running || !isTauriRuntime()} onClick={() => void createQueue()}>
              {ocr.preparing ? "正在生成页面并保存附件…" : "建立队列并开始识别"}
            </button>
            {!isTauriRuntime() ? <div className="alert warning">多页 OCR 与附件恢复需要在 Tauri 桌面版中运行。</div> : null}
            {ocr.error ? <div className="alert error" role="alert">{ocr.error}</div> : null}
          </div>
          <div className="ocr-preview">
            {completedMarkdown ? <MarkdownContent>{completedMarkdown}</MarkdownContent> : <div className="preview-placeholder">识别结果将在这里逐页汇总</div>}
          </div>
        </div>
      </section>
      {ocr.queue ? (
        <OcrQueuePanel
          queue={ocr.queue}
          running={ocr.running}
          progress={ocr.progress}
          onStart={() => void ocr.start()}
          onPause={ocr.pause}
          onCancel={() => void ocr.cancel()}
          onRetry={ocr.retryCancelled}
          onClear={ocr.remove}
        />
      ) : null}
      {completedMarkdown ? (
        <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow">OCR Result</span><h3>已完成内容</h3></div></div>
          <div className="toolbar-actions">
            <button type="button" className="primary-button" onClick={reviewResult}>校正并导入已完成内容</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
