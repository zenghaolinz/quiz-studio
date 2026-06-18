import type { Question, QuestionType } from "./question";

export interface PaperCompositionRules {
  rangeStart: number;
  rangeEnd: number;
  quotas: Partial<Record<QuestionType, number>>;
}

export function composePaper(questions: Question[], rules: PaperCompositionRules): string[] {
  const start = Math.max(1, Math.floor(rules.rangeStart));
  const end = Math.min(questions.length, Math.max(start, Math.floor(rules.rangeEnd)));
  const used = new Map<QuestionType, number>();

  return questions.flatMap((question, index) => {
    const questionNumber = index + 1;
    if (questionNumber < start || questionNumber > end) return [];
    const quota = Math.max(0, Math.floor(rules.quotas[question.type] ?? 0));
    const count = used.get(question.type) ?? 0;
    if (count >= quota) return [];
    used.set(question.type, count + 1);
    return [question.id];
  });
}

export function moveQuestion(order: string[], questionId: string, offset: -1 | 1): string[] {
  const index = order.indexOf(questionId);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= order.length) return order;
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function reconcilePaperOrder(questions: Question[], savedOrder: string[]): string[] {
  const available = new Set(questions.map((question) => question.id));
  return savedOrder.filter((id, index) => available.has(id) && savedOrder.indexOf(id) === index);
}
