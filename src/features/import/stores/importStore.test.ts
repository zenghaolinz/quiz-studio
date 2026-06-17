import { describe, expect, it } from "vitest";
import type { ImportDraft } from "../../../import-core/types/question-draft";
import { importReducer, type ImportState } from "./importStore";

function sampleDraft(): ImportDraft {
  return {
    id: "draft-1",
    sourceFileId: "sample.txt",
    sourceName: "sample.txt",
    sourceType: "txt",
    status: "needs_review",
    warnings: [],
    blocks: [
      { index: 0, kind: "question_start", rawText: "1. 题目", text: "题目", lineNumber: 1 },
      { index: 1, kind: "option", rawText: "A. 甲", text: "甲", lineNumber: 2, marker: "A" },
      { index: 2, kind: "option", rawText: "B. 乙", text: "乙", lineNumber: 3, marker: "B" },
      { index: 3, kind: "option", rawText: "C. 丙", text: "丙", lineNumber: 4, marker: "C" },
    ],
    questions: [
      {
        id: "q-0",
        order: 0,
        type: "single_choice",
        stemMarkdown: "题目",
        options: [
          { id: "a", label: "A", contentMarkdown: "甲" },
          { id: "b", label: "B", contentMarkdown: "乙" },
          { id: "c", label: "C", contentMarkdown: "丙" },
        ],
        answer: { kind: "choice", optionLabels: ["C"] },
        confidence: 1,
        warnings: [],
        sourceRange: { startBlock: 0, endBlock: 3 },
      },
    ],
  };
}

const EMPTY_STATE: ImportState = { draft: null, selectedOrder: null };

describe("importReducer", () => {
  it("loads the first draft from an empty state", () => {
    const draft = sampleDraft();
    const next = importReducer(EMPTY_STATE, { type: "load", draft });
    expect(next.draft).toBe(draft);
    expect(next.selectedOrder).toBe(0);
  });

  it("applies edits after loading", () => {
    const loaded = importReducer(EMPTY_STATE, { type: "load", draft: sampleDraft() });
    const next = importReducer(loaded, { type: "set_stem", order: 0, value: "修改后的题干" });
    expect(next.draft?.questions[0].stemMarkdown).toBe("修改后的题干");
  });

  it("keeps the correct option when a previous option is removed and labels are reassigned", () => {
    const loaded = importReducer(EMPTY_STATE, { type: "load", draft: sampleDraft() });
    const next = importReducer(loaded, { type: "remove_option", order: 0, optionId: "b" });
    expect(next.draft?.questions[0].options.map((option) => [option.id, option.label])).toEqual([
      ["a", "A"],
      ["c", "B"],
    ]);
    expect(next.draft?.questions[0].answer).toEqual({ kind: "choice", optionLabels: ["B"] });
  });

  it("stores fill-blank answers with the blank answer kind", () => {
    const draft = sampleDraft();
    draft.questions[0].type = "fill_blank";
    draft.questions[0].options = [];
    draft.questions[0].answer = { kind: "unknown" };
    const loaded = importReducer(EMPTY_STATE, { type: "load", draft });
    const next = importReducer(loaded, { type: "set_blank_answer", order: 0, value: "ATP；线粒体" });
    expect(next.draft?.questions[0].answer).toEqual({
      kind: "blank",
      acceptedAnswers: [["ATP"], ["线粒体"]],
    });
  });
});
