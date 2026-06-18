# AI 主观题评分架构设计

主观题评分采用“AI 给出结构化评分并自动计分”的模式。服务返回包含建议分数、逐评分点结果、反馈和模型元数据的评分草稿；前端验证成功后立即采用建议分并重新计算总分，用户仍可重新评分或手动调整。

前端按纵切组织：`domain/grading.ts` 定义评分草案和边界校验；`features/ai/api.ts` 只负责 IPC；`features/ai/gradingPolicy.ts` 决定自动触发条件；`features/ai/components/AiGradingPanel.tsx` 只负责评分交互；`features/test/components` 负责结果展示。`TestPage` 仍只编排会话。

后端由 AI service 构建提示词、调用现有 Provider 适配层并解析严格 JSON。command 加载题目与 Provider，验证题目确为主观题和答案非空，然后返回草案，不直接写库。前端验证并采用的评分结果随会话 attempt 持久化；数据库迁移增加评分详情 JSON，避免把反馈塞进 response。

失败策略：无评分点时使用题目满分和参考答案整体评分；模型分数越界时拒绝而不是截断；网络或解析失败不影响本地自测提交并保留待批改状态；显示 Provider、模型、耗时，并允许重试。API Key 继续只从系统密钥存储读取。
