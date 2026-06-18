# 跨平台智能刷题软件技术设计书

**版本：** 0.1（基础框架审阅版）  
**日期：** 2026-06-17  
**状态：** 待产品与技术审核  
**代码代号：** Quiz Studio（临时代号，可更换）

---

## 1. 文档目的

本文档定义一款本地优先、PC 端首发并为移动端预留迁移路径的智能刷题软件。首个产品版本应完成以下闭环：

1. 用户导入 DOCX、TXT、Markdown、PDF 或图片题库；
2. 软件提取文档内容并生成结构化题目草稿；
3. 用户在导入校正工作台中确认题目、选项、答案、解析与公式；
4. 题目写入本地题库；
5. 用户进入刷题模式或自测模式；
6. 客观题由本地评分器判定；
7. 主观题可查看参考答案，也可以由用户配置的 AI 服务评分；
8. 软件保存练习历史、错题和自测结果。

本文档同时说明基础代码骨架中已经实现的能力、暂未实现的能力和后续开发顺序，避免把接口预留误认为完整产品功能。

---

## 2. 产品原则

### 2.1 本地优先

题库、作答记录、错题、收藏、导入草稿和用户设置默认保存在本机。无网络时，除云端 OCR、AI 解析和 AI 批改外，其余核心功能应正常工作。

### 2.2 AI 可替换而不是强绑定

软件不绑定单一模型厂商。用户可以配置主流云端 API、本地 OpenAI-compatible 服务或专用 OCR 服务。AI 只负责增强功能，不应成为题库打开、答题或客观题评分的单点故障。

### 2.3 导入结果必须可校正

DOCX、PDF 和图片题库格式高度不统一。软件不能将自动识别结果静默写入正式题库。所有自动切题结果先进入草稿区，经过校验和用户确认后再落库。

### 2.4 轻量不等于功能简陋

主程序不捆绑大型模型、Python 环境或完整 Chromium。高性能 OCR 作为按需组件或独立服务接入；前端保持现代阅读器式视觉，不采用传统后台管理系统的密集表格风格。

### 2.5 可迁移而不是假设零成本跨平台

Tauri 2 可以共享前端与大部分 Rust 业务代码，但移动端的文件选择、安全存储、分享、后台任务和插件仍可能需要 Kotlin/Swift 适配。因此本项目将跨平台能力封装在接口层，而不是在业务组件中直接调用桌面专用 API。

---

## 3. 版本范围

### 3.1 首版必须完成

- 本地题库新建、编辑、删除、搜索和导入；
- 单选、多选、判断、填空、简答、论述/计算题；
- 刷题模式即时判定；
- 自测模式统一提交与评分；
- 主观题“显示答案”按钮及查看状态记录；
- 客观题本地评分；
- AI 生成解析；
- AI 按参考答案和评分点批改主观题；
- Markdown、LaTeX 和常用化学式渲染；
- 基础 OCR 与 GLM-OCR 双引擎；
- Windows 正式构建，macOS/Linux 构建验证；
- 题库导出与恢复。

### 3.2 首版不完成

- 用户账号和云同步；
- 在线题库市场；
- 班级、教师和多人协作后台；
- 正式 Android/iOS 发布；
- 完整有机化学结构编辑器；
- 对任意扫描公式承诺百分之百自动还原；
- 大型模型自动微调；
- 自动生成整套试卷的高级排版系统。

---

## 4. 技术栈

### 4.1 客户端

