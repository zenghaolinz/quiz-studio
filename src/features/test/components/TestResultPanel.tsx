import { useState } from "react";
import { MarkdownContent } from "../../../components/MarkdownContent";
import type { SubjectiveGrade } from "../../../domain/grading";
import type { ProviderConfig } from "../../../domain/ocr";
import type { Question } from "../../../domain/question";
import type { TestSessionSummary } from "../../../domain/session";
import { AiGradingPanel } from "../../ai/components/AiGradingPanel";
import { questionScoreLabel, totalScoreView } from "../scorePresentation";

interface Props {
  bankName?: string;
  questions: Question[];
  summary: TestSessionSummary;
  grades: Record<string, SubjectiveGrade>;
  providers: ProviderConfig[];
  onGrade: (grade: SubjectiveGrade) => Promise<void>;
  onClear: () => void;
  onChangePaper: () => void;
}

export function TestResultPanel({ bankName, questions, summary, grades, providers, onGrade, onClear, onChangePaper }: Props) {
  const [filterWrong, setFilterWrong] = useState(false);
  const visible = filterWrong
    ? summary.results.filter((result) => result.status === "wrong" || result.status === "unanswered")
    : summary.results;
  const total = totalScoreView(summary);
  return <div className="page-stack">
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Test result</span><h2>{bankName ?? "自测结果"}</h2></div><span className="badge">共 {summary.results.length} 题</span></div>
      <div className="test-total-score" role="status" aria-live="polite" aria-label={`当前总得分 ${total.score}，满分 ${total.maxScore}`}>
        <span>总得分</span><strong>{total.score}<small> / {total.maxScore}</small></strong>
        {total.pendingCount > 0 ? <em>{total.pendingCount} 道主观题待评分，总分会自动更新</em> : <em>评分已完成</em>}
      </div>
      <div className="stats-grid"><div><strong>{summary.correctCount}</strong><span>正确</span></div><div><strong>{summary.wrongCount}</strong><span>错误</span></div><div><strong>{summary.unansweredCount}</strong><span>未答</span></div><div><strong>{summary.pendingCount}</strong><span>待批改</span></div></div>
      <div className="button-row"><button type="button" className="secondary-button" onClick={() => setFilterWrong((value) => !value)}>{filterWrong ? "查看全部" : "只看错题和未答"}</button><button type="button" className="secondary-button" onClick={onClear}>清空答案重新作答</button><button type="button" className="ghost-button" onClick={onChangePaper}>换卷</button></div>
    </section>
    {visible.map((result) => {
      const question = questions.find((item) => item.id === result.questionId);
      if (!question) return null;
      return <article className="panel compact-panel" key={result.questionId}>
        <div className="question-result-heading"><span className={`badge ${result.status === "correct" || result.status === "graded" ? "success" : "warning"}`}>{STATUS[result.status]}</span><strong>{questionScoreLabel(result)}</strong></div>
        <MarkdownContent>{question.stemMarkdown}</MarkdownContent>
        {question.answer.kind === "subjective" && typeof result.response === "string" ? <AiGradingPanel question={question} response={result.response} providers={providers} grade={grades[result.questionId]} onGrade={onGrade} /> : null}
        {question.explanationMarkdown ? <MarkdownContent>{question.explanationMarkdown}</MarkdownContent> : null}
      </article>;
    })}
  </div>;
}

const STATUS = { correct: "正确", wrong: "错误", unanswered: "未答", pending: "待批改", graded: "已评分" } as const;
