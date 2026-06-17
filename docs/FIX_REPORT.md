# Quiz Studio 功能修复报告

## 主要根因

### 1. 导入编辑器首次载入被 reducer 拦截

旧代码在处理 action 之前先执行：

```ts
const draft = state.draft;
if (!draft) return state;
```

初始状态的 `draft` 必然为 `null`，因此用于载入草稿的 `load` action 也会直接返回。预览页面虽然通过 props 显示了原始草稿，但所有编辑 action 都在一个始终为空的 reducer state 上执行，所以表现为：

- 修改题型无效；
- 修改题干和答案无效；
- 添加、删除选项无效；
- 删除、拆分题目无效。

修复后，`load` 和 `clear` 在空草稿保护之前处理，并且 `useImportStore` 可直接接受初始草稿。

### 2. 浏览器开发模式主动禁用了导入

旧代码在非 Tauri 环境下：

- 将“选择文件”按钮设为 disabled；
- `pickTextFile()` 直接返回 null；
- 批量导入仍调用 Tauri IPC；
- 新建题库只存在组件内存中，页面切换后丢失。

修复后，浏览器开发模式使用：

- 原生 file input 读取 TXT/Markdown；
- UTF-8 优先、GBK 回退解码；
- localStorage 保存题库和题目；
- 浏览器批量导入、删除、刷题可形成完整开发闭环。

桌面版仍使用系统对话框、Rust 命令和 SQLite。

## 同步修复

- 首页“导入第一份题库”和“创建空白题库”接入导航。
- 对尚未实现的搜索、自测提交按钮显示为禁用状态，避免形成假交互。
- 缺少答案由 warning 改为阻断导入的 error，避免确认导入后才抛异常。
- 增加题型与答案类型一致性校验。
- 填空题编辑使用 `blank` 答案，而不是错误地写成 `subjective`。
- 删除选项时通过稳定 option id 重映射答案，避免标签重排后正确答案丢失。
- 新建题库导入前先完成草稿转换；失败时尝试清理本次创建的空题库。
- 多选题改为选择完毕后确认答案；填空题增加输入和确认；主观题增加答题框。
- 回答错误时明确显示正确答案。

## 新增测试

`src/features/import/stores/importStore.test.ts` 覆盖：

1. 空状态能够载入首份草稿；
2. 载入后编辑能够更新状态；
3. 删除选项后答案正确跟随重排；
4. 填空答案保存为正确的数据类型。

## 本次环境中的验证

已执行并通过：

- 全部 TypeScript/TSX 文件语法转译检查；
- import reducer 独立运行烟雾测试；
- TXT 解析、校验、正式题目转换烟雾测试；
- 浏览器 localStorage 题库与批量导入仓库烟雾测试；
- 无事件处理器的可点击按钮静态扫描。

由于当前容器无法完整下载 npm 依赖，未在此环境重新执行 Vite 正式构建。项目中未包含 `node_modules`，请在本机运行：

```bash
npm install
npm run test
npm run build
npm run tauri:dev
```

Rust/Tauri 后端未在当前容器编译，因为环境未安装 Cargo。桌面端仍需在 Windows 环境执行 `cargo check` 或 `npm run tauri:dev`。
