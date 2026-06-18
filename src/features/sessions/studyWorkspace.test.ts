import { describe, expect, it } from "vitest";
import {
  loadStudyWorkspace,
  removeStudyWorkspace,
  saveStudyWorkspace,
  type StudyWorkspace,
} from "./studyWorkspace";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const workspace: StudyWorkspace = {
  version: 1,
  bankId: "bank-a",
  mode: "practice",
  questionOrder: ["q2", "q1"],
  orderMode: "custom",
  currentIndex: 1,
  responses: { q1: ["a"] },
  submitted: { q1: ["a"] },
  revealed: {},
};

describe("study workspace", () => {
  it("saves and loads a workspace by mode and bank", () => {
    const storage = new MemoryStorage();
    saveStudyWorkspace(workspace, storage);
    expect(loadStudyWorkspace("practice", "bank-a", storage)).toEqual(workspace);
    expect(loadStudyWorkspace("test", "bank-a", storage)).toBeNull();
    expect(loadStudyWorkspace("practice", "bank-b", storage)).toBeNull();
  });

  it("keeps data until explicitly removed", () => {
    const storage = new MemoryStorage();
    saveStudyWorkspace(workspace, storage);
    removeStudyWorkspace("practice", "bank-a", storage);
    expect(loadStudyWorkspace("practice", "bank-a", storage)).toBeNull();
  });

  it("ignores malformed and unsupported saved data", () => {
    const storage = new MemoryStorage();
    storage.setItem("quiz-studio.workspace.practice.bank-a.v1", "not-json");
    expect(loadStudyWorkspace("practice", "bank-a", storage)).toBeNull();
  });
});
