import type { DocumentBlock } from "../../../import-core/types/document-block";
import type { ImportDraft } from "../../../import-core/types/question-draft";

interface SourcePreviewProps {
  draft: ImportDraft;
  selectedOrder: number | null;
  onSelect: (order: number) => void;
}

const BLOCK_GLYPH: Record<DocumentBlock["kind"], string> = {
  question_start: "№",
  option: "○",
  answer: "✓",
  explanation: "✎",
  text: "·",
};

/**
 * 左栏原文预览。
 *
 * block.kind 不能直接作为 CSS class（例如 `option`），否则会与刷题页的
 * `.option` 样式冲突，把三个 span 都压成 28px，造成中文逐字堆叠。
 */
export function SourcePreview({ draft, selectedOrder, onSelect }: SourcePreviewProps) {
  const orderAtBlock = new Map<number, number>();

  for (const question of draft.questions) {
    const range = question.sourceRange;
    if (!range) continue;
    for (let blockIndex = range.startBlock; blockIndex <= range.endBlock; blockIndex += 1) {
      orderAtBlock.set(blockIndex, question.order);
    }
  }

  return (
    <div className="source-preview">
      <div className="panel-heading source-preview-heading">
        <div>
          <span className="eyebrow">Source</span>
          <h3>原始文档</h3>
        </div>
        <span className="badge source-name-badge" title={draft.sourceName ?? draft.sourceType}>
          {draft.sourceName ?? draft.sourceType}
        </span>
      </div>

      <div className="source-lines" role="list" aria-label="原始文档内容">
        {draft.blocks.map((block) => {
          const order = orderAtBlock.get(block.index);
          const selectable = order !== undefined;
          const isSelected = selectedOrder !== null && order === selectedOrder;
          return (
            <button
              type="button"
              key={block.index}
              className={`source-line source-line--${block.kind} ${isSelected ? "selected" : ""}`}
              onClick={() => { if (order !== undefined) onSelect(order); }}
              aria-disabled={!selectable}
              tabIndex={selectable ? 0 : -1}
              title={selectable ? `定位到第 ${order} 题` : undefined}
              role="listitem"
            >
              <span className="source-line-meta" aria-hidden="true">
                <span className="block-glyph">{BLOCK_GLYPH[block.kind]}</span>
                <span className="block-line">{block.lineNumber}</span>
              </span>
              <span className="block-text">{block.rawText || block.text || " "}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