| 层级 | 选择 | 说明 |
|---|---|---|
| 桌面/移动容器 | Tauri 2 | 系统 WebView + Rust 后端，支持主流桌面和移动平台 |
| 前端 | React 19 + TypeScript | 组件生态成熟，适合复杂导入校正界面 |
| 构建 | Vite 8 | 开发启动快，适合 Tauri 前端 |
| 样式 | 原生 CSS Variables + 组件样式 | 首个骨架减少依赖；成熟后可引入 Radix primitives |
| 内容渲染 | react-markdown + remark-math + rehype-katex | 统一 Markdown 与数学公式 |
| 化学式 | KaTeX mhchem | 支持常见分子式、离子、电荷和反应箭头 |
| 基础 OCR | Tesseract.js | WASM、CPU 可用、无需 Python/CUDA |
| 本地数据库 | SQLite + Rust rusqlite | 前端不直接执行 SQL |
| HTTP | Rust reqwest | 统一超时、鉴权、日志脱敏和协议适配 |
| 密钥 | 系统密钥库适配器 | API Key 不写入 SQLite |

Tauri 使用系统 WebView 渲染 HTML/JavaScript，并通过消息传递调用 Rust API。Windows 开发需要 Microsoft C++ Build Tools 与 WebView2。Tauri 的移动插件在需要时可以使用 Kotlin/Java 和 Swift 实现原生部分。[1][2][3]

### 4.2 服务端

首版没有中心业务服务器。可选服务仅包括：

- 用户自行连接的模型厂商 API；
- 用户本地或远程部署的 GLM-OCR 服务；
- 后期可选的同步服务。

这使项目在没有运营服务器的情况下仍可发布完整离线版本。

---

## 5. 总体架构

```text
┌─────────────────────────────────────────────────────────┐
│ React UI                                                 │
│ 题库 / 导入校正 / 刷题 / 自测 / 错题 / AI 设置          │
└────────────────────────┬────────────────────────────────┘
                         │ Tauri IPC（结构化命令）
┌────────────────────────▼────────────────────────────────┐
│ Rust Application Core                                   │
│ Commands / Validation / Import Orchestrator / Scoring   │
│ Provider Adapters / SecretStore / File & Asset Service  │
└───────────────┬─────────────────────┬───────────────────┘
                │                     │
       ┌────────▼────────┐   ┌────────▼──────────────────┐
       │ SQLite + Assets │   │ External AI/OCR Services │
       │ 题库/记录/草稿  │   │ GLM-OCR / LLM Provider  │
       └─────────────────┘   └───────────────────────────┘
```

### 5.1 分层约束

1. React 页面不能直接执行 SQL；
2. React 页面不能直接读取系统密钥；
3. Rust 命令只暴露业务语义，例如“新建题库”，不暴露“执行任意 SQL”；
4. 导入器统一输出 `QuestionDraft[]`；
5. OCR 引擎统一输出 `OcrDocument`；
6. AI 厂商差异只能存在于 Adapter 层；
7. 评分核心不依赖 React 或 Tauri，可以独立测试；
8. 文件路径不作为长期资源标识，正式题库使用附件 ID 与内容哈希。

---

## 6. 两级 OCR 方案

### 6.1 基础 OCR：Tesseract.js

Tesseract.js 是 Tesseract 的 JavaScript/WebAssembly 版本，可运行在浏览器或 Node.js 环境，支持多语言、方向检测和文字边界信息。[4]

本项目使用它作为最低配置兜底，目标不是替代高性能文档模型，而是满足以下场景：

- 清晰截图；
- 普通印刷中文和英文；
- 简单选择题；
- 无复杂表格、公式和多栏排版的页面；
- 用户没有 GPU、没有 Python，也没有配置云端 OCR。

运行策略：

1. Tesseract.js 运行时代码跟随前端依赖；
2. 中英文语言包首次使用时按需下载；
3. 下载后缓存到应用数据目录；
4. Worker 在连续识别任务之间复用；
5. 用户离开导入流程或内存压力过高时终止 Worker；
6. 低置信度结果提示切换 GLM-OCR 或人工复核。

限制：

- 不能可靠还原复杂 LaTeX；
- 对多栏、嵌套表格和题号错位处理有限；
- 中文扫描件准确率高度依赖清晰度；
- 不能直接承担完整 PDF 版面恢复。

因此基础 OCR 的输出永远进入“待校正草稿”，不能直接成为正式题目。

