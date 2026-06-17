import { useState } from "react";
import { parseImport } from "../../../import-core";
import { inferSourceType, pickAndReadTextFile } from "../api";
import type { ImportDraft } from "../../../import-core/types/question-draft";
import { isTauriRuntime } from "../../../lib/tauri";

interface ImportSelectPageProps {
  onLoaded: (draft: ImportDraft) => void;
}

export function ImportSelectPage({ onLoaded }: ImportSelectPageProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePick() {
    setBusy(true);
    setError(null);
    try {
      const selected = await pickAndReadTextFile();
      if (!selected) return;
      const draft = parseImport(inferSourceType(selected.sourceName), selected.content, {
        sourceFileId: selected.sourceFileId,
        sourceName: selected.sourceName,
      });
      onLoaded(draft);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">Import</span><h2>导入题库</h2></div>
          <span className="badge">TXT / Markdown</span></div>
        <p className="muted">选择一份文本题库，软件会按规则切出题目，进入预览修正后再写入题库。OCR 与 DOCX/PDF 将在后续版本支持。</p>
        <button type="button" className="primary-button" disabled={busy} onClick={() => void handlePick()}>
          {busy ? "正在读取…" : "选择文件"}
        </button>
        {!isTauriRuntime() ? <div className="alert">当前为浏览器开发模式：文件会在浏览器内读取，题库暂存于 localStorage；桌面版使用 SQLite。</div> : null}
        {error ? <div className="alert error">{error}</div> : null}
        <div className="help-stack">
          <h4>支持的题号格式</h4>
          <ul className="clean-list">
            <li><code>1.</code> <code>1、</code> <code>1．</code> <code>(1)</code> <code>第1题</code></li>
          </ul>
          <h4>支持的选项格式</h4>
          <ul className="clean-list">
            <li><code>A.</code> <code>A、</code> <code>A．</code> <code>(A)</code></li>
          </ul>
          <h4>支持的答案标记</h4>
          <ul className="clean-list">
            <li><code>答案：</code> <code>正确答案：</code> <code>参考答案：</code> <code>解析：</code></li>
          </ul>
        </div>
      </section>
    </div>
  );
}
