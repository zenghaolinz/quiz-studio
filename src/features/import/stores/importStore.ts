/**
 * 导入草稿编辑状态。
 *
 * 不引入外部状态库，用 useReducer 管理 ImportDraft 的不可变编辑：
 * 改题型/题干/选项/答案、拆题、合题、删题。所有操作纯函数化，便于测试与回放。
 */
import { useMemo, useReducer } from "react";
import type { DraftAnswer, DraftOption, ImportDraft, QuestionDraft, QuestionDraftType } from "../../../import-core/types/question-draft";
import { generateOptionId } from "../../../import-core/segmentation/option-parser";

export interface ImportState {
  draft: ImportDraft | null;
  /** 当前选中的题号（0 基），用于源文档联动定位 */
  selectedOrder: number | null;
}

export type ImportAction =
  | { type: "load"; draft: ImportDraft }
  | { type: "clear" }
  | { type: "select"; order: number }
  | { type: "set_type"; order: number; value: QuestionDraftType }
  | { type: "set_stem"; order: number; value: string }
  | { type: "set_explanation"; order: number; value: string }
  | { type: "add_option"; order: number }
  | { type: "update_option"; order: number; optionId: string; content: string }
  | { type: "remove_option"; order: number; optionId: string }
  | { type: "set_choice_answer"; order: number; optionLabels: string[] }
  | { type: "set_boolean_answer"; order: number; value: boolean }
  | { type: "set_subjective_answer"; order: number; markdown: string }
  | { type: "remove_question"; order: number }
  | { type: "split_question"; order: number; blockIndex: number };

function updateQuestion(
  draft: ImportDraft,
  order: number,
  fn: (q: QuestionDraft) => QuestionDraft,
): ImportDraft {
  return {
    ...draft,
    questions: draft.questions.map((q) => (q.order === order ? fn(q) : q)),
  };
}