### 6.2 高性能 OCR：zai-org/GLM-OCR

GLM-OCR 是面向复杂文档理解的多模态 OCR 模型。官方模型说明其使用 CogViT 视觉编码器、轻量跨模态连接器和 GLM-0.5B 解码器，整体约 0.9B 参数；完整流水线结合 PP-DocLayout-V3 做版面分析和区域并行识别。[5]

官方仓库提供以下部署路径：[5]

- 云端 MaaS；
- vLLM；
- SGLang；
- Ollama；
- Apple Silicon 的 MLX；
- GLM-OCR SDK Server。

官方 BF16 模型权重文件约 2.65 GB，因此不应默认塞进桌面安装包。[6]

### 6.3 推荐接入：GLM-OCR SDK Server

主程序通过 HTTP 调用独立服务：

```http
POST /glmocr/parse
Content-Type: application/json
Authorization: Bearer <optional>
```

```json
{
  "images": ["data:image/png;base64,..."]
}
```

选择 SDK Server 而不是只调用原始模型的原因：

- 可利用官方版面分析；
- 可并行识别多个区域；
- 可直接获得 Markdown 与 JSON 版面结果；
- GPU 服务和桌面应用生命周期解耦；
- 同一服务可被多台电脑使用；
- 将来可以把服务放到局域网或云端。

### 6.4 OCR 路由策略

默认路由：

```text
文本型 PDF ────────────────► 直接提取文本层
扫描 PDF / 图片 ──┬────────► Tesseract.js（普通文字、低成本）
                  └────────► GLM-OCR（复杂版面、公式、表格）
```

自动建议规则：

- 图片存在多栏或表格：建议 GLM-OCR；
- 基础 OCR 平均置信度低于阈值：建议 GLM-OCR；
- 用户选择“保留公式与版面”：建议 GLM-OCR；
- 大批量简单截图：先基础 OCR，失败页再升级；
- 涉及隐私且用户不允许上传：仅本地基础 OCR 或本地 GLM-OCR。

### 6.5 后续组件管理器

模型管理器作为独立里程碑开发：

- 检测 GPU、显存、系统和可用推理框架；
- 下载模型与依赖；
- 校验 SHA-256；
- 管理 vLLM/SGLang/Ollama/SDK Server；
- 健康检查；
- 端口冲突处理；
- 服务崩溃恢复；
- 卸载模型但保留题库；
- 清晰展示磁盘占用。

基础框架当前只实现服务协议，不伪装为已经拥有完整模型下载器。

---

## 7. 题库导入架构

### 7.1 导入阶段

```text
源文件
  ↓
Source Reader
  ↓
DocumentBlock[]
  ↓
文本/版面标准化
  ↓
题目切分规则 + 可选 AI 辅助
  ↓
QuestionDraft[]
  ↓
校验器
  ↓
导入校正工作台
  ↓
正式 Question[]
```

### 7.2 统一文档块

```ts
export type DocumentBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; markdown: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; rows: string[][] }
  | { kind: "image"; assetId: string; alt?: string }
  | { kind: "formula"; latex?: string; assetId?: string }
  | { kind: "page_break"; page: number };
```

所有文件格式先转换为该结构。题目切分器不直接依赖 DOCX、PDF 或图片实现。

### 7.3 各格式处理

#### TXT

- 检测编码；
- 按行读取；
- 识别题号、选项、答案和解析标记；
- 保留原始行号。

#### Markdown

- 解析标题、列表、图片、代码块和数学公式；
- 禁止执行 HTML 和脚本；
- 外部图片默认不自动下载。

#### DOCX

- 提取段落、列表、表格和嵌入图片；
- 使用样式和编号信息辅助判断题号；
- 不追求像素级复刻 Word 页面；
- 原文件保留，方便对照。

#### PDF

