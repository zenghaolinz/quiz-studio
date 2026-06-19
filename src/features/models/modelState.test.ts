import { describe, expect, it } from "vitest";
import {
  applyModelProgress,
  formatModelBytes,
  getModelActions,
  getModelStatusPresentation,
  hasEnoughSpace,
} from "./modelState";
import type { LocalModelStatus, ModelProgressEvent } from "../../domain/localModel";

const model: LocalModelStatus = {
  id: "glm-ocr-q8",
  status: "absent",
  sizeBytes: 1_434_837_056,
  downloadedBytes: 0,
  source: null,
  errorMessage: null,
};

describe("local model state", () => {
  it.each([
    ["absent", "未安装"],
    ["downloading", "下载中"],
    ["paused", "已暂停"],
    ["verifying", "校验中"],
    ["installing", "安装中"],
    ["ready", "可用"],
    ["failed", "需要修复"],
    ["incompatible", "不兼容"],
  ])("presents %s as %s", (status, label) => {
    expect(getModelStatusPresentation(status).label).toBe(label);
  });

  it("only exposes actions valid for the current lifecycle state", () => {
    expect(getModelActions("absent")).toEqual(["download"]);
    expect(getModelActions("downloading")).toEqual(["pause", "cancel"]);
    expect(getModelActions("paused")).toEqual(["resume", "cancel", "remove"]);
    expect(getModelActions("ready")).toEqual(["verify", "remove"]);
    expect(getModelActions("failed")).toEqual(["repair", "remove"]);
    expect(getModelActions("verifying")).toEqual([]);
  });

  it("merges bounded progress without clearing persisted model metadata", () => {
    const event: ModelProgressEvent = {
      modelId: model.id,
      file: "model.gguf",
      downloadedBytes: 512,
      totalBytes: 1_024,
      status: "downloading",
    };
    const next = applyModelProgress([model], event);
    expect(next[0]).toMatchObject({
      id: model.id,
      status: "downloading",
      downloadedBytes: 512,
      sizeBytes: model.sizeBytes,
    });
  });

  it("reports capacity and formats model-sized byte values", () => {
    expect(hasEnoughSpace({ requiredBytes: 10, availableBytes: 10 })).toBe(true);
    expect(hasEnoughSpace({ requiredBytes: 11, availableBytes: 10 })).toBe(false);
    expect(formatModelBytes(1_434_837_056)).toBe("1.34 GB");
  });
});
