export type LocalModelLifecycle =
  | "absent"
  | "downloading"
  | "paused"
  | "verifying"
  | "installing"
  | "ready"
  | "failed"
  | "incompatible";

export type LocalModelSource = "huggingFace" | "modelScope";

export interface LocalModelStatus {
  id: string;
  status: LocalModelLifecycle | string;
  sizeBytes: number;
  downloadedBytes: number;
  source: LocalModelSource | string | null;
  errorMessage: string | null;
}

export interface ModelInstallPlan {
  modelId: string;
  source: string;
  requiredBytes: number;
  availableBytes: number;
}

export interface ModelProgressEvent {
  modelId: string;
  file: string;
  downloadedBytes: number;
  totalBytes: number;
  status: string;
}