- 优先读取文本层；
- 保留页码与坐标；
- 无文本层页面渲染为图片后 OCR；
- 表格、公式和图片保留来源区域；
- 文本提取顺序异常时切换版面 OCR。

#### 图片

- 预处理：方向纠正、裁边、缩放、对比度增强；
- 调用选择的 OCR 引擎；
- 保存原始图片和识别结果。

### 7.4 自动切题

规则优先，AI 辅助其次。规则包括：

- `1.`、`1、`、`1．`、`（1）`、`第 1 题`；
- `A.`、`A、`、`A．`、`（A）`；
- `答案：`、`正确答案：`；
- `解析：`、`解：`；
- `参考答案：`、`评分标准：`；
- 文末集中答案表。

规则匹配必须记录置信度和来源位置。AI 只输出结构化草稿，不直接写库。

### 7.5 导入校正工作台

PC 端采用左右双栏：

- 左侧：原始页面、文本或图片；
- 右侧：结构化题目草稿；
- 顶部：页码、错误数、题目数和导入状态；
- 底部：上一处异常、下一处异常、确认导入。

支持：

- 合并/拆分题目；
- 修改题型；
- 重排选项；
- 修改正确答案；
- 手动输入 LaTeX；
- 将公式区域保留为图片；
- 批量应用规则；
- 标记未解决问题；
- 保存草稿并稍后继续。

---

## 8. 题目领域模型

### 8.1 题型

```ts
export type QuestionType =
  | "single_choice"
  | "multiple_choice"
  | "true_false"
  | "fill_blank"
  | "short_answer"
  | "essay";
```

数据模型预留 `parentId`，后续支持材料题和多个小问。

### 8.2 选项

正确答案不能保存为显示序号 `A/B/C/D`，必须保存稳定选项 ID。随机打乱选项时，答案仍能正确匹配。

```ts
interface QuestionOption {
  id: string;
  label: string;
  contentMarkdown: string;
}
```

### 8.3 答案

答案使用判别联合：

```ts
export type AnswerSpec =
  | { kind: "choice"; optionIds: string[] }
  | { kind: "boolean"; value: boolean }
  | {
      kind: "blank";
      acceptedAnswers: string[][];
      caseSensitive: boolean;
    }
  | {
      kind: "subjective";
      referenceAnswerMarkdown: string;
      rubric: RubricItem[];
    };
```

每一个填空可以保存多个等价答案。后续增加：

- 数值误差；
- 单位换算；
- 正则表达式；
- 顺序无关的多空答案；
- 同义词集合。

### 8.4 评分点

```ts
interface RubricItem {
  id: string;
  title: string;
  points: number;
  description?: string;
}
```

AI 批改优先依据明确评分点，而不是只比较用户答案与一段参考答案的文本相似度。

---

## 9. 数据库设计

SQLite 数据库位于应用数据目录，启用外键和 WAL。

### 9.1 主要表

- `question_banks`：题库元数据；
- `questions`：题目主体；
- `provider_configs`：不含 API Key 的模型配置；
- `import_jobs`：导入任务与草稿；
- `test_sessions`：刷题/自测会话；
- `attempts`：每题作答；
- 后续增加 `assets`、`source_files`、`tags`、`question_tags`、`ai_generations`。

### 9.2 JSON 与普通列

以下字段独立建列：

- ID；
- 题库 ID；
- 题型；
- 题干；
- 分数；
- 难度；
- 来源页；
- 创建/更新时间。

题型特有字段使用 JSON：

- 选项；
- 答案；
- 标签；
- AI 批改结果；
- 会话设置。

这样可以兼顾查询性能和题型扩展。

### 9.3 迁移

正式版不允许只有一个 `CREATE TABLE IF NOT EXISTS` 文件。应使用有版本号的迁移：

```text
0001_initial.sql
0002_assets.sql
0003_import_drafts.sql
...
```

每次发布前必须测试：

- 空数据库升级；
- 上一正式版本升级；
- 升级中断恢复；
- 数据库备份恢复。

