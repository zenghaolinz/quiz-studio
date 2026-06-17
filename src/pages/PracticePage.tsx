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

type Submitted = Record<string, unknown>;

/**
 * 刷题模式：读真实题库，逐题作答，选中即判定（即时反馈）。
 * 客观题用 scoreObjectiveAnswer；主观题仅显示参考答案。
 * 作答仅存内存（持久化留 v0.3），但题库重启后仍在。
 */
export function PracticePage({ bankId, bankName }: PracticePageProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [submitted, setSubmitted] = useState<Submitted>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!bankId) return;
    setLoading(true);
    setError(null);
    listQuestions(bankId)
      .then((qs) => {
        setQuestions(qs);
        setIndex(0);
        setSubmitted({});
        setRevealed({});
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [bankId]);

  const current = questions[index];
  const result = useMemo(() => {
    if (!current) return null;
    if (current.answer.kind === "subjective") return null;
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
  const isBoolean = current.answer.kind === "boolean";
  const isSubjective = current.answer.kind === "subjective";

  function chooseChoice(optionId: string) {
    if (!current) return;
    if (current.answer.kind !== "choice") return;
    if (result) return; // 已判定，锁定
    if (current.type === "multiple_choice") {
      const prev = (submitted[current.id] as string[] | undefined) ?? [];
      const next = prev.includes(optionId) ? prev.filter((x) => x !== optionId) : [...prev, optionId];
      setSubmitted((s) => ({ ...s, [current.id]: next }));
    } else {
      setSubmitted((s) => ({ ...s, [current.id]: [optionId] }));
    }
  }

  return (
    <div className="question-layout">
      <section className="question-card">
        <div className="question-meta">
          <span>{TYPE_LABEL[current.type]} · {current.maxScore} 分</span>
          <span>{index + 1} / {questions.length}</span>
        </div>
        <MarkdownContent>{current.stemMarkdown}</MarkdownContent>

        <div className="option-list">
          {current.options.map((o) => {
            const chosen = isChoice && Array.isArray(submitted[current.id]) && (submitted[current.id] as string[]).includes(o.id);
            const correctOpt = result && current.answer.kind === "choice" && (current.answer as { optionIds: string[] }).optionIds.includes(o.id);
            const wrong = result && chosen && !correctOpt;
            return (
              <button type="button" key={o.id}
                className={`option ${chosen ? "selected" : ""} ${correctOpt ? "correct" : ""} ${wrong ? "wrong" : ""}`}
                disabled={!!result} onClick={() => chooseChoice(o.id)}>
                <span>{o.label}</span><MarkdownContent>{o.contentMarkdown}</MarkdownContent>
              </button>
            );
          })}
        </div>

        {isBoolean ? (
          <div className="option-list">
            {[true, false].map((v) => {
              const chosen = submitted[current.id] === v;
              const correct = result && current.answer.kind === "boolean" && (current.answer as { value: boolean }).value === v;
              const wrong = result && chosen && !correct;
              return (
                <button type="button" key={String(v)} disabled={!!result}
                  className={`option ${chosen ? "selected" : ""} ${correct ? "correct" : ""} ${wrong ? "wrong" : ""}`}
                  onClick={() => !result && setSubmitted((s) => ({ ...s, [current.id]: v }))}>
                  <span>{v ? "对" : "错"}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {result ? (
          <div className={result.correct ? "answer-panel success-panel" : "answer-panel error-panel"}>
            <strong>{result.correct ? "回答正确" : "回答错误"}</strong>
            {current.explanationMarkdown ? <MarkdownContent>{current.explanationMarkdown}</MarkdownContent> : <p>（本题无解析）</p>}
          </div>
        ) : null}

        {isSubjective ? (
          <div className="answer-actions">
            <button type="button" className="secondary-button"
              onClick={() => setRevealed((r) => ({ ...r, [current.id]: !r[current.id] }))}>
              {revealed[current.id] ? "隐藏参考答案" : "显示参考答案"}
            </button>
            {revealed[current.id] && current.answer.kind === "subjective" ? (
              <div className="answer-panel warning-panel">
                <strong>参考答案</strong>
                <MarkdownContent>{(current.answer as { referenceAnswerMarkdown: string }).referenceAnswerMarkdown}</MarkdownContent>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="question-nav">
          <button type="button" className="ghost-button" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>上一题</button>
          <button type="button" className="primary-button" disabled={index === questions.length - 1} onClick={() => setIndex((i) => i + 1)}>下一题</button>
        </div>
      </section>

      <aside className="question-side-panel">
        <span className="eyebrow">刷题模式</span>
        <h3>{bankName ?? "即时反馈"}</h3>
        <p>选中答案后立即判定，显示标准答案与解析。</p>
        <div className="progress-track"><span style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div>
        <small>第 {index + 1} / {questions.length} 题</small>
      </aside>
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  single_choice: "单选题",
  multiple_choice: "多选题",
  true_false: "判断题",
  fill_blank: "填空题",
  short_answer: "简答题",
  essay: "论述题",
};
