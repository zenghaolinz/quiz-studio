import { z } from "zod";
import {
  answerSpecSchema,
  questionOptionSchema,
  questionTypeSchema,
  type Question,
  type QuestionBank,
} from "../../domain/question";

const PORTABLE_FORMAT = "quiz-studio-qbank";
const PORTABLE_VERSION = 1;

const portableQuestionSchema = z.object({
  type: questionTypeSchema,
  stemMarkdown: z.string().trim().min(1, "题干不能为空"),
  options: z.array(questionOptionSchema).default([]),
  answer: answerSpecSchema,
  explanationMarkdown: z.string().nullable().optional(),
  maxScore: z.number().positive().default(1),
  tags: z.array(z.string()).default([]),
});

const portableBankSchema = z.object({
  format: z.literal(PORTABLE_FORMAT),
  version: z.literal(PORTABLE_VERSION),
  exportedAt: z.string(),
  bank: z.object({
    name: z.string().trim().min(1, "题库名称不能为空"),
    subject: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  }),
  questions: z.array(portableQuestionSchema).min(1, "题库至少包含一道题"),
});

export type PortableQuestion = z.infer<typeof portableQuestionSchema>;

export interface PortableBank {
  format: typeof PORTABLE_FORMAT;
  version: typeof PORTABLE_VERSION;
  exportedAt: string;
  bank: {
    name: string;
    subject?: string | null;
    description?: string | null;
  };
  questions: PortableQuestion[];
}

export function exportPortableBank(bank: QuestionBank, questions: Question[]): string {
  const portable: PortableBank = {
    format: PORTABLE_FORMAT,
    version: PORTABLE_VERSION,
    exportedAt: new Date().toISOString(),
    bank: {
      name: bank.name.trim(),
      subject: bank.subject?.trim() || null,
      description: bank.description?.trim() || null,
    },
    questions: questions.map((question) => ({
      type: question.type,
      stemMarkdown: question.stemMarkdown,
      options: question.options,
      answer: question.answer,
      explanationMarkdown: question.explanationMarkdown ?? null,
      maxScore: question.maxScore,
      tags: question.tags,
    })),
  };
  return JSON.stringify(portableBankSchema.parse(portable), null, 2);
}

export function importPortableBank(text: string): PortableBank {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("题库文件不是有效的 JSON");
  }

  if (typeof raw === "object" && raw !== null && "version" in raw && raw.version !== PORTABLE_VERSION) {
    throw new Error(`不支持的题库版本：${String(raw.version)}`);
  }

  const parsed = portableBankSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "题库文件格式无效");
  }
  return parsed.data;
}

export function searchQuestions(questions: Question[], query: string): Question[] {
  const keyword = query.trim().toLocaleLowerCase();
  if (!keyword) return questions;

  return questions.filter((question) => {
    const searchable = [
      question.stemMarkdown,
      question.explanationMarkdown ?? "",
      ...question.options.map((option) => option.contentMarkdown),
      ...question.tags,
    ].join("\n").toLocaleLowerCase();
    return searchable.includes(keyword);
  });
}
