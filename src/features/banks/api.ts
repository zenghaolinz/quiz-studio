import { z } from "zod";
import type {
  CreateQuestionBankInput,
  CreateQuestionInput,
  Question,
  QuestionBank,
} from "../../domain/question";
import { questionSchema } from "../../domain/question";
import { invokeCommand, isTauriRuntime } from "../../lib/tauri";

const demoBanks: QuestionBank[] = [
  {
    id: "demo-bank",
    name: "示例题库",
    subject: "综合",
    description: "浏览器预览模式中的演示数据",
    questionCount: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export async function listQuestionBanks(): Promise<QuestionBank[]> {
  if (!isTauriRuntime()) return demoBanks;
  return invokeCommand<QuestionBank[]>("list_question_banks");
}

export async function createQuestionBank(
  input: CreateQuestionBankInput,
): Promise<QuestionBank> {
  if (!isTauriRuntime()) {
    return {
      id: crypto.randomUUID(),
      questionCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...input,
    };
  }
  return invokeCommand<QuestionBank>("create_question_bank", { input });
}

export async function deleteQuestionBank(id: string): Promise<void> {
  return invokeCommand<void>("delete_question_bank", { id });
}

export async function listQuestions(bankId: string): Promise<Question[]> {
  if (!isTauriRuntime()) return [];
  const raw = await invokeCommand<unknown[]>("list_questions", { bankId });
  // 运行时校验：脏数据不静默通过（修复审阅风险5）
  return z.array(questionSchema).parse(raw);
}

export async function createQuestion(
  input: CreateQuestionInput,
): Promise<Question> {
  if (!isTauriRuntime()) {
    return {
      id: crypto.randomUUID(),
      bankId: input.bankId,
      parentId: null,
      type: input.type,
      stemMarkdown: input.stemMarkdown,
      options: input.options,
      answer: input.answer,
      explanationMarkdown: input.explanationMarkdown ?? null,
      maxScore: input.maxScore ?? 1,
      difficulty: null,
      tags: input.tags ?? [],
      sourceFileId: null,
      sourcePage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  return invokeCommand<Question>("create_question", { input });
}

/** 批量导入：单一事务，任一失败回滚整批。返回成功写入题数。 */
export async function createQuestionsBatch(
  bankId: string,
  questions: CreateQuestionInput[],
): Promise<number> {
  return invokeCommand<number>("create_questions_batch", { bankId, questions });
}

export async function deleteQuestion(id: string): Promise<void> {
  return invokeCommand<void>("delete_question", { id });
}