export function importReducer(state: ImportState, action: ImportAction): ImportState {
  const draft = state.draft;
  if (!draft) return state;

  switch (action.type) {
    case "load":
      return { draft: action.draft, selectedOrder: action.draft.questions[0]?.order ?? null };
    case "clear":
      return { draft: null, selectedOrder: null };
    case "select":
      return { ...state, selectedOrder: action.order };

    case "set_type":
      return {
        ...state,
        draft: updateQuestion(draft, action.order, (q) => ({ ...q, type: action.value })),
      };
    case "set_stem":
      return {
        ...state,
        draft: updateQuestion(draft, action.order, (q) => ({ ...q, stemMarkdown: action.value })),
      };
    case "set_explanation":
      return {
        ...state,
        draft: updateQuestion(draft, action.order, (q) => ({
          ...q,
          explanationMarkdown: action.value || undefined,
        })),
      };

    case "add_option":
      return {
        ...state,
        draft: updateQuestion(draft, action.order, (q) => {
          const nextLabel = String.fromCharCode("A".charCodeAt(0) + q.options.length);
          const option: DraftOption = {
            id: generateOptionId(q.options),
            label: nextLabel,
            contentMarkdown: "",
          };
          return { ...q, options: [...q.options, option] };
        }),
      };
    case "update_option":
      return {
        ...state,
        draft: updateQuestion(draft, action.order, (q) => ({
          ...q,
          options: q.options.map((o) =>
            o.id === action.optionId ? { ...o, contentMarkdown: action.content } : o,
          ),
        })),
      };
    case "remove_option":
      return {
        ...state,
        draft: updateQuestion(draft, action.order, (q) => {
          const options = q.options.filter((o) => o.id !== action.optionId);
          // 重新分配 label（A,B,C…），保持 id 不变
          const relabeled = options.map((o, i) => ({
            ...o,
            label: String.fromCharCode("A".charCodeAt(0) + i),
          }));
          // 若答案引用了被删选项，清理
          let answer: DraftAnswer = q.answer;
          if (answer.kind === "choice") {
            const valid = new Set(relabeled.map((o) => o.label));
            const kept = answer.optionLabels.filter((l) => valid.has(l));
            answer = kept.length > 0 ? { kind: "choice", optionLabels: kept } : { kind: "unknown" };
          }
          return { ...q, options: relabeled, answer };
        }),
      };

    case "set_choice_answer":
      return {
        ...state,
        draft: updateQuestion(draft, action.order, (q) => ({
          ...q,
          answer:
            action.optionLabels.length > 0
              ? { kind: "choice", optionLabels: action.optionLabels }
              : { kind: "unknown" },
        })),
      };
    case "set_boolean_answer":
      return {
        ...state,
        draft: updateQuestion(draft, action.order, (q) => ({
          ...q,
          answer: { kind: "boolean", value: action.value },
        })),
      };
    case "set_subjective_answer":
      return {
        ...state,
        draft: updateQuestion(draft, action.order, (q) => ({
          ...q,
          answer: action.markdown
            ? { kind: "subjective", referenceMarkdown: action.markdown }
            : { kind: "unknown" },
        })),
      };

    case "remove_question": {
      const remaining = draft.questions
        .filter((q) => q.order !== action.order)
        .map((q, i) => ({ ...q, order: i, id: `q-${i}` }));
      return {
        ...state,
        selectedOrder: remaining[0]?.order ?? null,
        draft: { ...draft, questions: remaining },
      };
    }

    case "split_question": {
      // 最小可用拆分：把指定题从 sourceRange 的 blockIndex 处切开，
      // 原题保留 [start, blockIndex)，新题接管 [blockIndex, end]。
      const idx = draft.questions.findIndex((q) => q.order === action.order);
      if (idx < 0) return state;
      const src = draft.questions[idx];
      const range = src.sourceRange;
      if (!range || action.blockIndex <= range.startBlock || action.blockIndex > range.endBlock) {
        return state;
      }
      const newQ: QuestionDraft = {
        id: `q-split-${src.order}`,
        order: src.order + 1,
        type: "unknown",
        stemMarkdown: "",
        options: [],
        answer: { kind: "unknown" },
        confidence: 1,
        warnings: ["由拆分产生，需人工确认题型与答案"],
        sourceRange: { startBlock: action.blockIndex, endBlock: range.endBlock },
      };
      const updatedSrc: QuestionDraft = {
        ...src,
        sourceRange: { startBlock: range.startBlock, endBlock: action.blockIndex - 1 },
      };
      const newQuestions = [
        ...draft.questions.slice(0, idx),
        updatedSrc,
        newQ,
        ...draft.questions.slice(idx + 1),
      ].map((q, i) => ({ ...q, order: i, id: `q-${i}` }));
      return { ...state, draft: { ...draft, questions: newQuestions } };
    }

    default:
      return state;
  }
}

export function useImportStore() {
  const [state, dispatch] = useReducer(importReducer, { draft: null, selectedOrder: null });
  const actions = useMemo(
    () => ({
      load: (draft: ImportDraft) => dispatch({ type: "load", draft }),
      clear: () => dispatch({ type: "clear" }),
      select: (order: number) => dispatch({ type: "select", order }),
      setType: (order: number, value: QuestionDraftType) => dispatch({ type: "set_type", order, value }),
      setStem: (order: number, value: string) => dispatch({ type: "set_stem", order, value }),
      setExplanation: (order: number, value: string) => dispatch({ type: "set_explanation", order, value }),
      addOption: (order: number) => dispatch({ type: "add_option", order }),
      updateOption: (order: number, optionId: string, content: string) =>
        dispatch({ type: "update_option", order, optionId, content }),
      removeOption: (order: number, optionId: string) => dispatch({ type: "remove_option", order, optionId }),
      setChoiceAnswer: (order: number, optionLabels: string[]) =>
        dispatch({ type: "set_choice_answer", order, optionLabels }),
      setBooleanAnswer: (order: number, value: boolean) =>
        dispatch({ type: "set_boolean_answer", order, value }),
      setSubjectiveAnswer: (order: number, markdown: string) =>
        dispatch({ type: "set_subjective_answer", order, markdown }),
      removeQuestion: (order: number) => dispatch({ type: "remove_question", order }),
      splitQuestion: (order: number, blockIndex: number) =>
        dispatch({ type: "split_question", order, blockIndex }),
    }),
    [],
  );
  return { state, actions };
}
