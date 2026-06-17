import { useEffect, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import type { Question } from "../domain/question";
import { listQuestions } from "../features/banks/api";

interface TestPageProps {
  bankId: string | null;
  bankName?: string;
  onSelectBank: () => void;
}

/**
 * 自测页当前只保留真实数据入口，不再展示硬编码示例题。
 * 完整的自测会话、统一提交与计分将在后续版本实现。
 */
export function TestPage({ bankId, bankName, onSelectBank }: TestPageProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bankId) {
      setQuestions([]);
      return;
    }

    setLoading(true);
    setError(null);
    listQuestions(bankId)
      .then(setQuestions)
      .catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)))
      .finally(() => setLoading(false));
  }, [bankId]);

  if (!bankId) {
    return (
      <EmptyState
        title="还没有选择用于自测的题库"
        description="请先到题库页打开一个题库，再从题库详情进入自测。"
      />
    );
  }

  if (loading) return <div className="loading-card">正在加载题库…</div>;
  if (error) return <div className="alert error">{error}</div>;

  if (questions.length === 0) {
    return (
      <EmptyState
        title="这个题库还没有题目"
        description="导入题目后才能创建自测。"
      />
    );
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Self test</span>
            <h2>{bankName ?? "当前题库"}</h2>
          </div>
          <span className="badge">{questions.length} 道题</span>
        </div>
        <div className="alert">
          当前已经绑定真实题库，不再显示演示题。完整的随机抽题、整卷作答、统一提交和评分功能尚未实现。
        </div>
        <div className="button-row">
          <button type="button" className="secondary-button" onClick={onSelectBank}>更换题库</button>
          <button type="button" className="primary-button" disabled title="完整自测会话将在后续版本实现">
            创建自测（开发中）
          </button>
        </div>
      </section>
    </div>
  );
}
