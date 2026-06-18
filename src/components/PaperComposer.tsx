import { useMemo, useState } from "react";
import type { Question, QuestionType } from "../domain/question";
import { composePaper, moveQuestion } from "../domain/paper";
import { buildQuestionOrder, type QuestionOrderMode } from "../domain/questionNavigation";

interface PaperComposerProps {
  questions: Question[];
  modeLabel: string;
  onStart: (questionOrder: string[], orderMode: QuestionOrderMode) => void;
}

const TYPE_LABEL: Record<QuestionType, string> = {
  single_choice: "单选题",
  multiple_choice: "多选题",
  true_false: "判断题",
  fill_blank: "填空题",
  short_answer: "简答题",
  essay: "论述题",
};

export function PaperComposer({ questions, modeLabel, onStart }: PaperComposerProps) {
  const presentTypes = useMemo(() => [...new Set(questions.map((question) => question.type))], [questions]);
  const initialQuotas = useMemo(() => Object.fromEntries(
    presentTypes.map((type) => [type, questions.filter((question) => question.type === type).length]),
  ) as Partial<Record<QuestionType, number>>, [presentTypes, questions]);
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(questions.length);
  const [quotas, setQuotas] = useState(initialQuotas);
  const [selectedOrder, setSelectedOrder] = useState(() => questions.map((question) => question.id));
  const [startMode, setStartMode] = useState<QuestionOrderMode>("custom");

  const questionById = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);
  const selectedSet = useMemo(() => new Set(selectedOrder), [selectedOrder]);
  const candidates = questions.filter((_, index) => index + 1 >= rangeStart && index + 1 <= rangeEnd);

  function applyRules() {
    setSelectedOrder(composePaper(questions, { rangeStart, rangeEnd, quotas }));
    setStartMode("custom");
  }

  function toggleQuestion(questionId: string) {
    setSelectedOrder((current) => current.includes(questionId)
      ? current.filter((id) => id !== questionId)
      : [...current, questionId]);
    setStartMode("custom");
  }

  function start() {
    const selectedQuestions = questions.filter((question) => selectedSet.has(question.id));
    const order = startMode === "custom"
      ? selectedOrder
      : buildQuestionOrder(selectedQuestions, startMode);
    onStart(order, startMode);
  }

  return (
    <div className="page-stack paper-composer-page">
      <section className="panel">
        <div className="panel-heading">
          <div><span className="eyebrow">Paper composer</span><h2>组一套{modeLabel}试卷</h2></div>
          <span className="badge">已选 {selectedOrder.length} / {questions.length}</span>
        </div>
        <p className="muted-copy">先按题号范围和题型数量快速选题，再精确勾选并调整题目顺序。</p>

        <div className="paper-rule-grid">
          <label className="field-label">起始题号<input type="number" min={1} max={questions.length} value={rangeStart} onChange={(event) => setRangeStart(Math.max(1, Math.min(Number(event.target.value), rangeEnd)))} /></label>
          <label className="field-label">结束题号<input type="number" min={rangeStart} max={questions.length} value={rangeEnd} onChange={(event) => setRangeEnd(Math.max(rangeStart, Math.min(Number(event.target.value), questions.length)))} /></label>
          {presentTypes.map((type) => (
            <label className="field-label" key={type}>{TYPE_LABEL[type]}数量
              <input type="number" min={0} value={quotas[type] ?? 0} onChange={(event) => setQuotas((current) => ({ ...current, [type]: Math.max(0, Number(event.target.value)) }))} />
            </label>
          ))}
        </div>
        <button type="button" className="secondary-button" onClick={applyRules}>按条件选题</button>
      </section>

      <div className="paper-composer-columns">
        <section className="panel compact-panel">
          <div className="panel-heading"><h3>范围内题目</h3><small>{candidates.length} 道</small></div>
          <div className="paper-candidate-list">
            {candidates.map((question) => {
              const number = questions.indexOf(question) + 1;
              return <label key={question.id} className="paper-candidate-row"><input type="checkbox" checked={selectedSet.has(question.id)} onChange={() => toggleQuestion(question.id)} /><span className="badge">{TYPE_LABEL[question.type]}</span><strong>第 {number} 题</strong><span>{question.stemMarkdown.replace(/[#*_`$]/g, "").slice(0, 42)}</span></label>;
            })}
          </div>
        </section>

        <section className="panel compact-panel">
          <div className="panel-heading"><h3>试卷题序</h3><small>可手动调整</small></div>
          <div className="paper-order-list">
            {selectedOrder.map((questionId, index) => {
              const question = questionById.get(questionId);
              if (!question) return null;
              const originalNumber = questions.indexOf(question) + 1;
              return <div className="paper-order-row" key={questionId}><span>{index + 1}</span><div><strong>原第 {originalNumber} 题 · {TYPE_LABEL[question.type]}</strong><small>{question.stemMarkdown.replace(/[#*_`$]/g, "").slice(0, 34)}</small></div><button type="button" aria-label={`上移试卷第 ${index + 1} 题`} disabled={index === 0} onClick={() => { setSelectedOrder((current) => moveQuestion(current, questionId, -1)); setStartMode("custom"); }}>↑</button><button type="button" aria-label={`下移试卷第 ${index + 1} 题`} disabled={index === selectedOrder.length - 1} onClick={() => { setSelectedOrder((current) => moveQuestion(current, questionId, 1)); setStartMode("custom"); }}>↓</button></div>;
            })}
          </div>
        </section>
      </div>

      <section className="panel paper-start-bar">
        <div><strong>开始时题序</strong><div className="segmented-control paper-order-mode"><button type="button" className={startMode === "custom" ? "active" : ""} onClick={() => setStartMode("custom")}>自定</button><button type="button" className={startMode === "sequential" ? "active" : ""} onClick={() => setStartMode("sequential")}>原题序</button><button type="button" className={startMode === "random" ? "active" : ""} onClick={() => setStartMode("random")}>乱序</button></div></div>
        <button type="button" className="primary-button" disabled={selectedOrder.length === 0} onClick={start}>开始{modeLabel}</button>
      </section>
    </div>
  );
}
