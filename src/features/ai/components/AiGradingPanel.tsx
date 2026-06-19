import { useEffect, useRef, useState } from "react";
import type { SubjectiveGrade } from "../../../domain/grading";
import { applyGradingDraft } from "../../../domain/grading";
import type { ProviderConfig } from "../../../domain/ocr";
import type { Question } from "../../../domain/question";
import { generateSubjectiveGrade } from "../api";
import { shouldAutoGrade } from "../gradingPolicy";

interface Props {
  question: Question;
  response: string;
  providers: ProviderConfig[];
  grade?: SubjectiveGrade;
  onGrade: (grade: SubjectiveGrade) => Promise<void>;
}

export function AiGradingPanel({ question, response, providers, grade, onGrade }: Props) {
  const [providerId, setProviderId] = useState(providers[0]?.id ?? "");
  const [draft, setDraft] = useState<Awaited<ReturnType<typeof generateSubjectiveGrade>> | null>(null);
  const [score, setScore] = useState(grade?.score ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const automaticAttempted = useRef(false);

  useEffect(() => {
    if (automaticAttempted.current || !shouldAutoGrade({ response, hasGrade: Boolean(grade), providerCount: providers.length })) return;
    automaticAttempted.current = true;
    void generate();
  }, [grade, providers.length, response]);

  async function generate() {
    if (!providerId || busy) return;
    setBusy(true); setError(null);
    try {
      const next = await generateSubjectiveGrade({ providerId, questionId: question.id, response });
      setDraft(next); setScore(next.suggestedScore);
      await onGrade(applyGradingDraft(next));
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  }

  async function saveAdjustment() {
    if (!draft || busy) return;
    setBusy(true); setError(null);
    try { await onGrade(applyGradingDraft(draft, new Date().toISOString(), score)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  }

  if (grade && !draft) return <div className="answer-panel">
    <strong>AI 评分：{grade.score} / {grade.maxScore}</strong>
    <p>{grade.feedbackMarkdown}</p>
    <button type="button" className="text-button" onClick={() => { setDraft(grade); setScore(grade.score); }}>重新评分或调整</button>
  </div>;

  return <div className="answer-panel form-stack">
    <label className="field-label">评分模型<select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
      <option value="">请选择已启用的语言模型</option>
      {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.model}</option>)}
    </select></label>
    {!draft ? <button type="button" className="secondary-button" disabled={!providerId || !response.trim() || busy} onClick={() => void generate()}>{busy ? "自动评分中…" : error ? "重新评分" : "AI 评分"}</button> : <>
      <p>{draft.feedbackMarkdown}</p>
      {draft.criteria.map((criterion, index) => <div key={criterion.rubricId ?? `${criterion.title}-${index}`}><strong>{criterion.title}：{criterion.awardedPoints} / {criterion.maxPoints}</strong><p>{criterion.feedback}</p></div>)}
      <label className="field-label">确认分数（可调整）<input type="number" min={0} max={draft.maxScore} step="0.5" value={score} onChange={(event) => setScore(Number(event.target.value))} /></label>
      {grade ? <div className="alert success">AI 建议分已自动计入总分。</div> : null}
      <div className="button-row"><button type="button" className="secondary-button" disabled={busy || score === grade?.score} onClick={() => void saveAdjustment()}>{busy ? "保存中…" : "保存分数调整"}</button><button type="button" className="text-button" disabled={busy} onClick={() => void generate()}>重新评分</button></div>
      <small>
        {providers.find((provider) => provider.id === draft.providerId)?.name ?? draft.providerId} · {draft.model} · {draft.elapsedMs} ms
        {draft.estimatedInputTokens && draft.estimatedOutputTokens
          ? ` · 估算 ${draft.estimatedInputTokens + draft.estimatedOutputTokens} tokens（输入 ${draft.estimatedInputTokens} / 输出 ${draft.estimatedOutputTokens}）`
          : ""}
      </small>
    </>}
    {providers.length === 0 ? <div className="alert warning">请先在设置中添加并启用语言模型 Provider。</div> : null}
    {error ? <div className="alert error">{error}</div> : null}
  </div>;
}
