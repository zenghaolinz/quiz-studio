import { describe, expect, it } from "vitest";
import { createGradeSaveQueue } from "./gradeSaveQueue";

describe("grade save queue", () => {
  it("serializes grade persistence tasks", async () => {
    const events: string[] = [];
    const enqueue = createGradeSaveQueue();
    const first = enqueue(async () => {
      events.push("first:start");
      await Promise.resolve();
      events.push("first:end");
    });
    const second = enqueue(async () => { events.push("second"); });
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second"]);
  });

  it("continues after a failed save", async () => {
    const enqueue = createGradeSaveQueue();
    await expect(enqueue(async () => { throw new Error("failed"); })).rejects.toThrow("failed");
    await expect(enqueue(async () => "saved")).resolves.toBe("saved");
  });
});
