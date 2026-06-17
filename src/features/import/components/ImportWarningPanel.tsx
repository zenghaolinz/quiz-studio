import type { ImportWarning } from "../../../import-core/types/import-warning";

interface ImportWarningPanelProps {
  warnings: ImportWarning[];
}

const LEVEL_LABEL: Record<ImportWarning["level"], string> = {
  error: "错误（阻断导入）",
  warning: "警告（建议核对）",
};

/** 底部：按题分组的警告/错误面板。error 级会阻断导入。 */
export function ImportWarningPanel({ warnings }: ImportWarningPanelProps) {
  if (warnings.length === 0) {
    return (
      <div className="panel">
        <div className="panel-heading"><div><span className="eyebrow">Validation</span><h3>校验结果</h3></div>
          <span className="badge success">无问题</span></div>
        <p className="muted">所有题目通过校验，可以确认导入。</p>
      </div>
    );
  }

  const errors = warnings.filter((w) => w.level === "error");
  return (
    <div className="panel">
      <div className="panel-heading">
        <div><span className="eyebrow">Validation</span><h3>校验结果</h3></div>
        <span className={`badge ${errors.length > 0 ? "danger" : "warning"}`}>
          {errors.length > 0 ? `${errors.length} 项错误` : `${warnings.length} 项警告`}
        </span>
      </div>
      <ul className="warning-list">
        {warnings.map((w, i) => (
          <li key={i} className={`warning-item ${w.level}`}>
            <span className="warning-level">{LEVEL_LABEL[w.level]}</span>
            <span className="warning-message">{w.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
