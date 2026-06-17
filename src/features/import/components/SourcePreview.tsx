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
 * 左栏：按 DocumentBlock 展示原文。
 *
 * 每个属于题目 sourceRange 的 block 都可用于选中对应题目，避免只有题号行可点。
 * 不再把普通行渲染成 disabled button，因为 WebView 对 disabled 按钮会附加灰度/透明度，
 * 并且在窄栏内可能出现异常的 intrinsic-size 布局。
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
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Source</span>
          <h3>原始文档</h3>
        </div>
        <span className="badge">{draft.sourceName ?? draft.sourceType}</span>
      </div>

      <div className="source-lines">
        {draft.blocks.map((block) => {
          const order = orderAtBlock.get(block.index);
          const selectable = order !== undefined;
          const isSelected = selectedOrder !== null && order === selectedOrder;

          return (
            <button
              type="button"
              key={block.index}
              className={`source-line ${block.kind} ${isSelected ? "selected" : ""}`}
              onClick={() => {
                if (order !== undefined) onSelect(order);
              }}
              aria-disabled={!selectable}
              tabIndex={selectable ? 0 : -1}
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
