import { useCallback, useEffect, useState } from "react";
import type { LocalModelSource, LocalModelStatus, ModelInstallPlan } from "../../../domain/localModel";
import {
  cancelLocalModelDownload,
  listLocalModels,
  listenToModelProgress,
  pauseLocalModelDownload,
  planLocalModelInstall,
  removeLocalModel,
  repairLocalModel,
  resumeLocalModelDownload,
  startLocalModelDownload,
  verifyLocalModel,
} from "../api";
import {
  applyModelProgress,
  formatModelBytes,
  getModelActions,
  getModelStatusPresentation,
  hasEnoughSpace,
  type ModelAction,
} from "../modelState";

interface LocalModelPanelProps {
  desktop: boolean;
}

export function LocalModelPanel({ desktop }: LocalModelPanelProps) {
  const [models, setModels] = useState<LocalModelStatus[]>([]);
  const [source, setSource] = useState<LocalModelSource>("huggingFace");
  const [plan, setPlan] = useState<ModelInstallPlan | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!desktop) return;
    const next = await listLocalModels();
    setModels(next);
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    void refresh().catch(showError);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listenToModelProgress((event) => setModels((current) => applyModelProgress(current, event)))
      .then((stop) => { if (disposed) stop(); else unlisten = stop; })
      .catch(showError);
    return () => { disposed = true; unlisten?.(); };
  }, [desktop, refresh]);

  useEffect(() => {
    const model = models[0];
    if (!desktop || !model || model.status !== "absent") { setPlan(null); return; }
    void planLocalModelInstall(model.id, source).then(setPlan).catch(showError);
  }, [desktop, models, source]);

  function showError(error: unknown) {
    setMessage(error instanceof Error ? error.message : String(error));
  }

  async function runAction(model: LocalModelStatus, action: ModelAction) {
    if (busyAction === `${model.id}:${action}`) return;
    if (action === "remove" && !window.confirm("确认删除本地模型文件吗？题库和扫描附件不会被删除。")) return;
    if (action === "download" && plan && !hasEnoughSpace(plan)) {
      setMessage("磁盘空间不足，请先清理空间或更换应用数据目录。");
      return;
    }
    setBusyAction(`${model.id}:${action}`);
    setMessage(null);
    try {
      if (action === "download") await startLocalModelDownload(model.id, source);
      if (action === "pause") await pauseLocalModelDownload(model.id);
      if (action === "resume") await resumeLocalModelDownload(model.id);
      if (action === "cancel") await cancelLocalModelDownload(model.id);
      if (action === "verify") {
        const valid = await verifyLocalModel(model.id);
        setMessage(valid ? "模型校验通过。" : "模型文件不完整，可点击“修复”重新下载。 ");
      }
      if (action === "repair") await repairLocalModel(model.id);
      if (action === "remove") await removeLocalModel(model.id);
    } catch (error) {
      showError(error);
    } finally {
      setBusyAction(null);
      await refresh().catch(showError);
    }
  }

  return (
    <section className="panel local-model-panel" aria-labelledby="local-model-heading">
      <div className="panel-heading">
        <div><span className="eyebrow">Local inference</span><h2 id="local-model-heading">本地 GLM-OCR</h2></div>
        <span className="badge">llama.cpp · 完全离线推理</span>
      </div>
      <p className="local-model-intro">推理框架随应用提供，模型权重按需下载。模型只保存在本机，不会混入题库或附件仓库。</p>
      {!desktop ? <div className="alert warning">请在桌面端管理和运行本地模型。</div> : null}
      <div className="local-model-list">
        {models.map((model) => {
          const presentation = getModelStatusPresentation(model.status);
          const progress = model.sizeBytes > 0 ? Math.min(100, model.downloadedBytes / model.sizeBytes * 100) : 0;
          return (
            <article className="local-model-card" key={model.id}>
              <div className="local-model-identity">
                <div className="model-cube" aria-hidden="true">G</div>
                <div><strong>GLM-OCR Q8</strong><small>{model.id} · {formatModelBytes(model.sizeBytes)}</small></div>
                <span className={`model-status ${presentation.tone}`}>{presentation.label}</span>
              </div>
              {model.status === "absent" ? (
                <div className="model-source-row">
                  <label className="field-label">下载源
                    <select value={source} onChange={(event) => setSource(event.target.value as LocalModelSource)}>
                      <option value="huggingFace">Hugging Face</option>
                      <option value="modelScope">魔搭社区 ModelScope</option>
                    </select>
                  </label>
                  {plan ? <div className={`capacity-note ${hasEnoughSpace(plan) ? "" : "danger-text"}`}>需要 {formatModelBytes(plan.requiredBytes)} · 可用 {formatModelBytes(plan.availableBytes)}</div> : null}
                </div>
              ) : null}
              {model.downloadedBytes > 0 && model.status !== "ready" ? (
                <div className="model-progress" aria-label={`下载进度 ${progress.toFixed(0)}%`}>
                  <div><span>模型文件</span><strong>{progress.toFixed(0)}%</strong></div>
                  <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
                  <small>{formatModelBytes(model.downloadedBytes)} / {formatModelBytes(model.sizeBytes)}</small>
                </div>
              ) : null}
              {model.errorMessage ? <div className="alert error">{model.errorMessage}</div> : null}
              <div className="button-row local-model-actions">
                {getModelActions(model.status).map((action) => (
                  <button
                    key={action}
                    type="button"
                    className={action === "download" || action === "resume" || action === "repair" ? "primary-button" : "secondary-button"}
                    disabled={busyAction === `${model.id}:${action}` || !desktop}
                    onClick={() => void runAction(model, action)}
                  >{busyAction === `${model.id}:${action}` ? "处理中…" : actionLabel[action]}</button>
                ))}
              </div>
            </article>
          );
        })}
      </div>
      {desktop && models.length === 0 ? <div className="loading-card">正在读取本地模型状态…</div> : null}
      {message ? <div className="alert local-model-message" role="status">{message}</div> : null}
    </section>
  );
}

const actionLabel: Record<ModelAction, string> = {
  download: "下载模型",
  pause: "暂停",
  resume: "继续下载",
  cancel: "取消下载",
  verify: "校验文件",
  repair: "修复模型",
  remove: "删除模型",
};
