interface AutoGradeContext {
  response: string;
  hasGrade: boolean;
  providerCount: number;
}

export function shouldAutoGrade({ response, hasGrade, providerCount }: AutoGradeContext): boolean {
  return response.trim().length > 0 && !hasGrade && providerCount > 0;
}
