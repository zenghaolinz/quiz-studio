import type { DraftAnswer, QuestionDraft, QuestionDraftType } from "../../../import-core/types/question-draft";
import { MarkdownContent } from "../../../components/MarkdownContent";

const TYPE_LABELS: Array<{ value: QuestionDraftType; label: string }> = [
  { value: "single_choice", label: "单选题" },
  { value: "multiple_choice", label: "多选题" },
  { value: "true_false", label: "判断题" },
  { value: "fill_blank", label: "填空题" },
  { value: "short_answer", label: "简答题" },
  { value: "essay", label: "论述题" },
  { value: "unknown", label: "未知（待确认）" },
];

interface QuestionDraftEditorProps {
  draft: QuestionDraft;
  expanded: boolean;
  onToggle: () => void;
  actions: {
    setType: (order: number, value: QuestionDraftType) => void;
    setStem: (order: number, value: string) => void;
    setExplanation: (order: number, value: string) => void;
    addOption: (order: number) => void;
    updateOption: (order: number, optionId: string, content: string) => void;
    removeOption: (order: number, optionId: string) => void;
    setChoiceAnswer: (order: number, optionLabels: string[]) => void;
    setBooleanAnswer: (order: number, value: boolean) => void;
    setBlankAnswer: (order: number, value: string) => void;
    setSubjectiveAnswer: (order: number, markdown: string) => void;
    removeQuestion: (order: number) => void;
    splitQuestion: (order: number, blockIndex: number) => void;
  };
}

function isChoice(a: DraftAnswer): a is { kind: "choice"; optionLabels: string[] } {
  return a.kind === "choice";
}

export function QuestionDraftEditor({ draft, expanded, onToggle, actions }: QuestionDraftEditorProps) {
  const order = draft.order;
  const choiceAnswer = isChoice(draft.answer) ? draft.answer : null;
  const hasErrors = draft.warnings.length > 0;
  const isChoiceLike = draft.type === "single_choice" || draft.type === "multiple_choice";
  const isBoolean = draft.type === "true_false";
  const isBlank = draft.type === "fill_blank";
  const isSubjective = draft.type === "short_answer" || draft.type === "essay";

  return (
    <article className={`draft-card ${hasErrors ? "has-warnings" : ""} ${expanded ? "expanded" : ""}`}>
      <header className="draft-card-head" onClick={onToggle}>
        <span className="draft-order">{order + 1}</span>
        <span className="draft-type-pill">{TYPE_LABELS.find((t) => t.value === draft.type)?.label}</span>
        <span className="draft-stem-preview">{draft.stemMarkdown.slice(0, 60) || "（空题干）"}</span>
        {hasErrors ? <span className="badge warning" title={draft.warnings.join("；")}>⚠ {draft.warnings.length}</span> : null}
        <span className="draft-toggle" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
      </header>

      {expanded ? (
        <div className="draft-card-body">
          <div className="form-row">
            <label className="field-label">题型
              <select value={draft.type} onChange={(e) => actions.setType(order, e.target.value as QuestionDraftType)}>
                {TYPE_LABELS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
          </div>

          <label className="field-label">题干
            <textarea className="draft-textarea" rows={3} value={draft.stemMarkdown}
              onChange={(e) => actions.setStem(order, e.target.value)} />
          </label>

          {isChoiceLike ? (
            <div className="draft-options">
              <div className="draft-section-label">选项与正确答案</div>
              {draft.options.map((o) => {
                const checked = choiceAnswer?.optionLabels.includes(o.label) ?? false;
                return (
                  <div className="draft-option-row" key={o.id}>
                    <label className="draft-option-check">
                      <input
                        type={draft.type === "multiple_choice" ? "checkbox" : "radio"}
                        name={`answer-${order}`}
                        checked={checked}
                        onChange={() => {
                          if (draft.type === "multiple_choice") {
                            const next = checked
                              ? choiceAnswer!.optionLabels.filter((l) => l !== o.label)
                              : [...(choiceAnswer?.optionLabels ?? []), o.label];
                            actions.setChoiceAnswer(order, next);
                          } else {
                            actions.setChoiceAnswer(order, [o.label]);
                          }
                        }}
                      />
                      <span className="draft-option-label">{o.label}</span>
                    </label>
                    <input className="draft-option-input" value={o.contentMarkdown}
                      onChange={(e) => actions.updateOption(order, o.id, e.target.value)} />
                    <button type="button" className="text-button danger" onClick={() => actions.removeOption(order, o.id)}>删除</button>
                  </div>
                );
              })}
              <button type="button" className="secondary-button sm" onClick={() => actions.addOption(order)}>+ 添加选项</button>
            </div>
          ) : null}

          {isBoolean ? (
            <div className="form-row">
              <span className="field-label">正确答案</span>
              <div className="segmented-control">
                <button type="button" className={draft.answer.kind === "boolean" && draft.answer.value ? "active" : ""}
                  onClick={() => actions.setBooleanAnswer(order, true)}>对</button>
                <button type="button" className={draft.answer.kind === "boolean" && !draft.answer.value ? "active" : ""}
                  onClick={() => actions.setBooleanAnswer(order, false)}>错</button>
              </div>
            </div>
          ) : null}

          {isBlank ? (
            <label className="field-label">填空答案
              <textarea
                className="draft-textarea"
                rows={2}
                placeholder="多个空使用分号分隔，例如：ATP；线粒体"
                value={draft.answer.kind === "blank"
                  ? draft.answer.acceptedAnswers.map((answers) => answers[0] ?? "").join("；")
                  : ""}
                onChange={(e) => actions.setBlankAnswer(order, e.target.value)}
              />
            </label>
          ) : null}

          {isSubjective ? (
            <label className="field-label">参考答案
              <textarea className="draft-textarea" rows={2}
                value={draft.answer.kind === "subjective" ? draft.answer.referenceMarkdown : ""}
                onChange={(e) => actions.setSubjectiveAnswer(order, e.target.value)} />
            </label>
          ) : null}

          <label className="field-label">解析
            <textarea className="draft-textarea" rows={2} value={draft.explanationMarkdown ?? ""}
              onChange={(e) => actions.setExplanation(order, e.target.value)} />
          </label>

          {draft.warnings.length > 0 ? (
            <ul className="draft-warnings">
              {draft.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
            </ul>
          ) : null}

          <div className="draft-preview">
            <span className="eyebrow">渲染预览</span>
            <MarkdownContent>{draft.stemMarkdown || "（空题干）"}</MarkdownContent>
          </div>

          <div className="draft-card-actions">
            {draft.sourceRange && draft.sourceRange.endBlock > draft.sourceRange.startBlock ? (
              <button
                type="button"
                className="text-button"
                title="在当前题第一行后拆分，拆分后请人工检查两道题"
                onClick={() => actions.splitQuestion(order, draft.sourceRange!.startBlock + 1)}
              >
                在首行后拆分
              </button>
            ) : null}
            <button type="button" className="text-button danger" onClick={() => actions.removeQuestion(order)}>删除此题</button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
