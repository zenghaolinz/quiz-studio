/**
 * 导入草稿编辑状态。
 *
 * 不引入外部状态库，用 useReducer 管理 ImportDraft 的不可变编辑。
 */
import { useMemo, useReducer } from "react";
import type {
  DraftAnswer,
  DraftOption,
  ImportDraft,
  QuestionDraft,
  QuestionDraftType,
} from "../../../import-core/types/question-draft";
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
  | { type: "set_blank_answer"; order: number; value: string }
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

function nextOptionLabel(options: DraftOption[]): string {
  const used = new Set(options.map((option) => option.label.toUpperCase()));
  for (let code = "A".charCodeAt(0); code <= "Z".charCodeAt(0); code += 1) {
    const label = String.fromCharCode(code);
    if (!used.has(label)) return label;
  }
  return String.fromCharCode("A".charCodeAt(0) + options.length);
}

function normalizeQuestionOrders(questions: QuestionDraft[]): QuestionDraft[] {
  return questions.map((question, index) => ({
    ...question,
    order: index,
    id: `q-${index}`,
  }));
}

export function importReducer(state: ImportState, action: ImportAction): ImportState {
  // load/clear 必须在空草稿保护之前处理。旧实现先 `if (!draft) return state`，
  // 导致初始 load 永远被吞掉，之后所有编辑按钮都变成无效操作。
  if (action.type === "load") {
    return {
      draft: action.draft,
      selectedOrder: action.draft.questions[0]?.order ?? null,
    };
  }
  if (action.type === "clear") {
    return { draft: null, selectedOrder: null };
  }

  const draft = state.draft;
  if (!draft) return state;

  switch (action.type) {
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
          const option: DraftOption = {
            id: generateOptionId(q.options),
            label: nextOptionLabel(q.options),
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
          // 答案先从 label 转成稳定 option id，再重排 label，避免删除 B 后原 C 答案丢失。
          const answerOptionIds =
            q.answer.kind === "choice"
              ? new Set(
                  q.options
                    .filter((option) => q.answer.kind === "choice" && q.answer.optionLabels.includes(option.label))
                    .map((option) => option.id),
                )
              : new Set<string>();

          const relabeled = q.options
            .filter((o) => o.id !== action.optionId)
            .map((o, i) => ({
              ...o,
              label: String.fromCharCode("A".charCodeAt(0) + i),
            }));

          let answer: DraftAnswer = q.answer;
          if (q.answer.kind === "choice") {
            const labels = relabeled
              .filter((option) => answerOptionIds.has(option.id))
              .map((option) => option.label);
            answer = labels.length > 0
              ? { kind: "choice", optionLabels: labels }
              : { kind: "unknown" };
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
    case "set_blank_answer":
      return {
        ...state,
        draft: updateQuestion(draft, action.order, (q) => {
          const blanks = action.value
            .split(/[;；]/)
            .map((value) => value.trim())
            .filter(Boolean)
            .map((value) => [value]);
          return {
            ...q,
            answer: blanks.length > 0
              ? { kind: "blank", acceptedAnswers: blanks }
              : { kind: "unknown" },
          };
        }),
      };
    case "set_subjective_answer":
      return {
        ...state,
        draft: updateQuestion(draft, action.order, (q) => ({
          ...q,
          answer: action.markdown.trim()
            ? { kind: "subjective", referenceMarkdown: action.markdown }
            : { kind: "unknown" },
        })),
      };

    case "remove_question": {
      const remaining = normalizeQuestionOrders(
        draft.questions.filter((q) => q.order !== action.order),
      );
      const selectedOrder =
        remaining.length === 0
          ? null
          : Math.min(action.order, remaining.length - 1);
      return {
        ...state,
        selectedOrder,
        draft: { ...draft, questions: remaining },
      };
    }

    case "split_question": {
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
        stemMarkdown: draft.blocks
          .filter((block) => block.index >= action.blockIndex && block.index <= range.endBlock)
          .map((block) => block.text)
          .join("\n")
          .trim(),
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
      const newQuestions = normalizeQuestionOrders([
        ...draft.questions.slice(0, idx),
        updatedSrc,
        newQ,
        ...draft.questions.slice(idx + 1),
      ]);
      return {
        ...state,
        selectedOrder: newQ.order,
        draft: { ...draft, questions: newQuestions },
      };
    }

    default:
      return state;
  }
}

export function useImportStore(initialDraft: ImportDraft | null = null) {
  const [state, dispatch] = useReducer(importReducer, {
    draft: initialDraft,
    selectedOrder: initialDraft?.questions[0]?.order ?? null,
  });
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
      setBlankAnswer: (order: number, value: string) =>
        dispatch({ type: "set_blank_answer", order, value }),
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
