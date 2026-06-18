import { MarkdownContent } from "../../../components/MarkdownContent";
import type { Question } from "../../../domain/question";
import type { TestResponses } from "../../../domain/session";

interface Props {
  question: Question;
  response: unknown;
  revealed: boolean;
  index: number;
  total: number;
  onResponse: (response: TestResponses[string]) => void;
  onToggleReference: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

export function TestQuestionCard({
  question, response, revealed, index, total, onResponse, onToggleReference, onPrevious, onNext,
}: Props) {
  const selected = Array.isArray(response) ? response.map(String) : [];
  return <section className="question-card">
    <div className="question-meta"><span>{question.maxScore} 分</span><span>{index + 1} / {total}</span></div>
    <MarkdownContent>{question.stemMarkdown}</MarkdownContent>
    {question.answer.kind === "choice" ? <div className="option-list">{question.options.map((option) =>
      <button type="button" key={option.id} className={`option ${selected.includes(option.id) ? "selected" : ""}`} onClick={() => onResponse(
        question.type === "multiple_choice"
          ? (selected.includes(option.id) ? selected.filter((id) => id !== option.id) : [...selected, option.id])
          : [option.id],
      )}><span>{option.label}</span><MarkdownContent>{option.contentMarkdown}</MarkdownContent></button>)}</div> : null}
    {question.answer.kind === "boolean" ? <div className="option-list">{[true, false].map((value) =>
      <button type="button" key={String(value)} className={`option ${response === value ? "selected" : ""}`} onClick={() => onResponse(value)}><span>{value ? "对" : "错"}</span></button>)}</div> : null}
    {question.answer.kind === "blank" ? <div className="form-stack">{question.answer.acceptedAnswers.map((_, blankIndex) =>
      <label className="field-label" key={blankIndex}>第 {blankIndex + 1} 空<input value={selected[blankIndex] ?? ""} onChange={(event) => {
        const next = [...selected]; next[blankIndex] = event.target.value; onResponse(next);
      }} /></label>)}</div> : null}
    {question.answer.kind === "subjective" ? <div className="form-stack">
      <textarea rows={8} value={typeof response === "string" ? response : ""} onChange={(event) => onResponse(event.target.value)} placeholder="输入你的答案" />
      <button type="button" className="secondary-button" onClick={onToggleReference}>{revealed ? "隐藏参考答案" : "显示参考答案"}</button>
      {revealed ? <div className="answer-panel warning-panel"><MarkdownContent>{question.answer.referenceAnswerMarkdown}</MarkdownContent></div> : null}
    </div> : null}
    <div className="question-nav">
      <button type="button" className="ghost-button" disabled={index === 0} onClick={onPrevious}>上一题</button>
      <button type="button" className="primary-button" disabled={index === total - 1} onClick={onNext}>下一题</button>
    </div>
  </section>;
}