基础骨架暂时使用单一 schema，方便审阅；进入功能开发后第一项工作就是替换为正式迁移器。

---

## 10. 刷题与自测

### 10.1 刷题模式

客观题选中或提交后立即：

- 判断对错；
- 标出用户答案；
- 显示标准答案；
- 展示题库解析；
- 提供 AI 生成解析；
- 写入作答记录和错题状态。

主观题不自动宣称“正确”或“错误”，可执行：

- 查看参考答案；
- AI 对比；
- 自评掌握程度；
- 加入稍后复习。

### 10.2 自测模式

开始前设置：

- 题库范围；
- 题型；
- 数量；
- 随机选题；
- 打乱选项；
- 限时；
- 分值；
- 主观题 AI 批改开关。

提交后统一评分。

### 10.3 主观题显示答案

自测中保留“显示参考答案”按钮。点击时立刻写入：

```json
{
  "answerRevealed": true,
  "revealedAt": "2026-06-17T12:00:00+09:00"
}
```

默认策略：该题不计入严格自测总分，但可以显示参考得分。后续设置可选：

- 查看后记 0 分；
- 查看后从总分中排除；
- 继续计分但标记为非严格自测。

默认采用第二项。

### 10.4 客观题评分

基础代码已经实现：

- 单选/多选完全匹配；
- 判断题布尔比较；
- 填空题去除首尾空白、合并连续空格；
- 可配置大小写敏感；
- 主观题禁止误走客观评分器。

后续需增加部分得分和数值误差策略。

---

## 11. AI Provider 架构

### 11.1 协议层

```ts
export type ProviderProtocol =
  | "openai_compatible"
  | "anthropic_messages"
  | "gemini_native"
  | "glm_sdk";
```

OCR 专用 `glm_sdk` 与通用 LLM 协议分开，避免把所有服务强行伪装为完全相同的 OpenAI API。

### 11.2 配置

```ts
interface ProviderConfig {
  id: string;
  name: string;
  kind: "ocr" | "llm";
  protocol: ProviderProtocol;
  baseUrl: string;
  model: string;
  enabled: boolean;
}
```

API Key 通过 `provider.id` 作为密钥引用保存在系统密钥库，SQLite 只保存非敏感配置。

### 11.3 能力矩阵

后续应记录：

- 文本；
- 图片；
- 流式输出；
- JSON Schema；
- 最大输入；
- 最大输出；
- 是否支持自定义 Header；
- 是否支持本地文件或只接受 URL/data URL。

### 11.4 错误标准化

所有 Provider 错误映射到统一类别：

- `AUTH_ERROR`；
- `RATE_LIMITED`；
- `MODEL_NOT_FOUND`；
- `TIMEOUT`；
- `INVALID_RESPONSE`；
- `CONTEXT_TOO_LONG`；
- `NETWORK_ERROR`；
- `SERVER_ERROR`。

UI 不直接显示一大段底层堆栈。

---

## 12. AI 生成解析

输入：

- 题干；
- 选项；
- 标准答案；
- 题型；
- 现有解析；
- 学科；
- 解析详细程度。

输出使用结构化结果：

```json
{
  "summary": "一句话结论",
  "stepsMarkdown": "分步解析",
  "optionAnalysis": [
    { "optionId": "A", "comment": "为什么错误" }
  ],
  "finalAnswerMarkdown": "最终答案",
  "warnings": []
}
```

数学要求使用 `$...$` 或 `$$...$$`；化学式使用 `\ce{...}`。AI 输出先通过 Schema 校验和 HTML 清洗，再展示。用户确认后才覆盖题库解析。

缓存键应包含：

```text
question_hash + answer_hash + provider + model + prompt_version + mode
```

---

## 13. AI 主观题批改

### 13.1 输入

- 题目；
- 参考答案；
- 评分点；
- 满分；
- 用户答案；
- 是否查看过答案；
- 学科；
- 评分严格度。

