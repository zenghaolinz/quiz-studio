import { MarkdownContent } from "../components/MarkdownContent";

const demoFormula = String.raw`数学与化学内容使用统一 Markdown 渲染：

$$
\int_0^1 x^2\,dx=\frac{1}{3}
$$

$$
\ce{2H2 + O2 -> 2H2O}
$$`;

interface DashboardPageProps {
  onImport: () => void;
  onCreateBank: () => void;
}

export function DashboardPage({ onImport, onCreateBank }: DashboardPageProps) {
  return (
    <div className="page-stack">
      <section className="hero-card">
        <div>
          <span className="pill">本地优先 · AI 可选</span>
          <h2>把题库导入、练习、自测和解析放进一个安静的工作台。</h2>
          <p>
            当前版本已接通 Tauri 命令层、SQLite 数据模型、基础评分以及文本题库导入。
          </p>
          <div className="button-row">
            <button type="button" className="primary-button" onClick={onImport}>导入第一份题库</button>
            <button type="button" className="secondary-button" onClick={onCreateBank}>创建空白题库</button>
          </div>
        </div>
        <div className="hero-metric-grid">
          <article><strong>0</strong><span>今日练习</span></article>
          <article><strong>0%</strong><span>今日正确率</span></article>
          <article><strong>2</strong><span>OCR 引擎</span></article>
          <article><strong>Local</strong><span>数据位置</span></article>
        </div>
      </section>

      <div className="two-column-grid">
        <section className="panel">
          <div className="panel-heading">
            <div><span className="eyebrow">技术验证</span><h3>公式渲染</h3></div>
            <span className="badge success">可用</span>
          </div>
          <MarkdownContent>{demoFormula}</MarkdownContent>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div><span className="eyebrow">当前流程</span><h3>文本题库导入</h3></div>
          </div>
          <ol className="timeline-list">
            <li><span>1</span><div><strong>选择 TXT 或 Markdown</strong><p>读取文件并按题号、选项、答案标记切题。</p></div></li>
            <li><span>2</span><div><strong>修正结构</strong><p>确认题干、选项、答案与解析。</p></div></li>
            <li><span>3</span><div><strong>写入题库</strong><p>保存后可直接进入刷题模式。</p></div></li>
          </ol>
        </section>
      </div>
    </div>
  );
}
