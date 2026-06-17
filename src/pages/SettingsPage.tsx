import { useEffect, useMemo, useState } from "react";
import type { ProviderConfig, UpsertProviderInput } from "../domain/ocr";
import { testAiProvider } from "../features/ai/api";
import { AI_PROVIDER_PRESETS } from "../features/ai/providerPresets";
import { listProviders, upsertProvider } from "../features/ocr/glmOcrApi";
import { isTauriRuntime } from "../lib/tauri";

interface LlmDraft {
  id?: string;
  name: string;
  protocol: "openai_compatible" | "anthropic_messages";
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
}

export function SettingsPage() {
  const desktop = isTauriRuntime();
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [presetId, setPresetId] = useState("openai");
  const [llm, setLlm] = useState<LlmDraft>(() => presetToDraft("openai"));
  const [llmMessage, setLlmMessage] = useState<string | null>(null);
  const [savingLlm, setSavingLlm] = useState(false);
  const [testingLlm, setTestingLlm] = useState(false);
  const [ocrName, setOcrName] = useState("本地 GLM-OCR SDK");
  const [ocrBaseUrl, setOcrBaseUrl] = useState("http://127.0.0.1:5002/glmocr/parse");
  const [ocrModel, setOcrModel] = useState("glm-ocr");
  const [ocrApiKey, setOcrApiKey] = useState("");
  const [ocrMessage, setOcrMessage] = useState<string | null>(null);

  const llmProviders = useMemo(() => providers.filter((provider) => provider.kind === "llm"), [providers]);

  useEffect(() => {
    if (!desktop) return;
    void refreshProviders();
  }, [desktop]);

  async function refreshProviders() {
    try { setProviders(await listProviders()); }
    catch (error) { setLlmMessage(error instanceof Error ? error.message : String(error)); }
  }

  function applyPreset(nextId: string) {
    setPresetId(nextId);
    setLlm(presetToDraft(nextId));
    setLlmMessage(null);
  }

  function editProvider(provider: ProviderConfig) {
    if (provider.kind !== "llm") return;
    setPresetId("custom");
    setLlm({
      id: provider.id,
      name: provider.name,
      protocol: provider.protocol === "anthropic_messages" ? "anthropic_messages" : "openai_compatible",
      baseUrl: provider.baseUrl,
      model: provider.model,
      apiKey: "",
      enabled: provider.enabled,
    });
    setLlmMessage(`正在编辑：${provider.name}`);
  }

  async function saveLlm(event: React.FormEvent) {
    event.preventDefault();
    if (!desktop || savingLlm) return;
    setSavingLlm(true);
    setLlmMessage(null);
    try {
      const input: UpsertProviderInput = {
        id: llm.id ?? (presetId !== "custom" ? `llm-${presetId}` : undefined),
        name: llm.name.trim(),
        kind: "llm",
        protocol: llm.protocol,
        baseUrl: llm.baseUrl.trim(),
        model: llm.model.trim(),
        enabled: llm.enabled,
        apiKey: llm.apiKey.trim() || undefined,
      };
      const saved = await upsertProvider(input);
      setLlm((current) => ({ ...current, id: saved.id, apiKey: "" }));
      setLlmMessage(`已保存：${saved.name}`);
      await refreshProviders();
    } catch (error) {
      setLlmMessage(error instanceof Error ? error.message : String(error));
    } finally { setSavingLlm(false); }
  }

  async function testLlm() {
    if (!llm.id || testingLlm) { setLlmMessage("请先保存配置，再测试连接。"); return; }
    setTestingLlm(true);
    setLlmMessage("正在请求模型…");
    try {
      const result = await testAiProvider(llm.id);
      setLlmMessage(`${result.ok ? "连接成功" : "连接失败"} · ${result.elapsedMs} ms · ${result.message}`);
    } catch (error) {
      setLlmMessage(error instanceof Error ? error.message : String(error));
    } finally { setTestingLlm(false); }
  }

  async function saveOcr(event: React.FormEvent) {
    event.preventDefault();
    setOcrMessage(null);
    try {
      const config = await upsertProvider({ id: "glm-ocr-local", name: ocrName, kind: "ocr", protocol: "glm_sdk", baseUrl: ocrBaseUrl, model: ocrModel, enabled: true, apiKey: ocrApiKey || undefined });
      setOcrApiKey("");
      setOcrMessage(`已保存：${config.name}`);
      await refreshProviders();
    } catch (error) { setOcrMessage(error instanceof Error ? error.message : String(error)); }
  }

  const selectedPreset = AI_PROVIDER_PRESETS.find((preset) => preset.id === presetId);

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">AI Provider</span><h2>大模型 API 配置</h2></div><span className="badge">用于生成题目解析</span></div>
        <div className="settings-provider-layout">
          <form className="form-stack" onSubmit={saveLlm}>
            <label className="field-label">厂商预设
              <select value={presetId} onChange={(event) => applyPreset(event.target.value)}>
                {AI_PROVIDER_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
              </select>
            </label>
            <div className="alert">{selectedPreset?.note ?? "自定义 API 配置。"} Base URL 和模型名均可修改。</div>
            <label className="field-label">配置名称<input value={llm.name} onChange={(event) => setLlm({ ...llm, name: event.target.value })} /></label>
            <label className="field-label">协议
              <select value={llm.protocol} onChange={(event) => setLlm({ ...llm, protocol: event.target.value as LlmDraft["protocol"] })}>
                <option value="openai_compatible">OpenAI Compatible</option><option value="anthropic_messages">Anthropic Messages</option>
              </select>
            </label>
            <label className="field-label">Base URL<input value={llm.baseUrl} onChange={(event) => setLlm({ ...llm, baseUrl: event.target.value })} placeholder="https://…/v1" /></label>
            <label className="field-label">模型名称<input value={llm.model} onChange={(event) => setLlm({ ...llm, model: event.target.value })} placeholder="填写账号实际可用模型" /></label>
            <label className="field-label">API Key {llm.id ? "（留空则保留原密钥）" : ""}<input type="password" value={llm.apiKey} onChange={(event) => setLlm({ ...llm, apiKey: event.target.value })} /></label>
            <label className="checkbox-row"><input type="checkbox" checked={llm.enabled} onChange={(event) => setLlm({ ...llm, enabled: event.target.checked })} />启用此配置</label>
            <div className="button-row settings-button-row">
              <button type="submit" className="primary-button" disabled={!desktop || savingLlm || !llm.name.trim() || !llm.baseUrl.trim() || !llm.model.trim()}>{savingLlm ? "正在保存…" : "保存配置"}</button>
              <button type="button" className="secondary-button" disabled={!desktop || testingLlm || !llm.id} onClick={() => void testLlm()}>{testingLlm ? "测试中…" : "测试连接"}</button>
            </div>
            {!desktop ? <div className="alert warning">浏览器预览模式不会保存密钥或调用模型，请使用 Tauri 桌面端。</div> : null}
            {llmMessage ? <div className="alert">{llmMessage}</div> : null}
          </form>
          <div className="provider-list-panel">
            <h3>已保存的语言模型</h3>
            {llmProviders.length === 0 ? <p className="help-text">尚未保存语言模型配置。保存后即可在题库页面批量补全解析。</p> : (
              <div className="provider-list">{llmProviders.map((provider) => (
                <article className="provider-item" key={provider.id}><div><strong>{provider.name}</strong><span>{provider.model || "未填写模型"}</span><small>{provider.baseUrl}</small></div><button type="button" className="text-button" onClick={() => editProvider(provider)}>编辑</button></article>
              ))}</div>
            )}
          </div>
        </div>
      </section>

      <div className="settings-grid">
        <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow">OCR Provider</span><h2>GLM-OCR 配置</h2></div></div>
          <form className="form-stack" onSubmit={saveOcr}>
            <label className="field-label">配置名称<input value={ocrName} onChange={(event) => setOcrName(event.target.value)} /></label>
            <label className="field-label">服务地址<input value={ocrBaseUrl} onChange={(event) => setOcrBaseUrl(event.target.value)} /></label>
            <label className="field-label">模型名<input value={ocrModel} onChange={(event) => setOcrModel(event.target.value)} /></label>
            <label className="field-label">API Key（留空则不修改）<input type="password" value={ocrApiKey} onChange={(event) => setOcrApiKey(event.target.value)} /></label>
            <p className="help-text">本地 SDK 服务默认地址为 <code>http://127.0.0.1:5002/glmocr/parse</code>。API Key 由系统凭据库保存，不写入 SQLite。</p>
            <button type="submit" className="primary-button" disabled={!desktop}>保存 OCR 配置</button>
            {ocrMessage ? <div className="alert">{ocrMessage}</div> : null}
          </form>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><span className="eyebrow">Policy</span><h3>数据与隐私</h3></div></div>
          <ul className="clean-list"><li>题库和作答记录默认只存本机。</li><li>批量生成解析时，题干、选项和标准答案会发送给所选模型服务。</li><li>API Key 保存在操作系统凭据库，不进入 SQLite、题库导出和普通日志。</li><li>AI 解析可能出错，重要题库应抽查生成结果。</li></ul>
        </section>
      </div>
    </div>
  );
}

function presetToDraft(id: string): LlmDraft {
  const preset = AI_PROVIDER_PRESETS.find((item) => item.id === id) ?? AI_PROVIDER_PRESETS[0];
  return { id: undefined, name: preset.name, protocol: preset.protocol === "anthropic_messages" ? "anthropic_messages" : "openai_compatible", baseUrl: preset.baseUrl, model: preset.model, apiKey: "", enabled: true };
}
