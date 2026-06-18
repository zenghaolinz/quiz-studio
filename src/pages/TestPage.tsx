import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { QuestionNavigator } from "../components/QuestionNavigator";
import { PaperComposer } from "../components/PaperComposer";
import { applySubjectiveGrades, type SubjectiveGrade } from "../domain/grading";
import type { ProviderConfig } from "../domain/ocr";
import type { Question } from "../domain/question";
import { buildQuestionOrder, questionsInOrder, restoreQuestionOrder, type QuestionOrderMode } from "../domain/questionNavigation";
import { reconcilePaperOrder } from "../domain/paper";
import { evaluateTestSession, type TestResponses, type TestSessionSummary } from "../domain/session";
import { listQuestions } from "../features/banks/api";
import { listProviders } from "../features/ocr/glmOcrApi";
import { getActiveTestSession, saveTestSession } from "../features/sessions/api";
import { loadStudyWorkspace, saveStudyWorkspace } from "../features/sessions/studyWorkspace";
import { TestQuestionCard } from "../features/test/components/TestQuestionCard";
import { TestResultPanel } from "../features/test/components/TestResultPanel";
import { createGradeSaveQueue } from "../features/test/gradeSaveQueue";
import { isTauriRuntime } from "../lib/tauri";

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
  const [grades, setGrades] = useState<Record<string, SubjectiveGrade>>({});
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gradesRef = useRef(grades);
  const summaryRef = useRef(summary);
  const enqueueGradeSave = useRef(createGradeSaveQueue()).current;

  useEffect(() => { gradesRef.current = grades; }, [grades]);
  useEffect(() => { summaryRef.current = summary; }, [summary]);

  useEffect(() => {
    if (!bankId) { setSourceQuestions([]); setQuestionOrder([]); return; }
    setLoading(true); setReady(false); setWorkspaceReady(false); setError(null); setSummary(null);
    Promise.all([listQuestions(bankId), getActiveTestSession(bankId), isTauriRuntime() ? listProviders() : Promise.resolve([])])
      .then(([loaded, active, loadedProviders]) => {
        setProviders(loadedProviders.filter((provider) => provider.kind === "llm" && provider.enabled));
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
          setGrades(local.grades ?? {});
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
          setGrades({}); setShowComposer(false);
        } else {
          setQuestionOrder([]); setResponses({}); setRevealed({}); setGrades({}); setSessionId(undefined); setIndex(0);
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
      grades,
    });
  }, [bankId, grades, index, orderMode, questionOrder, responses, revealed, showComposer, summary, workspaceReady]);

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
      grades: {},
    });
    setQuestionOrder(order); setOrderMode(mode); setIndex(0); setResponses({}); setRevealed({});
    setSummary(null); setGrades({}); setSessionId(undefined); setShowComposer(false);
  }

  function clearAnswers() {
    if (!window.confirm("确定清空这套试卷的全部答案吗？试卷和题序会保留。")) return;
    setResponses({}); setRevealed({}); setSummary(null); setGrades({}); setSessionId(undefined); setIndex(0);
  }

  function changePaper() {
    if (!bankId || !window.confirm("换卷会清空当前试卷及全部答案，确定继续吗？")) return;
    saveStudyWorkspace({
      version: 1, bankId, mode: "test", questionOrder: [], orderMode: "custom",
      currentIndex: 0, responses: {}, submitted: {}, revealed: {}, summary: null,
      grades: {},
    });
    setQuestionOrder([]); setResponses({}); setRevealed({}); setSummary(null); setGrades({}); setSessionId(undefined); setIndex(0);
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
        aiGrading: grades[result.questionId] ?? null,
      }));
      await saveTestSession({ id: sessionId, bankId, status: "submitted", settings: { currentIndex: index, questionOrder, orderMode }, score: evaluated.finalScore, maxScore: evaluated.maxScore, attempts });
      setSummary(evaluated);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  }

  async function saveGrade(grade: SubjectiveGrade) {
    return enqueueGradeSave(async () => {
      const currentSummary = summaryRef.current;
      if (!bankId || !currentSummary) return;
      const nextGrades = { ...gradesRef.current, [grade.questionId]: grade };
      const nextSummary = applySubjectiveGrades(currentSummary, nextGrades);
      const attempts = nextSummary.results.map((result) => ({
        questionId: result.questionId,
        response: result.response ?? null,
        answerRevealed: result.answerRevealed,
        isCorrect: result.status === "correct" ? true : result.status === "wrong" ? false : null,
        score: result.score,
        aiGrading: nextGrades[result.questionId] ?? null,
      }));
      const saved = await saveTestSession({
        id: sessionId, bankId, status: "submitted",
        settings: { currentIndex: index, questionOrder, orderMode },
        score: nextSummary.finalScore, maxScore: nextSummary.maxScore, attempts,
      });
      gradesRef.current = nextGrades; summaryRef.current = nextSummary;
      setSessionId(saved.id); setGrades(nextGrades); setSummary(nextSummary);
    });
  }

  if (!bankId) return <EmptyState title="还没有选择用于自测的题库" description="请先到题库页打开一个题库，再从题库详情进入自测。" />;
  if (loading) return <div className="loading-card">正在恢复自测进度…</div>;
  if (error && !ready) return <div className="alert error">{error}</div>;
  if (sourceQuestions.length === 0) return <EmptyState title="这个题库还没有题目" description="导入题目后才能创建自测。" />;
  if (showComposer) return <PaperComposer questions={sourceQuestions} bankId={bankId} modeLabel="自测" onStart={startPaper} />;

  if (summary) {
    return <TestResultPanel bankName={bankName} questions={questions} summary={summary} grades={grades} providers={providers} onGrade={saveGrade} onClear={clearAnswers} onChangePaper={changePaper} />;
  }

  if (!current) return null;
  return <div className="question-layout">
    <TestQuestionCard question={current} response={currentResponse} revealed={Boolean(revealed[current.id])} index={index} total={questions.length} onResponse={(response) => setResponses((state) => ({ ...state, [current.id]: response }))} onToggleReference={() => setRevealed((state) => ({ ...state, [current.id]: !state[current.id] }))} onPrevious={() => setIndex((value) => value - 1)} onNext={() => setIndex((value) => value + 1)} />
    <aside className="question-side-panel"><span className="eyebrow">自测模式</span><h3>{bankName}</h3><p>已答 {answeredCount} / {questions.length}，作答自动保存。</p><div className="progress-track"><span style={{ width: `${(answeredCount / questions.length) * 100}%` }} /></div><QuestionNavigator questions={questions} currentIndex={index} answeredIds={answeredIds} orderMode={orderMode} onOrderModeChange={changeOrder} onSelect={setIndex} /><button type="button" className="primary-button" disabled={saving} onClick={() => void submit()}>{saving ? "提交中…" : "统一提交"}</button><button type="button" className="secondary-button" onClick={clearAnswers}>清空答案</button><button type="button" className="text-button" onClick={changePaper}>换卷</button><button type="button" className="text-button" onClick={onSelectBank}>更换题库</button>{error ? <div className="alert error">{error}</div> : null}</aside>
  </div>;
}
