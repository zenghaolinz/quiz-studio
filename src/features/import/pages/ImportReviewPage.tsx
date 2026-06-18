import { useEffect, useMemo, useState } from "react";
import type { ImportDraft } from "../../../import-core/types/question-draft";
import { convertDraftToQuestionInput, validateDrafts } from "../../../import-core";
import {
  listQuestionBanks,
  createQuestionBank,
  createQuestionsBatch,
  deleteQuestionBank,
} from "../../../features/banks/api";
import type { QuestionBank } from "../../../domain/question";
import { SourcePreview } from "../components/SourcePreview";
import { QuestionDraftEditor } from "../components/QuestionDraftEditor";
import { ImportWarningPanel } from "../components/ImportWarningPanel";
import { useImportStore } from "../stores/importStore";
import { saveImportDraft } from "../importDraftPersistence";
import { suggestedBankName } from "../ocrDraft";
import { resolveImportTarget, type ImportTargetMode } from "../importTarget";

interface ImportReviewPageProps {
  draft: ImportDraft;
  onCancel: () => void;
  onImported: (bankId: string) => void;
}

export function ImportReviewPage({ draft, onCancel, onImported }: ImportReviewPageProps) {
  const { state, actions } = useImportStore(draft);
  // 页面复用且收到另一份草稿时重新载入；同一草稿编辑过程中不会被重置。
  useEffect(() => {
    if (state.draft?.id !== draft.id) actions.load(draft);
  }, [draft, state.draft?.id, actions]);
  const current = state.draft ?? draft;
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [targetMode, setTargetMode] = useState<ImportTargetMode>("new");
  const [targetBankId, setTargetBankId] = useState<string>("");
  const [newBankName, setNewBankName] = useState(() => suggestedBankName(draft.sourceName));
  const [expanded, setExpanded] = useState<number | null>(current.questions[0]?.order ?? null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validation = useMemo(() => validateDrafts(current.questions), [current.questions]);

  useEffect(() => {
    saveImportDraft(current);
  }, [current]);

  useEffect(() => {
    void loadBanks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadBanks() {
    try {
      const list = await listQuestionBanks();
      setBanks(list);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function handleImport() {
    setError(null);
    const { hasErrors } = validateDrafts(current.questions);
    if (hasErrors) {
      setError("存在错误级告警，请先修正后再导入。");
      return;
    }

    let target;
    try {
      target = resolveImportTarget(targetMode, newBankName, targetBankId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }

    setImporting(true);
    let createdBankId: string | null = null;
    try {
      // 在创建新题库之前先完成全部草稿转换，避免转换失败时留下空题库。
      const provisionalBankId = target.kind === "existing" ? target.bankId : "__pending_new_bank__";
      const prepared = current.questions.map((question) =>
        convertDraftToQuestionInput(question, provisionalBankId),
      );

      let bankId = target.kind === "existing" ? target.bankId : "";
      if (target.kind === "new") {
        const bank = await createQuestionBank({
          name: target.name,
          subject: "导入",
        });
        bankId = bank.id;
        createdBankId = bank.id;
      }

      const inputs = prepared.map((question) => ({ ...question, bankId }));
      await createQuestionsBatch(bankId, inputs);
      onImported(bankId);
    } catch (caught) {
      // 桌面端批量题目写入本身是事务；若本次流程刚创建了题库，则失败时清理空库。
      if (createdBankId) {
        try {
          await deleteQuestionBank(createdBankId);
        } catch {
          // 保留原始错误；清理失败的空库可由用户在题库页手动删除。
        }
      }
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="panel import-toolbar">
        <div className="panel-heading">
          <div><span className="eyebrow">Review</span><h2>导入预览与修正</h2></div>
          <span className="badge">{current.questions.length} 题</span>
        </div>
        <div className="toolbar-row">
          <div className="target-picker">
            <select value={targetMode} onChange={(event) => setTargetMode(event.target.value as ImportTargetMode)}>
              <option value="new">新建题库（默认）</option>
              <option value="existing">追加到已有题库</option>
            </select>
            <button type="button" className="secondary-button sm" onClick={() => void loadBanks()}>刷新题库列表</button>
            <select disabled={targetMode !== "existing"} value={targetBankId} onChange={(e) => setTargetBankId(e.target.value)}>
              <option value="">— 选择已有题库 —</option>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.name}（{b.questionCount} 题）</option>)}
            </select>
            <span className="muted">或新建：</span>
            <input disabled={targetMode !== "new"} placeholder="新题库名称" value={newBankName} onChange={(e) => setNewBankName(e.target.value)} />
          </div>
          <div className="toolbar-actions">
            <button type="button" className="ghost-button" onClick={onCancel}>取消</button>
            <button type="button" className="primary-button" disabled={importing || validation.hasErrors}
              onClick={() => void handleImport()}>
              {importing ? "正在导入…" : "确认导入"}
            </button>
          </div>
        </div>
        {validation.hasErrors ? <div className="alert error">存在 {validation.warnings.filter((w) => w.level === "error").length} 项错误，已阻断导入。请在下方逐题修正。</div> : null}
        {error ? <div className="alert error">{error}</div> : null}
      </section>

      <div className="import-split">
        <SourcePreview draft={current} selectedOrder={state.selectedOrder} onSelect={(o) => { actions.select(o); setExpanded(o); }} />
        <div className="draft-list">
          {current.questions.map((q) => (
            <QuestionDraftEditor
              key={q.id}
              draft={q}
              expanded={expanded === q.order}
              onToggle={() => setExpanded(expanded === q.order ? null : q.order)}
              actions={actions}
            />
          ))}
          {current.questions.length === 0 ? <div className="alert error">未识别到题目，请返回重新选择文件或调整题号格式。</div> : null}
        </div>
      </div>

      <ImportWarningPanel warnings={validation.warnings} />
    </div>
  );
}