### 13.2 输出

```json
{
  "score": 8,
  "maxScore": 10,
  "criteria": [
    {
      "rubricId": "r1",
      "score": 3,
      "maxScore": 3,
      "comment": "关键概念完整"
    }
  ],
  "strengths": [],
  "missingPoints": [],
  "feedbackMarkdown": "",
  "confidence": 0.82,
  "needsReview": false
}
```

### 13.3 保护规则

- 分数限制在 0 到满分；
- 评分点分数之和需与总分一致；
- 非法 JSON 自动修复或重试一次；
- 低置信度标记人工复核；
- 保存 Provider、模型、Prompt 版本和时间；
- 用户可修改最终得分；
- AI 原始分和用户修订分分别保存；
- 已查看答案的题目不能伪装为严格闭卷得分。

---

## 14. 数学与化学渲染

正式内容统一为 Markdown：

```markdown
函数为 $f(x)=x^2+2x+1$。

$$
\int_0^1 x^2\,dx=\frac{1}{3}
$$

$$
\ce{2H2 + O2 -> 2H2O}
$$
```

渲染链：

```text
Markdown
  ├─ remark-math
  ├─ rehype-katex
  ├─ KaTeX CSS
  └─ mhchem extension
```

安全要求：

- 禁止任意脚本；
- 禁止 iframe；
- 外部链接显示来源；
- 外部图片默认不加载；
- 导入 HTML 必须清洗；
- AI 输出与用户题库都按不可信内容处理。

复杂公式 OCR 失败时可以保留公式截图，并允许用户随后替换为 LaTeX。

---

## 15. 前端结构

```text
src/
├─ components/           通用 UI
├─ domain/               题目、答案、评分与 OCR 类型
├─ features/
│  ├─ banks/
│  ├─ import/
│  ├─ ocr/
│  ├─ practice/
│  ├─ test/
│  └─ providers/
├─ pages/                页面组合
├─ lib/                  Tauri IPC、错误与工具
└─ styles/               Design Tokens 与全局样式
```

基础骨架使用页面状态切换，正式版应引入路由与状态管理，但不应在领域模型中依赖路由库。

### 15.1 视觉方向

- 阅读器式大留白；
- 题干处于视觉中心；
- 弱边框、轻阴影；
- 不把每个字段都包成卡片；
- 深色模式使用统一变量；
- 主要功能不依赖鼠标悬停；
- 触摸目标不小于移动端建议尺寸；
- 长公式可横向滚动，不挤压整个布局。

---

## 16. Rust 后端结构

```text
src-tauri/src/
├─ commands/             Tauri 命令
├─ db/                   SQLite 与迁移
├─ services/             GLM-OCR、未来 AI/导入服务
├─ error.rs              统一错误
├─ models.rs             IPC DTO
├─ state.rs              Database、SecretStore、HTTP Client
└─ lib.rs                应用启动和命令注册
```

当前实现：

- 应用数据目录初始化；
- SQLite 外键与 WAL；
- 新建/列出题库；
- 新建/列出题目；
- Provider 配置；
- 系统密钥库；
- GLM-OCR SDK/OpenAI-compatible 调用；
- 基础健康检查。

### 16.1 IPC 示例

```ts
const banks = await invoke<QuestionBank[]>("list_question_banks");
```

Rust：

```rust
#[tauri::command]
pub fn list_question_banks(
    state: State<'_, AppState>,
) -> Result<Vec<QuestionBank>, String> {
    state.database.list_question_banks().map_err(command_error)
}
```

UI 只知道“列出题库”，不知道底层 SQL。

---

## 17. 安全设计

### 17.1 密钥

- API Key 不写入 SQLite；
- 不写入 `.env` 正式包；
- 不进入题库导出；
- 不进入日志；
- 不返回给前端读取；
- 设置页空白表示不修改已有 Key。

### 17.2 文件

