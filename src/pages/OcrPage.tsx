import { useState } from "react";
import { MarkdownContent } from "../components/MarkdownContent";
import type { OcrProgress, OcrResult } from "../domain/ocr";
import { runGlmOcr } from "../features/ocr/glmOcrApi";
import { isTauriRuntime } from "../lib/tauri";

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

export function OcrPage() {
  const [file, setFile] = useState<File | null>(null);
  const [engine, setEngine] = useState<"tesseract" | "glm">("tesseract");
  const [providerId, setProviderId] = useState("glm-ocr-local");
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function start() {
    if (!file) return;
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const next = engine === "tesseract"
        ? await (await import("../features/ocr/tesseractEngine")).recognizeWithTesseract(file, { onProgress: setProgress })
        : await runGlmOcr(providerId, await fileToDataUrl(file));
      setResult(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-heading">
          <div><span className="eyebrow">Two-tier OCR</span><h2>题库图片识别</h2></div>
          <span className="badge">预览功能</span>
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
            ) : (
              <p className="help-text">Tesseract.js 首次使用会按需加载中英文语言数据；适合普通印刷文字，不保证复杂公式和表格。</p>
            )}
            <label className="drop-zone">
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              <strong>{file ? file.name : "选择或拖入题目图片"}</strong>
              <span>PNG、JPG、WebP</span>
            </label>
            <button type="button" className="primary-button full-width" disabled={!file || running || (engine === "glm" && !isTauriRuntime())} onClick={() => void start()}>
              {running ? "正在识别…" : "开始识别"}
            </button>
            {progress && running ? (
              <div><div className="progress-track"><span style={{ width: `${Math.round(progress.progress * 100)}%` }} /></div><small>{progress.message}</small></div>
            ) : null}
            {engine === "glm" && !isTauriRuntime() ? <div className="alert warning">GLM-OCR 调用需要在 Tauri 桌面运行时中测试。</div> : null}
            {error ? <div className="alert error">{error}</div> : null}
          </div>
          <div className="ocr-preview">
            {file ? <img src={URL.createObjectURL(file)} alt="待识别文档预览" /> : <div className="preview-placeholder">尚未选择图片</div>}
          </div>
        </div>
      </section>
      {result ? (
        <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow">OCR Result</span><h3>识别结果</h3></div><span className="badge success">{result.elapsedMs} ms</span></div>
          {result.warnings.map((warning) => <div key={warning} className="alert warning">{warning}</div>)}
          <MarkdownContent>{result.markdown || "（未识别到文字）"}</MarkdownContent>
        </section>
      ) : null}
    </div>
  );
}
