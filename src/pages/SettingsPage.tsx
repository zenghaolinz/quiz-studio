import { useState } from "react";
import { upsertProvider } from "../features/ocr/glmOcrApi";
import { isTauriRuntime } from "../lib/tauri";

export function SettingsPage() {
  const [name, setName] = useState("本地 GLM-OCR SDK");
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:5002/glmocr/parse");
  const [model, setModel] = useState("glm-ocr");
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      const config = await upsertProvider({
        id: "glm-ocr-local",
        name,
        kind: "ocr",
        protocol: "glm_sdk",
        baseUrl,
        model,
        enabled: true,
        apiKey: apiKey || undefined,
      });
      setApiKey("");
      setMessage(`已保存：${config.name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">OCR Provider</span><h2>GLM-OCR 配置</h2></div></div>
        <form className="form-stack" onSubmit={save}>
          <label className="field-label">配置名称<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="field-label">服务地址<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></label>
          <label className="field-label">模型名<input value={model} onChange={(event) => setModel(event.target.value)} /></label>
          <label className="field-label">API Key（留空则不修改）<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} /></label>
          <p className="help-text">本地 SDK 服务默认地址为 <code>http://127.0.0.1:5002/glmocr/parse</code>。API Key 由 Rust 密钥存储适配器保存，不写入 SQLite。</p>
          <button type="submit" className="primary-button" disabled={!isTauriRuntime()}>保存配置</button>
          {!isTauriRuntime() ? <div className="alert warning">浏览器预览模式不会写入本地配置。</div> : null}
          {message ? <div className="alert">{message}</div> : null}
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">Policy</span><h3>数据与隐私</h3></div></div>
        <ul className="clean-list">
          <li>题库和作答记录默认只存本机。</li>
          <li>调用云端 OCR 或 AI 前应明确提示将上传的内容。</li>
          <li>日志不记录 API Key、完整题目图片和完整请求体。</li>
          <li>导出题库时不包含任何模型厂商密钥。</li>
        </ul>
      </section>
    </div>
  );
}
