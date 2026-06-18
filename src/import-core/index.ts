/**
 * import-core 统一入口。
 *
 * 所有文件格式只产出 ImportDraft（内含 QuestionDraft[]），不直接碰正式题库。
 * convertDraftToQuestionInput 把确认后的草稿转换为正式 CreateQuestionInput，供写入题库。
 */
import type { CreateQuestionInput, QuestionOption, AnswerSpec } from "../domain/question";
import type { ImportDraft } from "./types/question-draft";
import type { QuestionDraft } from "./types/question-draft";
import { parseTxt } from "./parsers/txt-parser";
import { parseMarkdown } from "./parsers/markdown-parser";
import { validateDrafts } from "./validation/validate-drafts";

export * from "./types/document-block";
export * from "./types/question-draft";
export * from "./types/import-warning";
export { normalizeLine, splitLines, stripBom } from "./normalize/normalize-text";
export { toHalfWidth } from "./normalize/normalize-symbols";
export {
  matchQuestionStart,
  classifyLine,
  groupBlocksIntoDrafts,
  inferType,
} from "./segmentation/question-boundary";
export { matchOption, labelToId, generateOptionId } from "./segmentation/option-parser";
export {
  matchAnswerMarker,
  matchExplanationMarker,
  parseChoiceLabels,
  parseBoolean,
  parseAnswerContent,
} from "./segmentation/answer-parser";
export { parseTxt } from "./parsers/txt-parser";
export { parseMarkdown } from "./parsers/markdown-parser";
export { validateDrafts } from "./validation/validate-drafts";

export interface ParseImportOptions {
  sourceFileId: string;
  sourceName?: string;
  pages?: Array<{ page: number; text: string }>;
}

/** 解析文本为 ImportDraft。sourceType 决定走 TXT 还是 Markdown 管线。 */
export function parseImport(
  sourceType: "txt" | "markdown" | "docx" | "pdf",
  text: string,
  options: ParseImportOptions,
): ImportDraft {
  const parsed = sourceType === "markdown" ? parseMarkdown(text) : parseTxt(text);
  if (options.pages?.length) {
    let firstLine = 1;
    const ranges = options.pages.map((page) => {
      const lineCount = Math.max(page.text.split(/\r?\n/).length, 1);
      const range = { page: page.page, firstLine, lastLine: firstLine + lineCount - 1 };
      firstLine += lineCount;
      return range;
    });
    for (const block of parsed.blocks) {
      block.page = ranges.find((range) => block.lineNumber >= range.firstLine && block.lineNumber <= range.lastLine)?.page;
    }
    for (const question of parsed.questions) {
      if (question.sourceRange) question.sourceRange.page = parsed.blocks[question.sourceRange.startBlock]?.page;
    }
  }
  const { warnings, hasErrors } = validateDrafts(parsed.questions);

  return {
    id: crypto.randomUUID(),
    sourceFileId: options.sourceFileId,
    sourceName: options.sourceName,
    sourceType,
    blocks: parsed.blocks,
    questions: parsed.questions,
    warnings,
    status: hasErrors ? "needs_review" : "needs_review",
  };
}

class DraftConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftConversionError";
  }
}

/**
 * 把已确认的 QuestionDraft 转换为正式 CreateQuestionInput。
 * unknown 题型或 unknown 答案会抛错——调用前应确保草稿已通过校验/人工确认。
 */
export function convertDraftToQuestionInput(
  draft: QuestionDraft,
  bankId: string,
): CreateQuestionInput {
  if (draft.type === "unknown") {
    throw new DraftConversionError(`第 ${draft.order + 1} 题题型未知，无法导入`);
  }

  const options: QuestionOption[] = draft.options.map((o) => ({
    id: o.id,
    label: o.label,
    contentMarkdown: o.contentMarkdown,
  }));

  let answer: AnswerSpec;
  switch (draft.type) {
    case "single_choice":
    case "multiple_choice": {
      if (draft.answer.kind !== "choice") {
        throw new DraftConversionError(`第 ${draft.order + 1} 题的答案类型与选择题不匹配`);
      }
      const labelToIdMap = new Map(draft.options.map((o) => [o.label, o.id]));
      const optionIds = draft.answer.optionLabels.map((label) => {
        const id = labelToIdMap.get(label);
        if (!id) {
          throw new DraftConversionError(`第 ${draft.order + 1} 题答案选项 ${label} 不存在`);
        }
        return id;
      });
      if (optionIds.length === 0) {
        throw new DraftConversionError(`第 ${draft.order + 1} 题答案无法对应到选项`);
      }
      if (draft.type === "single_choice" && optionIds.length !== 1) {
        throw new DraftConversionError(`第 ${draft.order + 1} 题是单选题，但答案数量不是 1`);
      }
      answer = { kind: "choice", optionIds };
      break;
    }
    case "true_false":
      if (draft.answer.kind !== "boolean") {
        throw new DraftConversionError(`第 ${draft.order + 1} 题的答案类型与判断题不匹配`);
      }
      answer = { kind: "boolean", value: draft.answer.value };
      break;
    case "fill_blank":
      if (draft.answer.kind !== "blank") {
        throw new DraftConversionError(`第 ${draft.order + 1} 题的答案类型与填空题不匹配`);
      }
      answer = {
        kind: "blank",
        acceptedAnswers: draft.answer.acceptedAnswers,
        caseSensitive: false,
      };
      break;
    case "short_answer":
    case "essay":
      if (draft.answer.kind !== "subjective") {
        throw new DraftConversionError(`第 ${draft.order + 1} 题的答案类型与主观题不匹配`);
      }
      answer = {
        kind: "subjective",
        referenceAnswerMarkdown: draft.answer.referenceMarkdown,
        rubric: [],
      };
      break;
    default:
      throw new DraftConversionError(`第 ${draft.order + 1} 题答案缺失，无法导入`);
  }

  return {
    bankId,
    type: draft.type,
    stemMarkdown: draft.stemMarkdown,
    options,
    answer,
    explanationMarkdown: draft.explanationMarkdown,
    tags: [],
  };
}
