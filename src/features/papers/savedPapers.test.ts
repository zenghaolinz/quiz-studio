import { describe, expect, it } from "vitest";
import {
  deleteSavedPaper,
  listSavedPapers,
  savePaper,
  type PaperStorage,
} from "./savedPapers";

function memoryStorage(): PaperStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("saved papers", () => {
  it("keeps multiple named papers for one bank", () => {
    const storage = memoryStorage();
    const first = savePaper({ bankId: "bank-a", name: "错题卷", questionOrder: ["q2", "q1"], orderMode: "custom" }, storage);
    savePaper({ bankId: "bank-a", name: "全卷乱序", questionOrder: ["q1", "q2"], orderMode: "random" }, storage);

    expect(listSavedPapers("bank-a", storage).map((paper) => paper.name)).toEqual(["全卷乱序", "错题卷"]);
    expect(listSavedPapers("bank-b", storage)).toEqual([]);
    expect(first.questionOrder).toEqual(["q2", "q1"]);
  });

  it("updates a paper by id and deletes it explicitly", () => {
    const storage = memoryStorage();
    const saved = savePaper({ bankId: "bank-a", name: "第一版", questionOrder: ["q1"], orderMode: "custom" }, storage);
    savePaper({ id: saved.id, bankId: "bank-a", name: "第二版", questionOrder: ["q2"], orderMode: "sequential" }, storage);

    expect(listSavedPapers("bank-a", storage)).toHaveLength(1);
    expect(listSavedPapers("bank-a", storage)[0].name).toBe("第二版");
    deleteSavedPaper("bank-a", saved.id, storage);
    expect(listSavedPapers("bank-a", storage)).toEqual([]);
  });

  it("rejects blank names and empty papers", () => {
    const storage = memoryStorage();
    expect(() => savePaper({ bankId: "bank-a", name: " ", questionOrder: ["q1"], orderMode: "custom" }, storage)).toThrow("试卷名称不能为空");
    expect(() => savePaper({ bankId: "bank-a", name: "空卷", questionOrder: [], orderMode: "custom" }, storage)).toThrow("至少选择一道题");
  });
});