- 检查 MIME 与扩展名；
- 限制文件大小和页数；
- 文档转换在受控目录进行；
- 解压 DOCX 时防止 Zip Slip；
- 禁止宏执行；
- 使用内容哈希去重；
- 临时文件任务结束后清理。

### 17.3 网络

- Rust HTTP Client 统一超时；
- 可配置是否允许 HTTP；
- 非本机 HTTP 服务显示不安全提示；
- 云端上传前提示数据范围；
- 生产日志不保存完整请求体；
- 后续加入证书错误和代理配置。

### 17.4 内容

- Markdown/HTML 清洗；
- 禁止脚本和事件属性；
- AI 输出不可信；
- LaTeX 渲染失败时显示原文；
- 远程图片需用户确认。

---

## 18. 性能目标

首版建议目标：

| 场景 | 目标 |
|---|---|
| 冷启动到主界面 | 2 秒内（常规 SSD PC） |
| 一万道题题库打开 | 1 秒级 |
| 本地题目搜索 | 200 ms 内返回首屏 |
| 客观题判定 | 用户无感 |
| 页面切换 | 不重新初始化 OCR Worker |
| OCR | 后台任务，可取消，有进度 |
| 导入大文件 | 分页/分块，不阻塞 UI |
| 数据库写入 | 事务批量提交 |

需要避免：

- 把整份 PDF 所有页面同时转成高分辨率位图；
- 每一页都重新创建 Tesseract Worker；
- 在 React 状态中长期保存巨大的 base64；
- 每答一题都同步重写整份 JSON 文件；
- 在主线程进行大规模图片预处理。

基础骨架为了展示 IPC 使用 data URL；正式批量导入应改为文件/资产 ID，避免大图片经过 IPC 复制。

---

## 19. 测试策略

### 19.1 单元测试

- 客观题评分；
- 填空归一化；
- Provider URL 拼接；
- GLM-OCR 返回解析；
- 文档切题规则；
- 数据迁移；
- 查看答案计分策略。

### 19.2 集成测试

- 新建题库并写入题目；
- 应用重启后数据存在；
- Provider Key 不出现在 SQLite；
- GLM-OCR Mock 服务返回 Markdown；
- OCR 失败不破坏导入草稿；
- 自测中断后恢复。

### 19.3 Fixture 题库

必须维护固定样本：

- 简单 TXT；
- 标准 Markdown；
- 选项在表格中的 DOCX；
- 文末集中答案 PDF；
- 扫描 PDF；
- 数学公式截图；
- 化学方程式截图；
- 多栏试卷；
- 低清晰度照片；
- 错误格式题库。

每次修改导入器都跑回归测试，防止修复一种题库却破坏另一种。

---

## 20. 发布与跨平台

### 20.1 Windows 首发

- 生成 MSI 或 NSIS 安装包；
- 配置应用图标和签名；
- 数据目录与安装目录分离；
- 卸载默认不删除用户题库；
- 提供备份/恢复入口；
- 模型组件单独管理。

### 20.2 macOS/Linux

- 验证窗口、文件选择、密钥库与中文字体；
- macOS 完成签名与公证后再公开分发；
- Linux 处理不同桌面环境的密钥库可用性。

### 20.3 移动端预留

业务接口保持一致：

- `FilePicker`；
- `SecretStore`；
- `AssetStore`；
- `OcrEngine`；
- `ShareService`。

移动端可替换实现，不修改题库和评分领域层。移动端正式开发前需要重新设计导入校正工作台，不能简单缩小 PC 双栏界面。

---

## 21. 开发里程碑

### M0：基础框架（本次交付）

- Tauri + React 工程；
- 基础视觉；
- SQLite；
- 题目模型；
- 评分核心；
- Markdown/KaTeX/mhchem；
- Tesseract.js 示例；
- GLM-OCR 服务适配器；
- Provider 与密钥骨架。

### M1：题库编辑闭环

