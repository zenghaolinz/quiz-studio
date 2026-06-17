import type { ReactNode } from "react";

export type PageKey = "dashboard" | "banks" | "bank-detail" | "practice" | "test" | "ocr" | "import" | "settings";

interface AppShellProps {
  page: PageKey;
  onPageChange: (page: PageKey) => void;
  children: ReactNode;
}

const navItems: Array<{ key: PageKey; label: string; icon: string }> = [
  { key: "dashboard", label: "首页", icon: "⌂" },
  { key: "banks", label: "题库", icon: "▤" },
  { key: "practice", label: "刷题", icon: "✓" },
  { key: "test", label: "自测", icon: "◎" },
  { key: "import", label: "导入", icon: "↧" },
  { key: "ocr", label: "导入识别", icon: "◫" },
  { key: "settings", label: "设置", icon: "⚙" },
];

export function AppShell({ page, onPageChange, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">Q</div>
          <div>
            <strong>Quiz Studio</strong>
            <span>Local-first learning</span>
          </div>
        </div>
        <nav className="nav-list" aria-label="主导航">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={page === item.key ? "nav-item active" : "nav-item"}
              onClick={() => onPageChange(item.key)}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" />
          本地模式
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div>
            <span className="eyebrow">跨平台智能刷题软件</span>
            <h1>{page === "bank-detail" ? "题库详情" : (navItems.find((item) => item.key === page)?.label ?? "")}</h1>
          </div>
          <div className="topbar-actions">
            <button type="button" className="ghost-button" disabled title="全文搜索将在后续版本开放">搜索（开发中）</button>
            <div className="avatar">ZH</div>
          </div>
        </header>
        <section className="content-area">{children}</section>
      </main>
    </div>
  );
}
