import type { Question } from "./question";
import type { AiGradingDraft } from "./grading";

export type ExplanationStyle = "concise" | "detailed" | "step_by_step";

export interface GenerateExplanationInput {
  providerId: string;
  questionId: string;
  style: ExplanationStyle;
}

export interface GenerateExplanationResult {
  question: Question;
  providerId: string;
  model: string;
  elapsedMs: number;
}

export interface ProviderTestResult {
  ok: boolean;
  message: string;
  elapsedMs: number;
}

export interface GenerateSubjectiveGradeInput {
  providerId: string;
  questionId: string;
  response: string;
}

export type GenerateSubjectiveGradeResult = AiGradingDraft;
