import { useEffect, useMemo, useState } from "react";
import { MarkdownContent } from "../components/MarkdownContent";
import { EmptyState } from "../components/EmptyState";
import { scoreObjectiveAnswer } from "../domain/scoring";
import type { Question, AnswerSpec } from "../domain/question";
import { listQuestions } from "../features/banks/api";

interface PracticePageProps {
  bankId: string | null;
  bankName?: string;
}

type ResponseMap = Record<string, unknown>;

/**
 * 刷题模式：
 * - 单选/判断：选中后立即判定；
 * - 多选/填空：编辑完成后点击“确认答案”；
 * - 主观题：保留答题框，可手动显示参考答案。
 */
export function PracticePage({ bankId, bankName }: PracticePageProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<ResponseMap>({});
  const [submitted, setSubmitted] = useState<ResponseMap>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!bankId) return;
    setLoading(true);
    setError(null);
    listQuestions(bankId)
      .then((qs) => {
        setQuestions(qs);
        setIndex(0);
        setResponses({});
        setSubmitted({});
        setRevealed({});
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [bankId]);

  const current = questions[index];
  const result = useMemo(() => {
    if (!current || current.answer.kind === "subjective") return null;
    const response = submitted[current.id];
    if (response === undefined) return null;
    return scoreObjectiveAnswer(current.answer as AnswerSpec, response, current.maxScore);
  }, [current, submitted]);

  if (!bankId) {
    return <EmptyState title="还没有选择题库" description="先到题库页打开一个题库，或导入一份新题库。" />;
  }
  if (loading) return <div className="loading-card">正在加载题目…</div>;
  if (error) return <div className="alert error">{error}</div>;
  if (questions.length === 0) {
    return <EmptyState title="这个题库是空的" description="导入题目后即可开始刷题。" />;
  }
  if (!current) return null;

  const isChoice = current.answer.kind === "choice";
  const isMultiple = current.type === "multiple_choice" && isChoice;
  const isBoolean = current.answer.kind === "boolean";
  const isBlank = current.answer.kind === "blank";
  const isSubjective = current.answer.kind === "subjective";
  const currentResponse = responses[current.id];

  function chooseChoice(optionId: string) {
    if (!current || current.answer.kind !== "choice" || result) return;
    if (current.type === "multiple_choice") {
      const previous = Array.isArray(currentResponse) ? currentResponse.filter((v): v is string => typeof v === "string") : [];
      const next = previous.includes(optionId)
        ? previous.filter((value) => value !== optionId)
        : [...previous, optionId];
      setResponses((state) => ({ ...state, [current.id]: next }));
      return;
    }

    const next = [optionId];
    setResponses((state) => ({ ...state, [current.id]: next }));
    setSubmitted((state) => ({ ...state, [current.id]: next }));
  }

  function submitCurrentResponse() {
    if (!current || result || currentResponse === undefined) return;
    setSubmitted((state) => ({ ...state, [current.id]: currentResponse }));
  }

  function setBlank(indexToUpdate: number, value: string) {
    if (!current || current.answer.kind !== "blank" || result) return;
    const count = current.answer.acceptedAnswers.length;
    const previous = Array.isArray(currentResponse)
      ? Array.from({ length: count }, (_, i) => String(currentResponse[i] ?? ""))
      : Array.from({ length: count }, () => "");
    previous[indexToUpdate] = value;
    setResponses((state) => ({ ...state, [current.id]: previous }));
  }

  const selectedChoiceIds = Array.isArray(currentResponse)
    ? currentResponse.filter((value): value is string => typeof value === "string")
    : [];

  return (
    <div className="question-layout">
      <section className="question-card">
        <div className="question-meta">
          <span>{TYPE_LABEL[current.type]} · {current.maxScore} 分</span>
          <span>{index + 1} / {questions.length}</span>
        </div>
        <MarkdownContent>{current.stemMarkdown}</MarkdownContent>

        {isChoice ? (
          <div className="option-list">
            {current.options.map((option) => {
              const chosen = selectedChoiceIds.includes(option.id);
              const correctOption = Boolean(
                result && current.answer.kind === "choice" && current.answer.optionIds.includes(option.id),
              );
              const wrong = Boolean(result && chosen && !correctOption);
              return (
                <button
                  type="button"
                  key={option.id}
                  className={`option ${chosen ? "selected" : ""} ${correctOption ? "correct" : ""} ${wrong ? "wrong" : ""}`}
                  disabled={Boolean(result)}
                  onClick={() => chooseChoice(option.id)}
                >
                  <span>{option.label}</span>
                  <MarkdownContent>{option.contentMarkdown}</MarkdownContent>
                </button>
              );
            })}
            {isMultiple ? (
              <button
                type="button"
                className="primary-button"
                disabled={Boolean(result) || selectedChoiceIds.length === 0}
                onClick={submitCurrentResponse}
              >
                确认答案
              </button>
            ) : null}
          </div>
        ) : null}

        {isBoolean ? (
          <div className="option-list">
            {[true, false].map((value) => {
              const chosen = currentResponse === value;
              const correct = Boolean(result && current.answer.kind === "boolean" && current.answer.value === value);
              const wrong = Boolean(result && chosen && !correct);
              return (
                <button
                  type="button"
                  key={String(value)}
                  disabled={Boolean(result)}
                  className={`option ${chosen ? "selected" : ""} ${correct ? "correct" : ""} ${wrong ? "wrong" : ""}`}
                  onClick={() => {
                    if (result) return;
                    setResponses((state) => ({ ...state, [current.id]: value }));
                    setSubmitted((state) => ({ ...state, [current.id]: value }));
                  }}
                >
                  <span>{value ? "对" : "错"}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {isBlank && current.answer.kind === "blank" ? (
          <div className="form-stack">
            {current.answer.acceptedAnswers.map((_, blankIndex) => {
              const values = Array.isArray(currentResponse) ? currentResponse : [];
              return (
                <label className="field-label" key={blankIndex}>
                  第 {blankIndex + 1} 空
                  <input
                    value={String(values[blankIndex] ?? "")}
                    disabled={Boolean(result)}
                    onChange={(event) => setBlank(blankIndex, event.target.value)}
                    placeholder="输入答案"
                  />
                </label>
              );
            })}
            <button
              type="button"
              className="primary-button"
              disabled={
                Boolean(result) ||
                !Array.isArray(currentResponse) ||
                currentResponse.some((value) => !String(value).trim())
              }
              onClick={submitCurrentResponse}
            >
              确认答案
            </button>
          </div>
        ) : null}

        {isSubjective && current.answer.kind === "subjective" ? (
          <div className="answer-actions subjective-answer-area">
            <textarea
              className="answer-textarea"
              rows={8}
              value={typeof currentResponse === "string" ? currentResponse : ""}
              onChange={(event) => setResponses((state) => ({ ...state, [current.id]: event.target.value }))}
              placeholder="在此输入你的答案……"
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() => setRevealed((state) => ({ ...state, [current.id]: !state[current.id] }))}
            >
              {revealed[current.id] ? "隐藏参考答案" : "显示参考答案"}
            </button>
            {revealed[current.id] ? (
              <div className="answer-panel warning-panel">
                <strong>参考答案</strong>
                <MarkdownContent>{current.answer.referenceAnswerMarkdown}</MarkdownContent>
              </div>
            ) : null}
          </div>
        ) : null}

        {result ? (
          <div className={result.correct ? "answer-panel success-panel" : "answer-panel error-panel"}>
            <strong>{result.correct ? "回答正确" : "回答错误"}</strong>
            {!result.correct ? <p><b>正确答案：</b>{formatCorrectAnswer(current)}</p> : null}
            {current.explanationMarkdown
              ? <MarkdownContent>{current.explanationMarkdown}</MarkdownContent>
              : <p>（本题无解析）</p>}
          </div>
        ) : null}

        <div className="question-nav">
          <button type="button" className="ghost-button" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}>上一题</button>
          <button type="button" className="primary-button" disabled={index === questions.length - 1} onClick={() => setIndex((value) => value + 1)}>下一题</button>
        </div>
      </section>

      <aside className="question-side-panel">
        <span className="eyebrow">刷题模式</span>
        <h3>{bankName ?? "即时反馈"}</h3>
        <p>单选和判断即时判定；多选与填空确认后判定。</p>
        <div className="progress-track"><span style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div>
        <small>第 {index + 1} / {questions.length} 题</small>
      </aside>
    </div>
  );
}

function formatCorrectAnswer(question: Question): string {
  switch (question.answer.kind) {
    case "choice":
      return question.answer.optionIds
        .map((id) => question.options.find((option) => option.id === id)?.label ?? id)
        .join("、");
    case "boolean":
      return question.answer.value ? "对" : "错";
    case "blank":
      return question.answer.acceptedAnswers
        .map((answers) => answers.join(" / "))
        .join("；");
    case "subjective":
      return question.answer.referenceAnswerMarkdown;
  }
}

const TYPE_LABEL: Record<string, string> = {
  single_choice: "单选题",
  multiple_choice: "多选题",
  true_false: "判断题",
  fill_blank: "填空题",
  short_answer: "简答题",
  essay: "论述题",
};
