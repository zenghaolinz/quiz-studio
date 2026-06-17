import { useEffect, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { MarkdownContent } from "../components/MarkdownContent";
import type { Question, QuestionBank } from "../domain/question";
import {
  createQuestionBank,
  deleteQuestion,
  deleteQuestionBank,
  listQuestionBanks,
  listQuestions,
} from "../features/banks/api";

interface BanksPageProps {
  onOpenBank: (bank: QuestionBank) => void;
}

export function BanksPage({ onOpenBank }: BanksPageProps) {
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

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
      </section>

      {error ? <div className="alert error">{error}</div> : null}
      {loading ? <div className="loading-card">正在读取本地题库…</div> : null}
      {!loading && banks.length === 0 ? (
        <EmptyState title="还没有题库" description="去“导入”页选一份 TXT 或 Markdown 题库，或在此新建空白题库。" />
      ) : null}
      <div className="card-grid">
        {banks.map((bank) => (
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
}

export function BankDetailPage({ bank, onBack, onPractice }: BankDetailPageProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          <button type="button" className="primary-button" disabled={questions.length === 0} onClick={onPractice}>开始刷题</button>
        </div>
        {error ? <div className="alert error">{error}</div> : null}
        {loading ? <div className="loading-card">正在加载题目…</div> : null}
      </section>

      {!loading && questions.length === 0 ? (
        <EmptyState title="这个题库还没有题目" description="去导入页添加题目。" />
      ) : null}

      <div className="question-list">
        {questions.map((q, i) => (
          <article className="panel compact-panel question-row" key={q.id}>
            <header className="question-row-head">
              <span className="badge">{TYPE_LABEL[q.type] ?? q.type}</span>
              <span className="muted">第 {i + 1} 题</span>
              <button type="button" className="text-button danger" onClick={() => void handleDeleteQuestion(q.id)}>删除</button>
            </header>
            <MarkdownContent>{q.stemMarkdown}</MarkdownContent>
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
