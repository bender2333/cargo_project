# 2026-07-21 前端架构分阶段重构计划

## 目标

在不改变现有产品行为、视觉样式和装箱算法的前提下，为当前前端建立可重复的正确性与性能基线，并逐步解除 `src/Workbench.tsx` 对认证、API、导入导出、装箱会话、手动排布和页面渲染的集中耦合。

最终保持 `PackingResult` 为 2D、3D、分层、明细、导出和历史方案的统一数据契约；不引入新的路由、全局状态、UI、i18n 或 3D 依赖。

## 当前根因与实测基线

- `src/Workbench.tsx:1063-4614` 为 4615 行单组件，包含 67 个导入、80 余个 React state、18 个异步处理器以及多个完整页面 JSX。
- `src/main.tsx:4` 直接挂载 `Workbench`，现有 `src/App.tsx` 只是未使用的兼容转发，因此认证和注册也由 Workbench 管理。
- `src/Workbench.tsx:1262-1354` 直接请求自定义柜型和历史方案；同时 `src/lib/historyPlans.ts` 保留旧 localStorage 历史实现，远程数据边界不一致。
- `src/Workbench.tsx:2775-2834` 的历史保存/恢复会连续修改多个 state，缺少原子状态转换。
- `src/components/ContainerScene.tsx:779-1998` 同时管理 Three.js 生命周期、渲染资源、交互和 overlay；在浏览器基线完整前先拆风险过高。
- 2026-07-20/21 本机只读基线：`npm run lint` 通过约 41.0 秒；`npm test` 通过 56 文件 / 351 测试约 48.7 秒；`npm run build` 通过约 14.6 秒；`dist` 总计 2,321,826 bytes，入口 JS 1,880.11 kB / gzip 562.77 kB，并触发既有大 chunk 警告。
- Playwright 当前列出 95 个用例，但 `e2e/responsive-3d.spec.ts` 存在源码级全局 skip；默认配置只启动 Vite，API 数据库又固定为 `server/database.db`，因此全量 E2E 不是隔离、零跳过基线。

## 边界与非目标

- 不改变装箱算法、排序评分、边界/重叠/载重/支撑规则或真实 Excel 夹具。
- 不改变现有页面视觉、导航语义、test id 或用户流程，除非计划明确列出。
- 不引入 Redux、Zustand、React Router、新 i18n 库、Three.js 封装框架或 benchmark 依赖。
- `archive/` 继续只作为只读参考。
- 不以单纯拆文件或减少行数作为完成标准；每个新边界必须消除一种职责混合或原子状态问题。
- 用户已有 `.codegraph/.gitignore`、`.serena/project.yml` 和 `issues/` 改动不纳入任何提交。

## 阶段 0：正确性与性能基线

### 子任务 0.1：隔离且零跳过的 E2E

- 根因：`server/db.mjs:8` 将数据库写死为 `server/database.db`；`playwright.config.ts` 只启动 Vite；`e2e/responsive-3d.spec.ts:50` 全局 skip。
- 修改：
  - `server/db.mjs` 支持 `CARGO_DB_PATH`，未设置时仍使用当前生产路径；E2E 使用 SQLite `:memory:`。
  - 新增最小 E2E API 启动脚本，固定 API 端口 3010、内存数据库和非生产环境。
  - `playwright.config.ts` 同时启动 API 与 Vite，继续复用现有 `/api` 代理。
  - 删除响应式 3D 源码级 skip，修正过时运行说明。
  - 增加 Playwright reporter 或等价门禁：出现 skipped/fixme 用例时整套命令失败。
- 测试意图：全套 E2E 可以单命令运行，不依赖已有后台进程，不读取或写入开发数据库，95 个用例全部实际执行。
- 验证：`npm run test:e2e -- --reporter=list`；运行前后校验 `server/database.db` 的大小、哈希和更新时间不变。
- 提交：`test(e2e): isolate backend and forbid skipped tests`。

### 子任务 0.2：确定性业务基线

