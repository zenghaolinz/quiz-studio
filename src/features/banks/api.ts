import { z } from "zod";
import type {
  CreateQuestionBankInput,
  CreateQuestionInput,
  Question,
  QuestionBank,
} from "../../domain/question";
import { questionSchema } from "../../domain/question";
import { invokeCommand, isTauriRuntime } from "../../lib/tauri";
import type { PortableBank } from "./portableBank";

interface BrowserDatabase {
  banks: QuestionBank[];
  questions: Question[];
}

const BROWSER_DB_KEY = "quiz-studio.browser-db.v1";
let memoryBrowserDb: BrowserDatabase | null = null;

function now(): string {
  return new Date().toISOString();
}

function makeQuestion(input: CreateQuestionInput): Question {
  const timestamp = now();
  return questionSchema.parse({
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
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function createBrowserSeed(): BrowserDatabase {
  const timestamp = now();
  const bank: QuestionBank = {
    id: "demo-bank",
    name: "示例题库",
    subject: "综合",
    description: "浏览器开发模式中的演示数据",
    questionCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const questions: Question[] = [
    makeQuestion({
      bankId: bank.id,
      type: "single_choice",
      stemMarkdown: "水的化学式是？",
      options: [
        { id: "a", label: "A", contentMarkdown: "$\\ce{CO2}$" },
        { id: "b", label: "B", contentMarkdown: "$\\ce{H2O}$" },
      ],
      answer: { kind: "choice", optionIds: ["b"] },
      explanationMarkdown: "$\\ce{H2O}$ 由两个氢原子和一个氧原子组成。",
    }),
    makeQuestion({
      bankId: bank.id,
      type: "true_false",
      stemMarkdown: "$2+2=4$。",
      options: [],
      answer: { kind: "boolean", value: true },
      explanationMarkdown: "基础算术结论。",
    }),
  ];
  bank.questionCount = questions.length;
  return { banks: [bank], questions };
}

function readBrowserDb(): BrowserDatabase {
  try {
    const raw = window.localStorage.getItem(BROWSER_DB_KEY);
    if (!raw) {
      const seed = memoryBrowserDb ?? createBrowserSeed();
      writeBrowserDb(seed);
      return seed;
    }
    const parsed = JSON.parse(raw) as BrowserDatabase;
    const questions = z.array(questionSchema).parse(parsed.questions ?? []);
    const banks = Array.isArray(parsed.banks) ? parsed.banks : [];
    const database = { banks, questions };
    memoryBrowserDb = database;
    return database;
  } catch {
    memoryBrowserDb ??= createBrowserSeed();
    return memoryBrowserDb;
  }
}

function writeBrowserDb(database: BrowserDatabase): void {
  memoryBrowserDb = database;
  try {
    window.localStorage.setItem(BROWSER_DB_KEY, JSON.stringify(database));
  } catch {
    // 隐私模式或存储配额异常时，当前会话仍使用内存仓库完成开发验证。
  }
}

function banksWithCounts(database: BrowserDatabase): QuestionBank[] {
  return database.banks
    .map((bank) => ({
      ...bank,
      questionCount: database.questions.filter((question) => question.bankId === bank.id).length,
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function touchBank(database: BrowserDatabase, bankId: string): void {
  const timestamp = now();
  database.banks = database.banks.map((bank) =>
    bank.id === bankId ? { ...bank, updatedAt: timestamp } : bank,
  );
}

export async function listQuestionBanks(): Promise<QuestionBank[]> {
  if (!isTauriRuntime()) return banksWithCounts(readBrowserDb());
  return invokeCommand<QuestionBank[]>("list_question_banks");
}

export async function createQuestionBank(
  input: CreateQuestionBankInput,
): Promise<QuestionBank> {
  if (!isTauriRuntime()) {
    const name = input.name.trim();
    if (!name) throw new Error("题库名称不能为空");
    const timestamp = now();
    const bank: QuestionBank = {
      id: crypto.randomUUID(),
      name,
      subject: input.subject ?? null,
      description: input.description ?? null,
      questionCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const database = readBrowserDb();
    database.banks.unshift(bank);
    writeBrowserDb(database);
    return bank;
  }
  return invokeCommand<QuestionBank>("create_question_bank", { input });
}

export async function deleteQuestionBank(id: string): Promise<void> {
  if (!isTauriRuntime()) {
    const database = readBrowserDb();
    const exists = database.banks.some((bank) => bank.id === id);
    if (!exists) throw new Error("题库不存在");
    database.banks = database.banks.filter((bank) => bank.id !== id);
    database.questions = database.questions.filter((question) => question.bankId !== id);
    writeBrowserDb(database);
    return;
  }
  return invokeCommand<void>("delete_question_bank", { id });
}

export async function updateQuestionBank(
  id: string,
  input: CreateQuestionBankInput,
): Promise<QuestionBank> {
  if (!isTauriRuntime()) {
    const name = input.name.trim();
    if (!name) throw new Error("题库名称不能为空");
    const database = readBrowserDb();
    const existing = database.banks.find((bank) => bank.id === id);
    if (!existing) throw new Error("题库不存在");
    const updated: QuestionBank = {
      ...existing,
      name,
      subject: input.subject ?? null,
      description: input.description ?? null,
      updatedAt: now(),
    };
    database.banks = database.banks.map((bank) => bank.id === id ? updated : bank);
    writeBrowserDb(database);
    return {
      ...updated,
      questionCount: database.questions.filter((question) => question.bankId === id).length,
    };
  }
  return invokeCommand<QuestionBank>("update_question_bank", { id, input });
}

export async function listQuestions(bankId: string): Promise<Question[]> {
  if (!isTauriRuntime()) {
    return readBrowserDb().questions.filter((question) => question.bankId === bankId);
  }
  const raw = await invokeCommand<unknown[]>("list_questions", { bankId });
  return z.array(questionSchema).parse(raw);
}

export async function createQuestion(
  input: CreateQuestionInput,
): Promise<Question> {
  if (!isTauriRuntime()) {
    const database = readBrowserDb();
    if (!database.banks.some((bank) => bank.id === input.bankId)) {
      throw new Error("目标题库不存在");
    }
    const question = makeQuestion(input);
    database.questions.push(question);
    touchBank(database, input.bankId);
    writeBrowserDb(database);
    return question;
  }
  return invokeCommand<Question>("create_question", { input });
}

/** 批量导入：桌面端由 SQLite 单一事务完成；浏览器开发模式一次性写入 localStorage。 */
export async function createQuestionsBatch(
  bankId: string,
  questions: CreateQuestionInput[],
): Promise<number> {
  if (!isTauriRuntime()) {
    if (questions.length === 0) throw new Error("没有可导入的题目");
    const database = readBrowserDb();
    if (!database.banks.some((bank) => bank.id === bankId)) {
      throw new Error("目标题库不存在");
    }
    if (questions.some((question) => question.bankId !== bankId)) {
      throw new Error("导入题目的 bankId 与目标题库不一致");
    }
    const created = questions.map(makeQuestion);
    database.questions.push(...created);
    touchBank(database, bankId);
    writeBrowserDb(database);
    return created.length;
  }
  return invokeCommand<number>("create_questions_batch", { bankId, questions });
}

export async function updateQuestion(id: string, input: CreateQuestionInput): Promise<Question> {
  if (!isTauriRuntime()) {
    const database = readBrowserDb();
    const existing = database.questions.find((question) => question.id === id);
    if (!existing) throw new Error("题目不存在");
    const updated = questionSchema.parse({
      ...existing,
      ...input,
      id,
      bankId: input.bankId,
      explanationMarkdown: input.explanationMarkdown ?? null,
      updatedAt: now(),
    });
    database.questions = database.questions.map((question) => question.id === id ? updated : question);
    touchBank(database, input.bankId);
    writeBrowserDb(database);
    return updated;
  }
  const raw = await invokeCommand<unknown>("update_question", { id, input });
  return questionSchema.parse(raw);
}

export async function deleteQuestion(id: string): Promise<void> {
  if (!isTauriRuntime()) {
    const database = readBrowserDb();
    const existing = database.questions.find((question) => question.id === id);
    if (!existing) throw new Error("题目不存在");
    database.questions = database.questions.filter((question) => question.id !== id);
    touchBank(database, existing.bankId);
    writeBrowserDb(database);
    return;
  }
  return invokeCommand<void>("delete_question", { id });
}

/** 恢复可移植题库。创建和批量写入任一步失败时清理新建题库。 */
export async function restoreQuestionBank(portable: PortableBank): Promise<QuestionBank> {
  const bank = await createQuestionBank({
    name: portable.bank.name,
    subject: portable.bank.subject ?? undefined,
    description: portable.bank.description ?? undefined,
  });
  try {
    await createQuestionsBatch(
      bank.id,
      portable.questions.map((question) => ({
        ...question,
        bankId: bank.id,
        explanationMarkdown: question.explanationMarkdown ?? undefined,
      })),
    );
    return { ...bank, questionCount: portable.questions.length };
  } catch (error) {
    try {
      await deleteQuestionBank(bank.id);
    } catch {
      // 保留原始恢复错误；桌面事务化恢复将在后续 IPC 中进一步收紧。
    }
    throw error;
  }
}
