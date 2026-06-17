import { useState } from "react";
import { MarkdownContent } from "../components/MarkdownContent";

export function TestPage() {
  const [answerVisible, setAnswerVisible] = useState(false);
  const [answer, setAnswer] = useState("");

  return (
    <div className="question-layout">
      <section className="question-card">
        <div className="question-meta"><span>简答题 · 10 分</span><span>8 / 10</span></div>
        <MarkdownContent>
          {"简述 PCR 反应中引物的作用，并说明为什么正向引物和反向引物需要成对设计。"}
        </MarkdownContent>
        <textarea
          className="answer-textarea"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder="在此输入你的答案……"
          rows={10}
        />
        <div className="answer-actions">
          <button type="button" className="secondary-button" onClick={() => setAnswerVisible((value) => !value)}>
            {answerVisible ? "隐藏参考答案" : "显示参考答案"}
          </button>
          <span className="muted">查看后，本题会被标记为“已查看答案”，默认不计入严格自测得分。</span>
        </div>
        {answerVisible ? (
          <div className="answer-panel warning-panel">
            <strong>参考答案</strong>
            <p>引物为 DNA 聚合酶提供具有自由 3′-OH 末端的起始点，并限定扩增片段的两个边界。正向与反向引物分别与模板两条链互补，使目标区域能够在循环中进行指数扩增。</p>
          </div>
        ) : null}
      </section>
      <aside className="question-side-panel">
        <span className="eyebrow">自测模式</span>
        <h3>提交后统一评分</h3>
        <p>客观题本地计分；主观题可按参考答案和评分点交给 AI 批改。</p>
        <button type="button" className="primary-button full-width">提交整套试卷</button>
      </aside>
    </div>
  );
}
