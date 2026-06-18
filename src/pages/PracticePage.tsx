import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { PaperComposer } from "../components/PaperComposer";
import { QuestionNavigator } from "../components/QuestionNavigator";
import type { Question } from "../domain/question";
import { reconcilePaperOrder } from "../domain/paper";
import { buildQuestionOrder, questionsInOrder, type QuestionOrderMode } from "../domain/questionNavigation";
import { listQuestions } from "../features/banks/api";
import { PracticeQuestionCard } from "../features/practice/components/PracticeQuestionCard";
import { loadStudyWorkspace, removeStudyWorkspace, saveStudyWorkspace } from "../features/sessions/studyWorkspace";

interface PracticePageProps { bankId: string | null; bankName?: string; }
type ResponseMap = Record<string, unknown>;

export function PracticePage({ bankId, bankName }: PracticePageProps) {
  const [sourceQuestions, setSourceQuestions] = useState<Question[]>([]);
  const [questionOrder, setQuestionOrder] = useState<string[]>([]);
  const [orderMode, setOrderMode] = useState<QuestionOrderMode>("sequential");
  const [showComposer, setShowComposer] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<ResponseMap>({});
  const [submitted, setSubmitted] = useState<ResponseMap>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!bankId) return;
    setLoading(true); setWorkspaceReady(false); setError(null);
    listQuestions(bankId)
      .then((loaded) => {
        setSourceQuestions(loaded);
        const saved = loadStudyWorkspace("practice", bankId);
        const restoredOrder = saved ? reconcilePaperOrder(loaded, saved.questionOrder) : [];
        if (saved && restoredOrder.length > 0) {
          setQuestionOrder(restoredOrder); setOrderMode(saved.orderMode);
          setIndex(Math.min(saved.currentIndex, restoredOrder.length - 1));
          setResponses(saved.responses); setSubmitted(saved.submitted); setRevealed(saved.revealed);
          setShowComposer(false);
        } else {
          setQuestionOrder([]); setIndex(0); setResponses({}); setSubmitted({}); setRevealed({});
          setShowComposer(loaded.length > 0);
        }
        setWorkspaceReady(true);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)))
      .finally(() => setLoading(false));
  }, [bankId]);

  const questions = useMemo(() => questionsInOrder(sourceQuestions, questionOrder), [questionOrder, sourceQuestions]);
  const current = questions[index];
  const answeredIds = useMemo(() => new Set(Object.entries(responses)
    .filter(([, response]) => Array.isArray(response) ? response.some((value) => String(value).trim()) : String(response ?? "").trim())
    .map(([questionId]) => questionId)), [responses]);

  useLayoutEffect(() => {
    if (!workspaceReady || showComposer || !bankId || questionOrder.length === 0) return;
    saveStudyWorkspace({ version: 1, bankId, mode: "practice", questionOrder, orderMode, currentIndex: index, responses, submitted, revealed });
  }, [bankId, index, orderMode, questionOrder, responses, revealed, showComposer, submitted, workspaceReady]);

  function startPaper(order: string[], mode: QuestionOrderMode) {
    if (!bankId) return;
    saveStudyWorkspace({ version: 1, bankId, mode: "practice", questionOrder: order, orderMode: mode, currentIndex: 0, responses: {}, submitted: {}, revealed: {} });
    setQuestionOrder(order); setOrderMode(mode); setIndex(0); setResponses({}); setSubmitted({}); setRevealed({}); setShowComposer(false);
  }

  function clearAnswers() {
    if (!window.confirm("确定清空这套试卷的全部答案吗？试卷和题序会保留。")) return;
    setResponses({}); setSubmitted({}); setRevealed({}); setIndex(0);
  }

  function changePaper() {
    if (!bankId || !window.confirm("换卷会清空当前试卷及全部答案，确定继续吗？")) return;
    removeStudyWorkspace("practice", bankId);
    setResponses({}); setSubmitted({}); setRevealed({}); setQuestionOrder([]); setIndex(0); setShowComposer(true);
  }

  function changeOrder(mode: QuestionOrderMode) {
    if (mode === orderMode || mode === "custom") return;
    const selectedIds = new Set(questionOrder);
    const nextOrder = buildQuestionOrder(sourceQuestions.filter((question) => selectedIds.has(question.id)), mode);
    setQuestionOrder(nextOrder); setOrderMode(mode);
    setIndex(current ? Math.max(nextOrder.indexOf(current.id), 0) : 0);
  }

  if (!bankId) return <EmptyState title="还没有选择题库" description="先到题库页打开一个题库，或导入一份新题库。" />;
  if (loading) return <div className="loading-card">正在加载题目…</div>;
  if (error) return <div className="alert error">{error}</div>;
  if (sourceQuestions.length === 0) return <EmptyState title="这个题库是空的" description="导入题目后即可开始刷题。" />;
  if (showComposer) return <PaperComposer questions={sourceQuestions} bankId={bankId} modeLabel="刷题" onStart={startPaper} />;
  if (!current) return null;

  return <div className="question-layout">
    <PracticeQuestionCard
      question={current} position={index} total={questions.length}
      response={responses[current.id]} submittedResponse={submitted[current.id]} revealed={Boolean(revealed[current.id])}
      onResponseChange={(response) => setResponses((state) => ({ ...state, [current.id]: response }))}
      onSubmit={(response) => setSubmitted((state) => ({ ...state, [current.id]: response }))}
      onToggleReveal={() => setRevealed((state) => ({ ...state, [current.id]: !state[current.id] }))}
      onPrevious={() => setIndex((value) => value - 1)} onNext={() => setIndex((value) => value + 1)}
    />
    <aside className="question-side-panel">
      <span className="eyebrow">刷题模式</span><h3>{bankName ?? "即时反馈"}</h3>
      <p>单选和判断即时判定；多选与填空确认后判定。</p>
      <div className="progress-track"><span style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div>
      <small>第 {index + 1} / {questions.length} 题</small>
      <QuestionNavigator questions={questions} currentIndex={index} answeredIds={answeredIds} orderMode={orderMode} onOrderModeChange={changeOrder} onSelect={setIndex} />
      <button type="button" className="secondary-button" onClick={clearAnswers}>清空答案</button>
      <button type="button" className="text-button" onClick={changePaper}>换卷</button>
    </aside>
  </div>;
}