- 复用 `test-data/excel/俄罗斯整托装柜尺寸.xlsx` 与 `test-data/json/vietnam-11/input.json`。
- 对固定输入使用确定性 ID，标准化 `PackingResult` 后保存 golden 摘要：装入/未装数、利用率、各标签分布、层级、作业步骤、箱体坐标/尺寸/朝向、诊断和 canonical hash。
- 俄罗斯夹具继续要求 31/31 全装入且无边界、重叠、载重错误；越南 20GP/40HQ 保留当前数量、利用率和合法性门槛。
- 不用 golden 文件替代业务断言；golden 只补充“架构重构不得改变确定性输出”的保护。
- 提交：`test(baseline): freeze packing result contracts`。

### 子任务 0.3：前端 benchmark

- 使用已安装的 Node、Playwright、Vitest、XLSX 和 Node `zlib`，不添加依赖。
- 新增独立 benchmark 配置/用例；普通 E2E 不因性能采样变慢。
- 每个时间指标先预热，再采样 5 次，记录 median、P95、运行环境：
  - 俄罗斯和越南装箱计算耗时。
  - 登录到工作台可交互时间。
  - 点击自动装箱到结果更新完成时间。
  - 3D canvas 首次出现非空像素时间。
  - viewport resize 到 canvas 尺寸稳定时间。
  - 生产构建的初始 HTML/CSS/JS gzip 与总 JS gzip。
- 基准写入 `test-data/baselines/frontend-architecture.json`；每次实际结果写入 `test-results/benchmark/`。
- 门禁：正确性、golden hash、零 skip 和包体积为硬门禁；同机 median 或 P95 比基线回退超过 20% 时失败；总 JS 允许最多 5% 分包开销，初始 gzip 不得增大。
- 新增 `npm run benchmark` 和显式更新基线的命令，普通运行不得静默改写基准。
- 提交：`test(benchmark): add frontend architecture baseline`。

## 阶段 1：应用壳与远程数据边界

### 子任务 1.1：启用 App 认证壳

- `src/main.tsx` 改为挂载 `App`。
- `App` 只管理登录、注册、当前用户和退出；登录后渲染 Workbench，并以 props 传入用户和退出动作。
- 从 Workbench 删除认证分支、token 操作和独立用户管理跳转状态。
- 不新增 URL 路由；现有页面导航行为保持不变。
- 提交：`refactor(app): separate authentication shell`。

### 子任务 1.2：统一 API 模块

- 新建 `src/api/`，迁移认证客户端、历史、自定义柜型、自定义货物、导入/导出模板和用户管理请求。
- API 模块负责 DTO 映射；React 组件不再导入 `DbHistoryPlan`、`CustomDbContainer` 或直接调用 `fetchWithAuth`。
- 非 2xx 返回明确错误，由页面显示现有 notice/alert；不得把失败静默伪装为空列表。
- 旧 localStorage 历史函数在确认无生产调用后删除，相应测试改为服务端 DTO/请求契约测试。
- 提交按 API 功能切片，避免一次移动全部文件。

## 阶段 2：装箱会话状态机

- 新增纯 reducer 和 `usePackingSession`，统一货物、柜型、装载模式、自动结果、dirty 状态和历史恢复。
- 为以下事件写 reducer 意图测试：新增/编辑/删除/排序/导入货物、变更柜型、计算完成、结果失效、历史恢复。
- 所有会影响装箱合法性的输入变化必须在同一 action 中使旧自动结果失效。
- 历史恢复由单一 action 原子写入项目、柜型、货物、规则和计算结果，替代连续 setter。
- `useManualPlacementSession` 管理手动草稿、撤销/重做、移动、旋转、删除、自动转手动和校验。
- 暴露唯一 `activeResult`：自动模式取自动结果，手动模式取手动草稿派生结果；所有下游视图统一消费。
- 不在 reducer 内执行副作用或网络请求；`calculatePacking` 在 command/hook 边界执行后提交结果。
- 提交：自动会话、历史恢复、手动会话分别独立提交。

## 阶段 3：功能页面边界

