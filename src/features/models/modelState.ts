import type {
  LocalModelStatus,
  ModelInstallPlan,
  ModelProgressEvent,
} from "../../domain/localModel";

export type ModelAction = "download" | "pause" | "resume" | "cancel" | "verify" | "repair" | "remove";

const presentations: Record<string, { label: string; tone: string }> = {
  absent: { label: "未安装", tone: "muted" },
  downloading: { label: "下载中", tone: "active" },
  paused: { label: "已暂停", tone: "warning" },
  verifying: { label: "校验中", tone: "active" },
  installing: { label: "安装中", tone: "active" },
  ready: { label: "可用", tone: "success" },
  failed: { label: "需要修复", tone: "danger" },
  incompatible: { label: "不兼容", tone: "danger" },
};

const actions: Record<string, ModelAction[]> = {
  absent: ["download"],
  downloading: ["pause", "cancel"],
  paused: ["resume", "cancel", "remove"],
  verifying: [],
  installing: ["cancel"],
  ready: ["verify", "remove"],
  failed: ["repair", "remove"],
  incompatible: ["remove"],
};

export function getModelStatusPresentation(status: string) {
  return presentations[status] ?? { label: status, tone: "muted" };
}

export function getModelActions(status: string): ModelAction[] {
  return actions[status] ?? [];
}

export function applyModelProgress(models: LocalModelStatus[], event: ModelProgressEvent): LocalModelStatus[] {
  return models.map((model) => model.id === event.modelId
    ? { ...model, status: event.status, downloadedBytes: Math.min(event.downloadedBytes, model.sizeBytes) }
    : model);
}

export function hasEnoughSpace(plan: Pick<ModelInstallPlan, "requiredBytes" | "availableBytes">): boolean {
  return plan.availableBytes >= plan.requiredBytes;
}

export function formatModelBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
