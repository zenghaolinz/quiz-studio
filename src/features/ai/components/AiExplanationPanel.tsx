import { useEffect, useMemo, useRef, useState } from "react";
import type { ExplanationStyle } from "../../../domain/ai";
import type { ProviderConfig } from "../../../domain/ocr";
import type { Question } from "../../../domain/question";
import { isTauriRuntime } from "../../../lib/tauri";
import { listProviders } from "../../ocr/glmOcrApi";
import { generateQuestionExplanation } from "../api";

interface AiExplanationPanelProps {
  questions: Question[];
  onQuestionUpdated: (question: Question) => void;
  onOpenSettings: () => void;
}

interface BatchProgress {
  total: number;
  completed: number;
  failed: number;
  active: number;
}

export function AiExplanationPanel({ questions, onQuestionUpdated, onOpenSettings }: AiExplanationPanelProps) {
  const desktop = isTauriRuntime();
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [providerId, setProviderId] = useState("");
  const [style, setStyle] = useState<ExplanationStyle>("detailed");
  const [concurrency, setConcurrency] = useState(2);
  const [expanded, setExpanded] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [singleRunningId, setSingleRunningId] = useState<string | null>(null);
  const stopRequested = useRef(false);

  const llmProviders = useMemo(
    () => providers.filter((provider) => provider.kind === "llm" && provider.enabled),
    [providers],
  );
  const missingQuestions = useMemo(
    () => questions.filter((question) => !question.explanationMarkdown?.trim()),
    [questions],
  );
  const explainedCount = questions.length - missingQuestions.length;

  useEffect(() => {
    if (!desktop) return;
    setLoadingProviders(true);
    listProviders()
      .then((items) => {
        setProviders(items);
        const first = items.find((provider) => provider.kind === "llm" && provider.enabled);
        if (first) setProviderId((current) => current || first.id);
      })
      .catch((error) => setErrors([error instanceof Error ? error.message : String(error)]))
      .finally(() => setLoadingProviders(false));
  }, [desktop]);

  async function generateOne(question: Question) {
    if (!providerId || singleRunningId || running) return;
    setSingleRunningId(question.id);
    setErrors([]);
    try {
      const result = await generateQuestionExplanation({ providerId, questionId: question.id, style });
      onQuestionUpdated(result.question);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
    } finally {
      setSingleRunningId(null);
    }
  }

  async function startBatch() {
    if (!providerId || running || missingQuestions.length === 0) return;
    const queue = [...missingQuestions];
    let cursor = 0;
    stopRequested.current = false;
    setRunning(true);
    setErrors([]);
    setProgress({ total: queue.length, completed: 0, failed: 0, active: 0 });

    async function worker() {
      while (!stopRequested.current) {
        const index = cursor;
        cursor += 1;
        const question = queue[index];
        if (!question) return;
        setProgress((current) => current ? { ...current, active: current.active + 1 } : current);
        try {
          const result = await generateQuestionExplanation({ providerId, questionId: question.id, style });
          onQuestionUpdated(result.question);
          setProgress((current) => current ? {
            ...current,
            completed: current.completed + 1,
            active: Math.max(0, current.active - 1),
          } : current);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setErrors((current) => [...current, `第 ${index + 1} 个任务失败：${message}`].slice(-8));
          setProgress((current) => current ? {
            ...current,
            failed: current.failed + 1,
            active: Math.max(0, current.active - 1),
          } : current);
        }
      }
    }

    try {
      const workerCount = Math.min(Math.max(1, concurrency), queue.length);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));
    } finally {
      setRunning(false);
    }
  }

  const processed = (progress?.completed ?? 0) + (progress?.failed ?? 0);
  const percent = progress?.total ? Math.round((processed / progress.total) * 100) : 0;

  return (
    <section className="panel ai-explanation-panel">
      <div className="panel-heading ai-panel-heading">
        <div>
          <span className="eyebrow">AI Explanation</span>
          <h3>AI 补全题目解析</h3>
          <p className="help-text">已有解析 {explainedCount} 题，缺少解析 {missingQuestions.length} 题。默认只处理空解析，不覆盖原内容。</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "收起" : "配置并生成"}
        </button>
      </div>

      {expanded ? (
        <div className="ai-panel-body">
          {!desktop ? <div className="alert warning">AI 解析需要在 Tauri 桌面端运行，浏览器预览不会读取 API Key。</div> : null}
          {loadingProviders ? <div className="loading-card compact-loading">正在读取模型配置…</div> : null}
          {!loadingProviders && llmProviders.length === 0 ? (
            <div className="empty-inline">
              <span>尚未配置可用的语言模型。</span>
              <button type="button" className="text-button" onClick={onOpenSettings}>前往设置 →</button>
            </div>
          ) : null}

          {llmProviders.length > 0 ? (
            <>
              <div className="ai-config-grid">
                <label className="field-label">模型配置
                  <select value={providerId} onChange={(event) => setProviderId(event.target.value)} disabled={running}>
                    {llmProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · {provider.model}</option>)}
                  </select>
                </label>
                <label className="field-label">解析风格
                  <select value={style} onChange={(event) => setStyle(event.target.value as ExplanationStyle)} disabled={running}>
                    <option value="concise">简洁解析</option>
                    <option value="detailed">详细解析</option>
                    <option value="step_by_step">分步推导</option>
                  </select>
                </label>
                <label className="field-label">并发请求
                  <select value={concurrency} onChange={(event) => setConcurrency(Number(event.target.value))} disabled={running}>
                    <option value={1}>1（最稳妥）</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
                  </select>
                </label>
              </div>

              <div className="button-row ai-batch-actions">
                <button type="button" className="primary-button" disabled={!desktop || running || missingQuestions.length === 0 || !providerId} onClick={() => void startBatch()}>
                  {running ? "正在生成…" : `为 ${missingQuestions.length} 道缺失题生成解析`}
                </button>
                {running ? <button type="button" className="secondary-button" onClick={() => { stopRequested.current = true; }}>完成当前请求后暂停</button> : null}
              </div>

              {progress ? (
                <div className="ai-progress-card">
                  <div className="ai-progress-summary"><strong>{percent}%</strong><span>完成 {progress.completed} · 失败 {progress.failed} · 进行中 {progress.active} · 共 {progress.total}</span></div>
                  <div className="progress-track"><span style={{ width: `${percent}%` }} /></div>
                </div>
              ) : null}
            </>
          ) : null}

          {errors.map((error, index) => <div className="alert error" key={`${error}-${index}`}>{error}</div>)}

          {llmProviders.length > 0 && missingQuestions.length > 0 ? (
            <details className="ai-missing-list">
              <summary>单独生成某一道题</summary>
              <div className="ai-missing-items">
                {missingQuestions.slice(0, 50).map((question, index) => (
                  <div key={question.id} className="ai-missing-item">
                    <span>{index + 1}. {question.stemMarkdown.replace(/\s+/g, " ").slice(0, 80)}</span>
                    <button type="button" className="text-button" disabled={running || singleRunningId !== null} onClick={() => void generateOne(question)}>
                      {singleRunningId === question.id ? "生成中…" : "AI 生成"}
                    </button>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
