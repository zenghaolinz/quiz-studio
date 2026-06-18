import { useMemo } from "react";
import { MarkdownContent } from "../../../components/MarkdownContent";
import type { AnswerSpec, Question } from "../../../domain/question";
import { scoreObjectiveAnswer } from "../../../domain/scoring";

interface PracticeQuestionCardProps {
  question: Question;
  position: number;
  total: number;
  response: unknown;
  submittedResponse: unknown;
  revealed: boolean;
  onResponseChange: (response: unknown) => void;
  onSubmit: (response: unknown) => void;
  onToggleReveal: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

export function PracticeQuestionCard(props: PracticeQuestionCardProps) {
  const { question, position, total, response, submittedResponse } = props;
  const result = useMemo(() => {
    if (question.answer.kind === "subjective" || submittedResponse === undefined) return null;
    return scoreObjectiveAnswer(question.answer as AnswerSpec, submittedResponse, question.maxScore);
  }, [question, submittedResponse]);
  const selectedIds = Array.isArray(response) ? response.filter((value): value is string => typeof value === "string") : [];

  function chooseChoice(optionId: string) {
    if (question.answer.kind !== "choice" || result) return;
    if (question.type === "multiple_choice") {
      const next = selectedIds.includes(optionId) ? selectedIds.filter((id) => id !== optionId) : [...selectedIds, optionId];
      props.onResponseChange(next);
      return;
    }
    props.onResponseChange([optionId]);
    props.onSubmit([optionId]);
  }

  function setBlank(blankIndex: number, value: string) {
    if (question.answer.kind !== "blank" || result) return;
    const next = Array.from({ length: question.answer.acceptedAnswers.length }, (_, index) =>
      Array.isArray(response) ? String(response[index] ?? "") : "",
    );
    next[blankIndex] = value;
    props.onResponseChange(next);
  }

  return <section className="question-card">
    <div className="question-meta"><span>{TYPE_LABEL[question.type]} · {question.maxScore} 分</span><span>{position + 1} / {total}</span></div>
    <MarkdownContent>{question.stemMarkdown}</MarkdownContent>

    {question.answer.kind === "choice" ? <div className="option-list">
      {question.options.map((option) => {
        const chosen = selectedIds.includes(option.id);
        const correct = Boolean(result && question.answer.kind === "choice" && question.answer.optionIds.includes(option.id));
        return <button type="button" key={option.id} className={`option ${chosen ? "selected" : ""} ${correct ? "correct" : ""} ${result && chosen && !correct ? "wrong" : ""}`} disabled={Boolean(result)} onClick={() => chooseChoice(option.id)}><span>{option.label}</span><MarkdownContent>{option.contentMarkdown}</MarkdownContent></button>;
      })}
      {question.type === "multiple_choice" ? <button type="button" className="primary-button" disabled={Boolean(result) || selectedIds.length === 0} onClick={() => props.onSubmit(response)}>确认答案</button> : null}
    </div> : null}

    {question.answer.kind === "boolean" ? <div className="option-list">
      {[true, false].map((value) => {
        const chosen = response === value;
        const correct = Boolean(result && question.answer.kind === "boolean" && question.answer.value === value);
        return <button type="button" key={String(value)} disabled={Boolean(result)} className={`option ${chosen ? "selected" : ""} ${correct ? "correct" : ""} ${result && chosen && !correct ? "wrong" : ""}`} onClick={() => { props.onResponseChange(value); props.onSubmit(value); }}><span>{value ? "对" : "错"}</span></button>;
      })}
    </div> : null}

    {question.answer.kind === "blank" ? <div className="form-stack">
      {question.answer.acceptedAnswers.map((_, blankIndex) => <label className="field-label" key={blankIndex}>第 {blankIndex + 1} 空<input value={Array.isArray(response) ? String(response[blankIndex] ?? "") : ""} disabled={Boolean(result)} onChange={(event) => setBlank(blankIndex, event.target.value)} placeholder="输入答案" /></label>)}
      <button type="button" className="primary-button" disabled={Boolean(result) || !Array.isArray(response) || response.some((value) => !String(value).trim())} onClick={() => props.onSubmit(response)}>确认答案</button>
    </div> : null}

    {question.answer.kind === "subjective" ? <div className="answer-actions subjective-answer-area">
      <textarea className="answer-textarea" rows={8} value={typeof response === "string" ? response : ""} onChange={(event) => props.onResponseChange(event.target.value)} placeholder="在此输入你的答案……" />
      <button type="button" className="secondary-button" onClick={props.onToggleReveal}>{props.revealed ? "隐藏参考答案" : "显示参考答案"}</button>
      {props.revealed ? <div className="answer-panel warning-panel"><strong>参考答案</strong><MarkdownContent>{question.answer.referenceAnswerMarkdown}</MarkdownContent></div> : null}
    </div> : null}

    {result ? <div className={result.correct ? "answer-panel success-panel" : "answer-panel error-panel"}><strong>{result.correct ? "回答正确" : "回答错误"}</strong>{!result.correct ? <p><b>正确答案：</b>{formatCorrectAnswer(question)}</p> : null}{question.explanationMarkdown ? <MarkdownContent>{question.explanationMarkdown}</MarkdownContent> : <p>（本题无解析）</p>}</div> : null}
    <div className="question-nav"><button type="button" className="ghost-button" disabled={position === 0} onClick={props.onPrevious}>上一题</button><button type="button" className="primary-button" disabled={position === total - 1} onClick={props.onNext}>下一题</button></div>
  </section>;
}

function formatCorrectAnswer(question: Question): string {
  switch (question.answer.kind) {
    case "choice": return question.answer.optionIds.map((id) => question.options.find((option) => option.id === id)?.label ?? id).join("、");
    case "boolean": return question.answer.value ? "对" : "错";
    case "blank": return question.answer.acceptedAnswers.map((answers) => answers.join(" / ")).join("；");
    case "subjective": return question.answer.referenceAnswerMarkdown;
  }
}

const TYPE_LABEL: Record<Question["type"], string> = {
  single_choice: "单选题", multiple_choice: "多选题", true_false: "判断题",
  fill_blank: "填空题", short_answer: "简答题", essay: "论述题",
};
