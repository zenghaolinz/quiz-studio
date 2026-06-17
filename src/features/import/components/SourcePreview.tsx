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
 * 左栏：按 DocumentBlock 展示原文。题号行可点击选中对应草稿，
 * 让用户对照原文修正识别结果。
 */
export function SourcePreview({ draft, selectedOrder, onSelect }: SourcePreviewProps) {
  // 题号 → 该题起始 block index 的映射，用于高亮当前选中题的原文区间
  const orderAtBlock = new Map<number, number>();
  for (const q of draft.questions) {
    if (q.sourceRange) orderAtBlock.set(q.sourceRange.startBlock, q.order);
  }

  return (
    <div className="source-preview">
      <div className="panel-heading">
        <div><span className="eyebrow">Source</span><h3>原始文档</h3></div>
        <span className="badge">{draft.sourceName ?? draft.sourceType}</span>
      </div>
      <div className="source-lines">
        {draft.blocks.map((block) => {
          const order = orderAtBlock.get(block.index);
          const isStart = order !== undefined;
          const isSelected = selectedOrder !== null && isStart && order === selectedOrder;
          return (
            <button
              type="button"
              key={block.index}
              className={`source-line ${block.kind} ${isSelected ? "selected" : ""}`}
              onClick={() => isStart && order !== undefined && onSelect(order)}
              disabled={!isStart}
            >
              <span className="block-glyph" aria-hidden="true">{BLOCK_GLYPH[block.kind]}</span>
              <span className="block-line">{block.lineNumber}</span>
              <span className="block-text">{block.rawText || block.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
