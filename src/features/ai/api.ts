import type {
  GenerateExplanationInput,
  GenerateExplanationResult,
  GenerateSubjectiveGradeInput,
  GenerateSubjectiveGradeResult,
  ProviderTestResult,
} from "../../domain/ai";
import { invokeCommand, isTauriRuntime } from "../../lib/tauri";

export async function generateQuestionExplanation(input: GenerateExplanationInput): Promise<GenerateExplanationResult> {
  if (!isTauriRuntime()) throw new Error("AI 解析需要在 Tauri 桌面应用中运行，以安全读取 API Key。");
  return invokeCommand<GenerateExplanationResult>("generate_question_explanation", { input });
}

export async function testAiProvider(providerId: string): Promise<ProviderTestResult> {
  if (!isTauriRuntime()) throw new Error("连接测试需要在 Tauri 桌面应用中运行。");
  return invokeCommand<ProviderTestResult>("test_ai_provider", { providerId });
}

export async function generateSubjectiveGrade(
  input: GenerateSubjectiveGradeInput,
): Promise<GenerateSubjectiveGradeResult> {
  if (!isTauriRuntime()) throw new Error("AI 评分需要在 Tauri 桌面应用中运行，以安全读取 API Key。");
  return invokeCommand<GenerateSubjectiveGradeResult>("generate_subjective_grade", { input });
}