- 正式迁移器；
- 题库和题目 CRUD；
- 附件存储；
- 题目编辑器；
- 搜索和筛选；
- `.qbank` 导入导出。

### M2：导入器

- TXT/MD；
- DOCX；
- 文本 PDF；
- 图片/扫描 PDF；
- OCR 任务队列；
- 导入校正工作台；
- 规则切题。

### M3：刷题与自测

- 会话；
- 即时判定；
- 提交评分；
- 查看答案状态；
- 错题和收藏；
- 结果分析；
- 未完成会话恢复。

### M4：AI

- 主流 Provider；
- AI 解析；
- 主观题评分；
- 评分点编辑；
- 缓存；
- Token/费用提示；
- 错误恢复。

### M5：产品化

- 模型组件管理器；
- 自动更新；
- 签名；
- 安装包；
- macOS/Linux；
- 性能与可访问性测试。

---

## 22. 本次基础代码说明

### 22.1 可以直接验证

1. `npm install`；
2. `npm run tauri:dev`；
3. 创建和列出题库；
4. 查看数学/化学渲染；
5. 在基础 OCR 页面识别图片；
6. 启动 GLM-OCR SDK Server；
7. 在设置页保存 Provider；
8. 使用 GLM-OCR 识别图片。

### 22.2 代码中的刻意简化

- 页面导航暂未使用路由；
- schema 暂未拆分迁移版本；
- OCR 单页内容在受控 IPC 调用中通过 data URL 传递；
- GLM-OCR 模型下载与 sidecar 生命周期尚未内置；
- 未完成移动端 SecretStore。

这些简化用于形成可审阅的纵向切片，不应直接作为 1.0 发布实现。

---

## 23. 审核重点

请优先审核以下决策：

1. 是否接受 Tauri 2 + React + Rust + SQLite；
2. 是否接受基础 OCR 只负责低成本兜底；
3. 是否接受 GLM-OCR 通过独立服务接入，而非默认内嵌；
4. 是否接受所有导入结果先进入校正工作台；
5. 是否接受自测查看答案后默认从严格得分中排除；
6. 是否接受 API Key 使用系统密钥库；
7. 是否接受 Markdown 作为题目标准内容格式；
8. 是否先开发题库编辑闭环，再开发完整导入器。

---

## 24. 参考资料

[1] Tauri, “What is Tauri?”，官方文档。  
[2] Tauri, “Tauri Architecture”，官方文档。  
[3] Tauri, “Mobile Plugin Development” 与 Windows prerequisites，官方文档。  
[4] Tesseract.js，官方项目站点与文档。  
[5] Z.ai, “zai-org/GLM-OCR”，官方 GitHub 仓库与模型说明。  
[6] Z.ai, “zai-org/GLM-OCR model.safetensors”，官方 Hugging Face 文件信息。

---

## 附录 A：关键目录

```text
quiz_studio_foundation/
├─ src/
│  ├─ components/
│  ├─ domain/
│  ├─ features/
│  ├─ pages/
│  └─ styles/
├─ src-tauri/
│  ├─ capabilities/
│  └─ src/
│     ├─ commands/
│     ├─ db/
│     └─ services/
├─ docs/
├─ samples/
├─ package.json
└─ README.md
```

## 附录 B：推荐下一步开发任务

第一批任务应严格按顺序执行：

1. 修正基础骨架构建问题并建立 CI；
2. 引入正式数据库迁移器；
3. 完成附件与源文件存储；
4. 完成题库/题目 CRUD；
5. 完成题目编辑器；
6. 定义 `DocumentBlock` 和 `QuestionDraft`；
7. 先实现 TXT/Markdown 导入；
8. 再实现 DOCX；
9. 再实现 PDF 与 OCR；
10. 最后做自动切题与 AI 辅助。

不要先做“万能 AI 导入”，否则缺少稳定的数据结构、校正界面和回归样本，后续很难判断错误来自 OCR、切题、模型还是数据库。
