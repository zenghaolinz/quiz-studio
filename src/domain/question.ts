import { z } from "zod";

export const questionTypeSchema = z.enum([
  "single_choice",
  "multiple_choice",
  "true_false",
  "fill_blank",
  "short_answer",
  "essay",
]);

export type QuestionType = z.infer<typeof questionTypeSchema>;

export const questionOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  contentMarkdown: z.string(),
});

export type QuestionOption = z.infer<typeof questionOptionSchema>;

export const answerSpecSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("choice"),
    optionIds: z.array(z.string()).min(1),
  }),
  z.object({
    kind: z.literal("boolean"),
    value: z.boolean(),
  }),
  z.object({
    kind: z.literal("blank"),
    acceptedAnswers: z.array(z.array(z.string()).min(1)).min(1),
    caseSensitive: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal("subjective"),
    referenceAnswerMarkdown: z.string(),
    rubric: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          points: z.number().nonnegative(),
          description: z.string().optional(),
        }),
      )
      .default([]),
  }),
]);

export type AnswerSpec = z.infer<typeof answerSpecSchema>;

export const questionSchema = z.object({
  id: z.string(),
  bankId: z.string(),
  parentId: z.string().nullable().optional(),
  type: questionTypeSchema,
  stemMarkdown: z.string().min(1),
  options: z.array(questionOptionSchema).default([]),
  answer: answerSpecSchema,
  explanationMarkdown: z.string().nullable().optional(),
  maxScore: z.number().positive().default(1),
  difficulty: z.number().int().min(1).max(5).nullable().optional(),
  tags: z.array(z.string()).default([]),
  sourceFileId: z.string().nullable().optional(),
  sourcePage: z.number().int().positive().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Question = z.infer<typeof questionSchema>;

export interface QuestionBank {
  id: string;
  name: string;
  subject?: string | null;
  description?: string | null;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuestionBankInput {
  name: string;
  subject?: string;
  description?: string;
}

export interface CreateQuestionInput {
  bankId: string;
  type: QuestionType;
  stemMarkdown: string;
  options: QuestionOption[];
  answer: AnswerSpec;
  explanationMarkdown?: string;
  maxScore?: number;
  tags?: string[];
}
