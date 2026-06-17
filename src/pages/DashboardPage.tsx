import { MarkdownContent } from "../components/MarkdownContent";

const demoFormula = String.raw`数学与化学内容使用统一 Markdown 渲染：

$$
\int_0^1 x^2\,dx=\frac{1}{3}
$$

$$
\ce{2H2 + O2 -> 2H2O}
$$`;

export function DashboardPage() {
  return (
    <div className="page-stack">
      <section className="hero-card">
        <div>
          <span className="pill">本地优先 · AI 可选</span>
          <h2>把题库导入、练习、自测和解析放进一个安静的工作台。</h2>
          <p>
            当前骨架已接通 Tauri 命令层、SQLite 数据模型、基础评分以及两级 OCR 接口。
          </p>
          <div className="button-row">
            <button type="button" className="primary-button">导入第一份题库</button>
            <button type="button" className="secondary-button">创建空白题库</button>
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
            <div><span className="eyebrow">下一步</span><h3>首个纵向切片</h3></div>
          </div>
          <ol className="timeline-list">
            <li><span>1</span><div><strong>导入一张题目图片</strong><p>先用基础 OCR 或 GLM-OCR 得到 Markdown。</p></div></li>
            <li><span>2</span><div><strong>修正结构</strong><p>确认题干、选项、答案与解析。</p></div></li>
            <li><span>3</span><div><strong>写入题库</strong><p>保存到 SQLite，进入刷题模式。</p></div></li>
          </ol>
        </section>
      </div>
    </div>
  );
}
