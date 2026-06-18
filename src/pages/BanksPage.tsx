import { useEffect, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { MarkdownContent } from "../components/MarkdownContent";
import type { Question, QuestionBank } from "../domain/question";
import { AiExplanationPanel } from "../features/ai/components/AiExplanationPanel";
import { QuestionEditor } from "../features/banks/components/QuestionEditor";
import {
  createQuestionBank,
  deleteQuestion,
  deleteQuestionBank,
  listQuestionBanks,
  listQuestions,
  restoreQuestionBank,
} from "../features/banks/api";
import {
  exportPortableBank,
  importPortableBank,
  searchQuestions,
} from "../features/banks/portableBank";

interface BanksPageProps {
  onOpenBank: (bank: QuestionBank) => void;
}

export function BanksPage({ onOpenBank }: BanksPageProps) {
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [restoring, setRestoring] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setBanks(await listQuestionBanks());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setError(null);
    try {
      const bank = await createQuestionBank({ name: trimmed, subject: "未分类" });
      setBanks((current) => [bank, ...current.filter((item) => item.id !== bank.id)]);
      setName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("删除题库将同时删除其下所有题目，确定吗？")) return;
    try {
      await deleteQuestionBank(id);
      setBanks((current) => current.filter((b) => b.id !== id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function handleRestore(file: File | undefined) {
    if (!file || restoring) return;
    setRestoring(true);
    setError(null);
    try {
      const portable = importPortableBank(await file.text());
      const restored = await restoreQuestionBank(portable);
      setBanks((current) => [restored, ...current]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRestoring(false);
    }
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleBanks = normalizedQuery
    ? banks.filter((bank) => [bank.name, bank.subject ?? "", bank.description ?? ""]
      .join("\n").toLocaleLowerCase().includes(normalizedQuery))
    : banks;

  return (
    <div className="page-stack">
      <section className="panel compact-panel">
        <div className="panel-heading">
          <div><span className="eyebrow">Question banks</span><h2>题库管理</h2></div>
        </div>
        <form className="inline-form" onSubmit={handleCreate}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="输入题库名称" aria-label="题库名称" />
          <button type="submit" className="primary-button" disabled={creating || !name.trim()}>
            {creating ? "正在创建…" : "新建题库"}
          </button>
        </form>
        <div className="inline-form">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索题库名称、学科或描述" aria-label="搜索题库" />
          <label className="secondary-button file-button">
            {restoring ? "正在恢复…" : "恢复 .qbank"}
            <input type="file" accept=".qbank,application/json" disabled={restoring} onChange={(event) => { void handleRestore(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          </label>
        </div>
      </section>

      {error ? <div className="alert error">{error}</div> : null}
      {loading ? <div className="loading-card">正在读取本地题库…</div> : null}
      {!loading && banks.length === 0 ? (
        <EmptyState title="还没有题库" description="去“导入”页选一份 TXT 或 Markdown 题库，或在此新建空白题库。" />
      ) : null}
      <div className="card-grid">
        {visibleBanks.map((bank) => (
          <article className="bank-card" key={bank.id}>
            <div className="bank-icon">▤</div>
            <div>
              <span className="badge">{bank.subject || "未分类"}</span>
              <h3>{bank.name}</h3>
              <p>{bank.description || "暂无描述"}</p>
            </div>
            <footer>
              <span>{bank.questionCount} 道题</span>
              <span className="card-actions">
                <button type="button" className="text-button" onClick={() => onOpenBank(bank)}>打开 →</button>
                <button type="button" className="text-button danger" onClick={() => void handleDelete(bank.id)}>删除</button>
              </span>
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}

interface BankDetailPageProps {
  bank: QuestionBank;
  onBack: () => void;
  onPractice: () => void;
  onTest: () => void;
  onOpenSettings: () => void;
}

export function BankDetailPage({ bank, onBack, onPractice, onTest, onOpenSettings }: BankDetailPageProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listQuestions(bank.id)
      .then(setQuestions)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [bank.id]);

  async function handleDeleteQuestion(id: string) {
    try {
      await deleteQuestion(id);
      setQuestions((qs) => qs.filter((q) => q.id !== id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function handleQuestionUpdated(updated: Question) {
    setQuestions((current) => current.map((question) => question.id === updated.id ? updated : question));
  }

  function handleExport() {
    try {
      const blob = new Blob([exportPortableBank(bank, questions)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${bank.name.replace(/[\\/:*?\"<>|]/g, "_") || "题库"}.qbank`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  const visibleQuestions = searchQuestions(questions, query);

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">{bank.subject || "未分类"}</span>
            <h2>{bank.name}</h2>
          </div>
          <span className="badge">{questions.length} 题</span>
        </div>
        <div className="toolbar-row">
          <button type="button" className="ghost-button" onClick={onBack}>← 返回题库列表</button>
          <div className="toolbar-actions">
            <button type="button" className="secondary-button" disabled={questions.length === 0} onClick={handleExport}>导出 .qbank</button>
            <button type="button" className="secondary-button" disabled={questions.length === 0} onClick={onTest}>进入自测</button>
            <button type="button" className="primary-button" disabled={questions.length === 0} onClick={onPractice}>开始刷题</button>
          </div>
        </div>
        {error ? <div className="alert error">{error}</div> : null}
        {loading ? <div className="loading-card">正在加载题目…</div> : null}
        {!loading && questions.length > 0 ? <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索题干、选项、解析或标签" aria-label="搜索题目" /> : null}
      </section>

      {!loading && questions.length === 0 ? (
        <EmptyState title="这个题库还没有题目" description="去导入页添加题目。" />
      ) : null}

      {!loading && questions.length > 0 ? (
        <AiExplanationPanel
          questions={questions}
          onQuestionUpdated={handleQuestionUpdated}
          onOpenSettings={onOpenSettings}
        />
      ) : null}

      <div className="question-list">
        {visibleQuestions.map((q) => (
          <article className="panel compact-panel question-row" key={q.id}>
            <header className="question-row-head">
              <span className="badge">{TYPE_LABEL[q.type] ?? q.type}</span>
              <span className="muted">第 {questions.findIndex((question) => question.id === q.id) + 1} 题</span>
              <button type="button" className="text-button" onClick={() => setEditingQuestionId(q.id)}>编辑</button>
              <button type="button" className="text-button danger" onClick={() => void handleDeleteQuestion(q.id)}>删除</button>
            </header>
            {editingQuestionId === q.id ? (
              <QuestionEditor question={q} onCancel={() => setEditingQuestionId(null)} onSaved={(updated) => { handleQuestionUpdated(updated); setEditingQuestionId(null); }} />
            ) : <MarkdownContent>{q.stemMarkdown}</MarkdownContent>}
            {q.explanationMarkdown?.trim() ? (
              <details className="question-explanation-details">
                <summary>查看解析</summary>
                <div className="question-explanation-content">
                  <MarkdownContent>{q.explanationMarkdown}</MarkdownContent>
                </div>
              </details>
            ) : (
              <p className="missing-explanation-label">暂无解析</p>
            )}
          </article>
        ))}
      </div>
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
