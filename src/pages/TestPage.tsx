import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { MarkdownContent } from "../components/MarkdownContent";
import { QuestionNavigator } from "../components/QuestionNavigator";
import { PaperComposer } from "../components/PaperComposer";
import type { Question } from "../domain/question";
import { buildQuestionOrder, questionsInOrder, restoreQuestionOrder, type QuestionOrderMode } from "../domain/questionNavigation";
import { reconcilePaperOrder } from "../domain/paper";
import { evaluateTestSession, type TestResponses, type TestSessionSummary } from "../domain/session";
import { listQuestions } from "../features/banks/api";
import { getActiveTestSession, saveTestSession } from "../features/sessions/api";
import { loadStudyWorkspace, saveStudyWorkspace } from "../features/sessions/studyWorkspace";

interface TestPageProps { bankId: string | null; bankName?: string; onSelectBank: () => void; }

export function TestPage({ bankId, bankName, onSelectBank }: TestPageProps) {
  const [sourceQuestions, setSourceQuestions] = useState<Question[]>([]);
  const [questionOrder, setQuestionOrder] = useState<string[]>([]);
  const [orderMode, setOrderMode] = useState<QuestionOrderMode>("sequential");
  const [showComposer, setShowComposer] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [responses, setResponses] = useState<TestResponses>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [index, setIndex] = useState(0);
  const [sessionId, setSessionId] = useState<string>();
  const [summary, setSummary] = useState<TestSessionSummary | null>(null);
  const [filterWrong, setFilterWrong] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bankId) { setSourceQuestions([]); setQuestionOrder([]); return; }
    setLoading(true); setReady(false); setWorkspaceReady(false); setError(null); setSummary(null);
    Promise.all([listQuestions(bankId), getActiveTestSession(bankId)])
      .then(([loaded, active]) => {
        setSourceQuestions(loaded);
        const local = loadStudyWorkspace("test", bankId);
        const localOrder = local ? reconcilePaperOrder(loaded, local.questionOrder) : [];
        if (local) {
          setQuestionOrder(localOrder);
          setOrderMode(local.orderMode);
          setIndex(Math.min(local.currentIndex, Math.max(localOrder.length - 1, 0)));
          setResponses(local.responses);
          setRevealed(local.revealed);
          setSummary(local.summary ?? null);
          setSessionId(active?.id);
          setShowComposer(localOrder.length === 0 && loaded.length > 0);
        } else if (active) {
          const restoredOrder = restoreQuestionOrder(loaded, active.settings.questionOrder);
          setQuestionOrder(restoredOrder);
          setOrderMode(active.settings.orderMode ?? "sequential");
          setSessionId(active.id);
          setIndex(Math.min(active.settings.currentIndex ?? 0, Math.max(restoredOrder.length - 1, 0)));
          setResponses(Object.fromEntries(active.attempts.map((attempt) => [attempt.questionId, attempt.response])));
          setRevealed(Object.fromEntries(active.attempts.map((attempt) => [attempt.questionId, attempt.answerRevealed])));
          setShowComposer(false);
        } else {
          setQuestionOrder([]); setResponses({}); setRevealed({}); setSessionId(undefined); setIndex(0);
          setShowComposer(loaded.length > 0);
        }
        setWorkspaceReady(true);
        setReady(true);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)))
      .finally(() => setLoading(false));
  }, [bankId]);

  const questions = useMemo(() => questionsInOrder(sourceQuestions, questionOrder), [questionOrder, sourceQuestions]);

  useLayoutEffect(() => {
    if (!workspaceReady || showComposer || !bankId || questionOrder.length === 0) return;
    saveStudyWorkspace({
      version: 1, bankId, mode: "test", questionOrder, orderMode, currentIndex: index,
      responses, submitted: {}, revealed, summary,
    });
  }, [bankId, index, orderMode, questionOrder, responses, revealed, showComposer, summary, workspaceReady]);

  useEffect(() => {
    if (!ready || !bankId || summary || questions.length === 0) return;
    const timer = window.setTimeout(() => {
      const attempts = Object.entries(responses).map(([questionId, response]) => ({ questionId, response, answerRevealed: Boolean(revealed[questionId]) }));
      void saveTestSession({ id: sessionId, bankId, status: "in_progress", settings: { currentIndex: index, questionOrder, orderMode }, attempts })
        .then((saved) => setSessionId(saved.id))
        .catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [bankId, index, orderMode, questionOrder, questions.length, ready, responses, revealed, sessionId, summary]);

  const current = questions[index];
  const currentResponse = current ? responses[current.id] : undefined;
  const answeredCount = useMemo(() => Object.values(responses).filter((value) => value !== undefined && String(value).trim()).length, [responses]);
  const answeredIds = useMemo(() => new Set(
    Object.entries(responses)
      .filter(([, response]) => Array.isArray(response) ? response.some((value) => String(value).trim()) : String(response ?? "").trim())
      .map(([questionId]) => questionId),
  ), [responses]);

  function changeOrder(mode: QuestionOrderMode) {
    if (mode === orderMode || mode === "custom") return;
    const currentId = current?.id;
    const selectedIds = new Set(questionOrder);
    const paperQuestions = sourceQuestions.filter((question) => selectedIds.has(question.id));
    const nextOrder = buildQuestionOrder(paperQuestions, mode);
    setQuestionOrder(nextOrder);
    setOrderMode(mode);
    setIndex(currentId ? Math.max(nextOrder.indexOf(currentId), 0) : 0);
  }

  function startPaper(order: string[], mode: QuestionOrderMode) {
    if (!bankId) return;
    saveStudyWorkspace({
      version: 1, bankId, mode: "test", questionOrder: order, orderMode: mode,
      currentIndex: 0, responses: {}, submitted: {}, revealed: {}, summary: null,
    });
    setQuestionOrder(order); setOrderMode(mode); setIndex(0); setResponses({}); setRevealed({});
    setSummary(null); setSessionId(undefined); setFilterWrong(false); setShowComposer(false);
  }

  function clearAnswers() {
    if (!window.confirm("确定清空这套试卷的全部答案吗？试卷和题序会保留。")) return;
    setResponses({}); setRevealed({}); setSummary(null); setSessionId(undefined); setIndex(0); setFilterWrong(false);
  }

  function changePaper() {
    if (!bankId || !window.confirm("换卷会清空当前试卷及全部答案，确定继续吗？")) return;
    saveStudyWorkspace({
      version: 1, bankId, mode: "test", questionOrder: [], orderMode: "custom",
      currentIndex: 0, responses: {}, submitted: {}, revealed: {}, summary: null,
    });
    setQuestionOrder([]); setResponses({}); setRevealed({}); setSummary(null); setSessionId(undefined); setIndex(0);
    setShowComposer(true);
  }

  async function submit() {
    if (!bankId || saving || !window.confirm("提交后将结束本次自测，确定提交吗？")) return;
    const evaluated = evaluateTestSession(questions, responses, revealed);
    setSaving(true); setError(null);
    try {
      const attempts = evaluated.results.map((result) => ({
        questionId: result.questionId, response: result.response ?? null, answerRevealed: result.answerRevealed,
        isCorrect: result.status === "correct" ? true : result.status === "wrong" ? false : null,
        score: result.score,
      }));
      await saveTestSession({ id: sessionId, bankId, status: "submitted", settings: { currentIndex: index, questionOrder, orderMode }, score: evaluated.finalScore, maxScore: evaluated.maxScore, attempts });
      setSummary(evaluated);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }

  if (!bankId) return <EmptyState title="还没有选择用于自测的题库" description="请先到题库页打开一个题库，再从题库详情进入自测。" />;
  if (loading) return <div className="loading-card">正在恢复自测进度…</div>;
  if (error && !ready) return <div className="alert error">{error}</div>;
  if (sourceQuestions.length === 0) return <EmptyState title="这个题库还没有题目" description="导入题目后才能创建自测。" />;
  if (showComposer) return <PaperComposer questions={sourceQuestions} modeLabel="自测" onStart={startPaper} />;

  if (summary) {
    const visible = filterWrong ? summary.results.filter((result) => result.status === "wrong" || result.status === "unanswered") : summary.results;
    return <div className="page-stack">
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Test result</span><h2>{bankName ?? "自测结果"}</h2></div><span className="badge">客观题 {summary.objectiveScore} 分</span></div>
        <div className="stats-grid"><div><strong>{summary.correctCount}</strong><span>正确</span></div><div><strong>{summary.wrongCount}</strong><span>错误</span></div><div><strong>{summary.unansweredCount}</strong><span>未答</span></div><div><strong>{summary.pendingCount}</strong><span>待批改</span></div></div>
        <p>{summary.finalScore === null ? `客观题已计分；${summary.pendingCount} 道主观题待批改，暂不生成最终总分。` : `最终得分 ${summary.finalScore} / ${summary.maxScore}`}</p>
        <div className="button-row"><button type="button" className="secondary-button" onClick={() => setFilterWrong((value) => !value)}>{filterWrong ? "查看全部" : "只看错题和未答"}</button><button type="button" className="secondary-button" onClick={clearAnswers}>清空答案重新作答</button><button type="button" className="ghost-button" onClick={changePaper}>换卷</button></div>
      </section>
      {visible.map((result) => { const question = questions.find((item) => item.id === result.questionId)!; return <article className="panel compact-panel" key={result.questionId}><span className={`badge ${result.status === "correct" ? "success" : "warning"}`}>{STATUS[result.status]}</span><MarkdownContent>{question.stemMarkdown}</MarkdownContent>{question.explanationMarkdown ? <MarkdownContent>{question.explanationMarkdown}</MarkdownContent> : null}</article>; })}
    </div>;
  }

  if (!current) return null;
  const selected = Array.isArray(currentResponse) ? currentResponse.map(String) : [];
  return <div className="question-layout">
    <section className="question-card">
      <div className="question-meta"><span>{current.maxScore} 分</span><span>{index + 1} / {questions.length}</span></div>
      <MarkdownContent>{current.stemMarkdown}</MarkdownContent>
      {current.answer.kind === "choice" ? <div className="option-list">{current.options.map((option) => <button type="button" key={option.id} className={`option ${selected.includes(option.id) ? "selected" : ""}`} onClick={() => setResponses((state) => ({ ...state, [current.id]: current.type === "multiple_choice" ? (selected.includes(option.id) ? selected.filter((id) => id !== option.id) : [...selected, option.id]) : [option.id] }))}><span>{option.label}</span><MarkdownContent>{option.contentMarkdown}</MarkdownContent></button>)}</div> : null}
      {current.answer.kind === "boolean" ? <div className="option-list">{[true, false].map((value) => <button type="button" key={String(value)} className={`option ${currentResponse === value ? "selected" : ""}`} onClick={() => setResponses((state) => ({ ...state, [current.id]: value }))}><span>{value ? "对" : "错"}</span></button>)}</div> : null}
      {current.answer.kind === "blank" ? <div className="form-stack">{current.answer.acceptedAnswers.map((_, blankIndex) => <label className="field-label" key={blankIndex}>第 {blankIndex + 1} 空<input value={selected[blankIndex] ?? ""} onChange={(event) => { const next = [...selected]; next[blankIndex] = event.target.value; setResponses((state) => ({ ...state, [current.id]: next })); }} /></label>)}</div> : null}
      {current.answer.kind === "subjective" ? <div className="form-stack"><textarea rows={8} value={typeof currentResponse === "string" ? currentResponse : ""} onChange={(event) => setResponses((state) => ({ ...state, [current.id]: event.target.value }))} placeholder="输入你的答案"/><button type="button" className="secondary-button" onClick={() => setRevealed((state) => ({ ...state, [current.id]: !state[current.id] }))}>{revealed[current.id] ? "隐藏参考答案" : "显示参考答案"}</button>{revealed[current.id] ? <div className="answer-panel warning-panel"><MarkdownContent>{current.answer.referenceAnswerMarkdown}</MarkdownContent></div> : null}</div> : null}
      <div className="question-nav"><button type="button" className="ghost-button" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}>上一题</button><button type="button" className="primary-button" disabled={index === questions.length - 1} onClick={() => setIndex((value) => value + 1)}>下一题</button></div>
    </section>
    <aside className="question-side-panel"><span className="eyebrow">自测模式</span><h3>{bankName}</h3><p>已答 {answeredCount} / {questions.length}，作答自动保存。</p><div className="progress-track"><span style={{ width: `${(answeredCount / questions.length) * 100}%` }} /></div><QuestionNavigator questions={questions} currentIndex={index} answeredIds={answeredIds} orderMode={orderMode} onOrderModeChange={changeOrder} onSelect={setIndex} /><button type="button" className="primary-button" disabled={saving} onClick={() => void submit()}>{saving ? "提交中…" : "统一提交"}</button><button type="button" className="secondary-button" onClick={clearAnswers}>清空答案</button><button type="button" className="text-button" onClick={changePaper}>换卷</button><button type="button" className="text-button" onClick={onSelectBank}>更换题库</button>{error ? <div className="alert error">{error}</div> : null}</aside>
  </div>;
}

const STATUS = { correct: "正确", wrong: "错误", unanswered: "未答", pending: "待批改" } as const;
