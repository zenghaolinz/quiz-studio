# ADR-0001：按业务纵切并限制页面体积

## 状态

已接受。

## 背景

Quiz Studio 是本地优先的桌面单体应用。随着组卷、会话恢复和 AI 能力加入，页面开始同时承担数据加载、持久化、领域判断和复杂 JSX；`PracticePage.tsx` 一度达到 365 行，Rust `db/mod.rs` 也接近 900 行。继续按页面堆功能会形成上帝组件，改动一个流程容易破坏另一个流程。

## 决策

- 保持模块化单体，不引入微服务或全局状态框架。
- `pages` 只负责流程编排和页面级状态组合，控制在 300 行以内。
- 业务 UI 放入 `features/<feature>/components`；状态与副作用放入该 feature 的 hooks/controller；纯规则放入 `domain`。
- domain 禁止依赖 React、Tauri 或浏览器 API。
- Tauri command 只做输入、权限和服务编排；AI 协议适配放 service；SQLite 访问按 banks/questions/sessions/providers 聚合拆分。
- 用自动化架构测试约束页面体积和依赖方向。

## 后果


### 正面

- 新功能沿纵向切片增加，不再扩大页面组件。
- 领域规则可以在浏览器和 Tauri 间复用并独立测试。
- 架构退化会在 CI 中直接失败。

### 负面

- 同类页面可能保留少量重复编排代码，暂不为消除重复制造超级 Hook。
- Rust 仓储拆分需要分批迁移，短期内 `db/mod.rs` 仍是已知债务。

## 备选方案

- 单一 `useStudyController`：复用高，但会聚合刷题、自测、评分和组卷，容易成为新的上帝对象，因此拒绝。
- 引入 Redux/Zustand：当前状态主要按题库和页面生命周期隔离，额外全局机制收益不足，因此暂缓。
- 微服务：本地桌面单用户场景没有部署与扩展收益，因此拒绝。

