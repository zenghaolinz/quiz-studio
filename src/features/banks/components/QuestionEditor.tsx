import { useState } from "react";
import type { AnswerSpec, Question, QuestionType } from "../../../domain/question";
import { updateQuestion } from "../api";

interface QuestionEditorProps {
  question: Question;
  onSaved: (question: Question) => void;
  onCancel: () => void;
}

const TYPE_OPTIONS: Array<{ value: QuestionType; label: string }> = [
  { value: "single_choice", label: "单选题" },
  { value: "multiple_choice", label: "多选题" },
  { value: "true_false", label: "判断题" },
  { value: "fill_blank", label: "填空题" },
  { value: "short_answer", label: "简答题" },
  { value: "essay", label: "论述题" },
];

function defaultAnswer(type: QuestionType): AnswerSpec {
  if (type === "single_choice" || type === "multiple_choice") return { kind: "choice", optionIds: ["a"] };
  if (type === "true_false") return { kind: "boolean", value: true };
  if (type === "fill_blank") return { kind: "blank", acceptedAnswers: [[""]], caseSensitive: false };
  return { kind: "subjective", referenceAnswerMarkdown: "", rubric: [] };
}

export function QuestionEditor({ question, onSaved, onCancel }: QuestionEditorProps) {
  const [type, setType] = useState(question.type);
  const [stem, setStem] = useState(question.stemMarkdown);
  const [options, setOptions] = useState(question.options);
  const [answer, setAnswer] = useState<AnswerSpec>(question.answer);
  const [explanation, setExplanation] = useState(question.explanationMarkdown ?? "");
  const [maxScore, setMaxScore] = useState(String(question.maxScore));
  const [tags, setTags] = useState(question.tags.join("，"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeType(next: QuestionType) {
    setType(next);
    if (next === "single_choice" || next === "multiple_choice") {
      const nextOptions = options.length >= 2 ? options : [
        { id: "a", label: "A", contentMarkdown: "" },
        { id: "b", label: "B", contentMarkdown: "" },
      ];
      setOptions(nextOptions);
      setAnswer({ kind: "choice", optionIds: [nextOptions[0].id] });
    } else {
      setOptions([]);
      setAnswer(defaultAnswer(next));
    }
  }

  function addOption() {
    const label = String.fromCharCode(65 + options.length);
    setOptions((current) => [...current, { id: crypto.randomUUID(), label, contentMarkdown: "" }]);
  }

  function removeOption(id: string) {
    if (options.length <= 2) return;
    setOptions((current) => current.filter((option) => option.id !== id));
    if (answer.kind === "choice" && answer.optionIds.includes(id)) {
      const replacement = options.find((option) => option.id !== id)?.id;
      setAnswer({ kind: "choice", optionIds: replacement ? [replacement] : [] });
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!stem.trim()) return setError("题干不能为空");
    if (answer.kind === "choice" && answer.optionIds.length === 0) return setError("请选择正确答案");
    const score = Number(maxScore);
    if (!Number.isFinite(score) || score <= 0) return setError("分值必须大于 0");
    setSaving(true);
    setError(null);
    try {
      const updated = await updateQuestion(question.id, {
        bankId: question.bankId,
        type,
        stemMarkdown: stem.trim(),
        options,
        answer,
        explanationMarkdown: explanation.trim() || undefined,
        maxScore: score,
        tags: tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
      });
      onSaved(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  const choice = answer.kind === "choice" ? answer : null;

  return (
    <form className="question-editor" onSubmit={save}>
      <div className="form-row">
        <label className="field-label">题型
          <select value={type} onChange={(event) => changeType(event.target.value as QuestionType)}>
            {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="field-label">分值
          <input type="number" min="0.1" step="0.1" value={maxScore} onChange={(event) => setMaxScore(event.target.value)} />
        </label>
      </div>
      <label className="field-label">题干
        <textarea rows={4} value={stem} onChange={(event) => setStem(event.target.value)} />
      </label>

      {choice ? <div className="draft-options">
        <span className="field-label">选项与正确答案</span>
        {options.map((option) => <div className="draft-option-row" key={option.id}>
          <input
            type={type === "multiple_choice" ? "checkbox" : "radio"}
            name={`edit-answer-${question.id}`}
            checked={choice.optionIds.includes(option.id)}
            onChange={() => setAnswer({
              kind: "choice",
              optionIds: type === "multiple_choice"
                ? choice.optionIds.includes(option.id)
                  ? choice.optionIds.filter((id) => id !== option.id)
                  : [...choice.optionIds, option.id]
                : [option.id],
            })}
          />
          <strong>{option.label}</strong>
          <input value={option.contentMarkdown} onChange={(event) => setOptions((current) => current.map((item) => item.id === option.id ? { ...item, contentMarkdown: event.target.value } : item))} />
          <button type="button" className="text-button danger" onClick={() => removeOption(option.id)}>删除</button>
        </div>)}
        <button type="button" className="secondary-button" onClick={addOption}>添加选项</button>
      </div> : null}

      {answer.kind === "boolean" ? <label className="field-label">正确答案
        <select value={answer.value ? "true" : "false"} onChange={(event) => setAnswer({ kind: "boolean", value: event.target.value === "true" })}>
          <option value="true">正确</option><option value="false">错误</option>
        </select>
      </label> : null}

      {answer.kind === "blank" ? <label className="field-label">填空答案（多个空用分号分隔，同义答案用 / 分隔）
        <textarea rows={2} value={answer.acceptedAnswers.map((group) => group.join("/")).join("；")} onChange={(event) => setAnswer({ ...answer, acceptedAnswers: event.target.value.split(/[；;]/).map((group) => group.split("/").map((value) => value.trim()).filter(Boolean)).filter((group) => group.length > 0) })} />
      </label> : null}

      {answer.kind === "subjective" ? <label className="field-label">参考答案
        <textarea rows={3} value={answer.referenceAnswerMarkdown} onChange={(event) => setAnswer({ ...answer, referenceAnswerMarkdown: event.target.value })} />
      </label> : null}

      <label className="field-label">解析
        <textarea rows={3} value={explanation} onChange={(event) => setExplanation(event.target.value)} />
      </label>
      <label className="field-label">标签
        <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="用逗号分隔" />
      </label>
      {error ? <div className="alert error">{error}</div> : null}
      <div className="toolbar-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>取消</button>
        <button type="submit" className="primary-button" disabled={saving}>{saving ? "保存中…" : "保存题目"}</button>
      </div>
    </form>
  );
}
