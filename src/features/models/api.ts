import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  LocalModelSource,
  LocalModelStatus,
  ModelInstallPlan,
  ModelProgressEvent,
} from "../../domain/localModel";
import { invokeCommand } from "../../lib/tauri";

export const listLocalModels = () => invokeCommand<LocalModelStatus[]>("list_local_models");
export const planLocalModelInstall = (modelId: string, source: LocalModelSource) =>
  invokeCommand<ModelInstallPlan>("plan_local_model_install", { modelId, source });
export const startLocalModelDownload = (modelId: string, source: LocalModelSource) =>
  invokeCommand<void>("start_local_model_download", { modelId, source });
export const pauseLocalModelDownload = (modelId: string) =>
  invokeCommand<boolean>("pause_local_model_download", { modelId });
export const resumeLocalModelDownload = (modelId: string) =>
  invokeCommand<void>("resume_local_model_download", { modelId });
export const cancelLocalModelDownload = (modelId: string) =>
  invokeCommand<boolean>("cancel_local_model_download", { modelId });
export const verifyLocalModel = (modelId: string) =>
  invokeCommand<boolean>("verify_local_model", { modelId });
export const repairLocalModel = (modelId: string) =>
  invokeCommand<void>("repair_local_model", { modelId });
export const removeLocalModel = (modelId: string) =>
  invokeCommand<boolean>("remove_local_model", { modelId });

export function listenToModelProgress(
  listener: (event: ModelProgressEvent) => void,
): Promise<UnlistenFn> {
  return listen<ModelProgressEvent>("model-download-progress", ({ payload }) => listener(payload));
}