- 抽取 `HistoryPage`：拥有列表加载、保存、删除状态；通过 snapshot/restore 回调与装箱会话通信。
- 抽取 `CargoLibraryPage`：拥有 CRUD 表单；只通过 `onUseCargo` 把标准 `CargoItem` 加入会话。
- 抽取 `TemplateManagerPage`：拥有导入/导出模板草稿和样本表头；不直接修改装箱结果。
- 抽取 `CargoImportDialog`；将 `canAutoMap`、列预选、preview、template/draft 转换等纯逻辑移至 `src/lib/importWorkflow.ts` 并补单测。
- 模板管理页和导入弹窗继续复用 `ImportMappingForm`，不建立第二套字段映射 UI。
- 每个页面独立提交并运行对应 E2E。

## 阶段 4：工作台区域边界

- `WorkbenchHeader`：主导航、用户摘要、通知和语言切换。
- `PackingSidebar`：柜型、装载规则、货物录入与列表。
- `VisualizationWorkspace`：2D/3D、相机、层级、标签、最大化、回放、手动交互。
- `ResultsPanel`：汇总、分层、明细、诊断、装柜步骤和导出入口。
- 视觉临时状态由 `VisualizationWorkspace` 所有；表单临时状态由对应输入组件所有；WorkBench 仅组合页面、会话和功能页。
- 保持现有 test id 和 E2E 用户流程；不为减少 props 引入全局 Context。
- 三个区域分别独立提交。

## 阶段 5：ContainerScene 内部边界

- 在前四阶段和 3D benchmark 稳定后再实施。
- 保留当前 `SceneState` 和函数式实现：
  - `rendering.ts`：纹理、材质、标签、箱体 geometry/transform/visual state。
  - `interactions.ts`：拾取、拖拽、ghost、旋转 gizmo、键盘/鼠标动作。
  - `overlays.ts`：重心、余量标注和高亮。
  - `ContainerScene.tsx`：React refs、创建/销毁、render loop、resize 和模块接线。
- 不引入 class、factory、renderer interface 或第二套 scene graph。
- 每次拆分后跑 3D 像素、自由视角、手动拖拽、旋转、resize 与 benchmark 回归。

## 阶段 6：按需加载与收口

- `App` 登录前不加载 Workbench 重型依赖。
- XLSX 仅在导入、导出或模板下载时动态导入。
- PDF/html2canvas 仅在导出装柜作业图时动态导入。
- 管理页面按导航需要加载；Three.js 是否延迟加载以 3D 首帧 benchmark 为准，不牺牲默认工作台体验换取形式上的分包。
- 删除本轮迁移产生的孤儿导入/文件；不清理计划外旧代码。
- 提交：`perf(frontend): lazy-load heavy workflows`。

## 每阶段验证与提交纪律

- 每个子任务：先更新 `CHANGELOG.md`，运行针对性测试，随后运行 `npm run lint && npm test && npm run build`；涉及 UI/3D/导入导出/流程必须运行 `npm run test:e2e`。
- 每个子任务独立 commit；提交前 `git status --short`，只暂存本任务文件。
- 任一既有测试失败先写入 `decision.md`，不得降低断言、修改真实夹具或增加 skip。
- 每阶段运行 `npm run benchmark` 并把实际数据写入 `CHANGELOG.md`。
- 全部阶段完成后按 `CLAUDE.md` 执行生产备份、部署、健康检查和远程 E2E；部署和远程 benchmark 结果写回 `CHANGELOG.md` 后再提交。

## 完成标准

- Workbench 不再直接处理认证、远程 DTO、Excel 解析或模板 CRUD，仅负责页面组合与会话接线。
- 货物/柜型变化、计算失效和历史恢复具有可测试的原子状态语义。
- 自动与手动模式通过唯一 `activeResult` 驱动 2D、3D、层级、明细和导出。
- 全套单测、E2E 零失败零跳过；开发数据库未被测试污染。
- 俄罗斯 31 托、越南基线、golden hash、3D 像素和用户流程保持一致。
- 初始 bundle 与关键交互性能不回退，并有可重复报告证明。
