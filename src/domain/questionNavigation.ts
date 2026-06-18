import type { Question, QuestionType } from "./question";

export type QuestionOrderMode = "sequential" | "random" | "custom";
export type QuestionTypeFilter = "all" | QuestionType;

export function buildQuestionOrder(
  questions: Question[],
  mode: QuestionOrderMode,
  random: () => number = Math.random,
): string[] {
  const ids = questions.map((question) => question.id);
  if (mode !== "random") return ids;

  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
  }
  return ids;
}

export function restoreQuestionOrder(questions: Question[], savedOrder?: string[]): string[] {
  if (!savedOrder?.length) return buildQuestionOrder(questions, "sequential");
  const available = new Set(questions.map((question) => question.id));
  const restored = savedOrder.filter((id, index) => available.has(id) && savedOrder.indexOf(id) === index);
  const restoredSet = new Set(restored);
  return [...restored, ...questions.map((question) => question.id).filter((id) => !restoredSet.has(id))];
}

export function questionsInOrder(questions: Question[], order: string[]): Question[] {
  const byId = new Map(questions.map((question) => [question.id, question]));
  return order.flatMap((id) => {
    const question = byId.get(id);
    return question ? [question] : [];
  });
}

export function filterQuestionIndexes(
  questions: Question[],
  order: string[],
  filter: QuestionTypeFilter,
): number[] {
  const ordered = questionsInOrder(questions, order);
  return ordered.flatMap((question, index) => filter === "all" || question.type === filter ? [index] : []);
}
