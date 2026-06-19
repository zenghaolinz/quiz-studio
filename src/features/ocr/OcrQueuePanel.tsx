import type { OcrProgress } from "../../domain/ocr";
import type { OcrQueue } from "./ocrQueue";

const statusLabels = {
  pending: "等待中",
  running: "识别中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

const engineLabels = {
  tesseract: "基础 OCR",
  glm: "远程 GLM",
  local_glm: "本地 GLM · llama.cpp",
};

interface OcrQueuePanelProps {
  queue: OcrQueue;
  running: boolean;
  progress: OcrProgress | null;
  onStart: () => void;
  onPause: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onClear: () => void;
}

export function OcrQueuePanel(props: OcrQueuePanelProps) {
  const completed = props.queue.items.filter((item) => item.status === "completed").length;
  const retryable = props.queue.items.some((item) => item.status === "failed" || item.status === "cancelled");
  const pending = props.queue.items.some((item) => item.status === "pending" || item.status === "failed");
  return (
    <section className="panel ocr-queue-panel">
      <div className="panel-heading">
        <div><span className="eyebrow">Durable queue</span><h3>识别队列</h3></div>
        <span className="badge">{engineLabels[props.queue.engine]} · {completed} / {props.queue.items.length}</span>
      </div>
      <div className="ocr-queue-list">
        {props.queue.items.map((item, index) => (
          <div className="ocr-queue-item" key={item.id}>
            <span className={`badge ${item.status === "completed" ? "success" : item.status === "failed" ? "danger" : ""}`}>
              {statusLabels[item.status]}
            </span>
            <div><strong>{index + 1}. {item.sourceName}</strong>{item.error ? <small>{item.error}</small> : null}</div>
          </div>
        ))}
      </div>
      {props.running && props.progress ? (
        <div role="progressbar" aria-label="OCR 识别进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(props.progress.progress * 100)}>
          <div className="progress-track"><span style={{ width: `${Math.round(props.progress.progress * 100)}%` }} /></div>
          <small>{props.progress.message}</small>
        </div>
      ) : null}
      <div className="toolbar-actions">
        {!props.running ? <button className="primary-button" type="button" disabled={!pending} onClick={props.onStart}>继续识别</button> : null}
        {props.running ? <button type="button" onClick={props.onPause}>暂停</button> : null}
        <button type="button" disabled={!props.running && !pending} onClick={props.onCancel}>取消未完成任务</button>
        {retryable ? <button type="button" onClick={props.onRetry}>重新加入失败/取消项</button> : null}
        <button className="text-button danger" type="button" disabled={props.running} onClick={props.onClear}>清空队列</button>
      </div>
    </section>
  );
}
