import { useMemo, useState } from "react";
import type { Question, QuestionType } from "../domain/question";
import type { QuestionOrderMode, QuestionTypeFilter } from "../domain/questionNavigation";

interface QuestionNavigatorProps {
  questions: Question[];
  currentIndex: number;
  answeredIds: Set<string>;
  orderMode: QuestionOrderMode;
  onOrderModeChange: (mode: QuestionOrderMode) => void;
  onSelect: (index: number) => void;
}

const TYPE_LABEL: Record<QuestionTypeFilter, string> = {
  all: "全部",
  single_choice: "单选",
  multiple_choice: "多选",
  true_false: "判断",
  fill_blank: "填空",
  short_answer: "简答",
  essay: "论述",
};

export function QuestionNavigator({
  questions,
  currentIndex,
  answeredIds,
  orderMode,
  onOrderModeChange,
  onSelect,
}: QuestionNavigatorProps) {
  const [typeFilter, setTypeFilter] = useState<QuestionTypeFilter>("all");
  const availableTypes = useMemo(() => {
    const types = new Set(questions.map((question) => question.type));
    return (["all", ...types] as QuestionTypeFilter[]);
  }, [questions]);

  return (
    <div className="question-navigator">
      <div className="navigator-heading">
        <strong>题型与题序</strong>
        <small>点击题号直接跳转</small>
      </div>

      <div className="segmented-control navigator-order" aria-label="题目顺序">
        {orderMode === "custom" ? <button type="button" className="active" disabled>自定</button> : null}
        <button type="button" className={orderMode === "sequential" ? "active" : ""} onClick={() => onOrderModeChange("sequential")}>顺序</button>
        <button type="button" className={orderMode === "random" ? "active" : ""} onClick={() => onOrderModeChange("random")}>乱序</button>
      </div>

      <div className="navigator-types" aria-label="按题型筛选">
        {availableTypes.map((type) => (
          <button
            type="button"
            key={type}
            className={typeFilter === type ? "active" : ""}
            onClick={() => setTypeFilter(type)}
          >
            {TYPE_LABEL[type]}
          </button>
        ))}
      </div>

      <div className="question-number-grid">
        {questions.map((question, index) => typeFilter === "all" || question.type === typeFilter ? (
          <button
            type="button"
            key={question.id}
            className={`${index === currentIndex ? "active" : ""} ${answeredIds.has(question.id) ? "answered" : ""}`}
            aria-label={`第 ${index + 1} 题${answeredIds.has(question.id) ? "，已答" : ""}`}
            onClick={() => onSelect(index)}
          >
            {index + 1}
          </button>
        ) : null)}
      </div>
      <div className="navigator-legend"><span><i className="current-dot" />当前</span><span><i className="answered-dot" />已答</span></div>
    </div>
  );
}
