import { invokeCommand } from "../../lib/tauri";

export interface ImportedAsset {
  id: string;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
}

export async function importOcrSource(dataUrl: string, originalName: string): Promise<ImportedAsset> {
  return invokeCommand<ImportedAsset>("import_asset", { dataUrl, originalName });
}

export async function getOcrSourceDataUrl(assetId: string): Promise<string> {
  return invokeCommand<string>("get_asset_data_url", { assetId });
}
