# 2026-07-24 重构进度 Review 与剩余工作计划

## 一、整体进度概览

本次重构依照 `plans/2026-07-21-frontend-architecture-refactor.md` 分六阶段推进，
截至 2026-07-24，已完成阶段 0–3 的大部分工作，阶段 4–6 尚未开始。

---

## 二、已完成工作（各阶段确认状态）

### 阶段 0：正确性与性能基线 ✅

| 子任务 | 提交 | 状态 |
|--------|------|------|
| 0.1 E2E 隔离 + 零跳过门禁 | `a1d563b` | ✅ 完成 |
| 0.2 装箱合同冻结（俄罗斯/越南 golden hash） | `19e3130` | ✅ 完成 |
| 0.3 前端 benchmark 基线 | `7205c63` | ✅ 完成（timing 有环境噪声记录，未更新基线） |

### 阶段 1：应用壳与远程数据边界 ✅

| 子任务 | 提交 | 状态 |
|--------|------|------|
| 1.1 App 认证壳（`App.tsx` 接管登录/注销，Workbench 接收 props） | `281b101` | ✅ 完成 |
| 1.2 统一 API 模块（7 个 `src/api/` 切片迁移完毕） | `720446f`–`1dfe9b0` | ✅ 完成 |
| 1.2 用户管理懒加载 | `022b881` | ✅ 完成 |

### 阶段 2：装箱会话状态机 ✅

| 子任务 | 提交 | 状态 |
|--------|------|------|
| 2.1 自动装箱并发 + 历史恢复原子化（`usePackingSession`） | `2a14e49` | ✅ 完成 |
| 2.2 手动放置会话 + 唯一 `activeResult`（`useManualPlacementSession`） | `90ae5f2` | ✅ 完成 |

### 阶段 3：功能页面边界（部分完成）

| 子任务 | 提交 | 状态 |
|--------|------|------|
| HistoryPage + useHistoryPlans | `ef062c5` | ✅ 完成，已部署 |
| CargoLibraryPage + useCustomCargoLibrary | `84b5736` | ✅ 完成，**已部署**（生产备份 `20260723-085230`） |
| useTemplateCatalogs（catalog controller） | `ab465c8` | ✅ 完成 |
| TemplateManagerPage（模板管理页面） | `bdf54cc` | ✅ 代码完成，**待独立部署** |
| **CargoImportDialog 抽取**（计划有，CHANGELOG 无） | — | ❌ **未开始** |

---

## 三、当前未关闭项（需 Codex 处理）

### 3.1 【紧急】TemplateManagerPage 生产部署

**状态**：代码已合并（commit `bdf54cc`），但 CHANGELOG 明确标注"待独立 commit、生产部署和远程 E2E 后关闭"。

**动作**：
1. 确认本地 `npm run lint && npm test && npm run build` 全绿（当前已知：78 files/542 tests 通过，E2E 118/118）。
2. 执行生产部署流程（见 `CLAUDE.md` 部署命令）。
3. 运行远程 E2E（`PLAYWRIGHT_BASE_URL=http://101.33.232.150 npx playwright test`），预期唯一 RED 仍为 admin debug log 夹具（已知既有问题，见 `decision.md`）。
4. 将部署结果写回 `CHANGELOG.md`，关闭该条 `[ ]`。

### 3.2 【待办】Benchmark 包体 RED 跟进

**状态**：Phase 3 各切片每次都导致初始 JS gzip 微增（当前 `+1663 B` vs 基线），benchmark 包体门禁持续 RED，但增幅低于 5% 上限。

**根因**：每次抽页面/hook 都产生少量额外代码（类型守卫、封装逻辑），未触发动态分包优化。

**决策选项**（需架构师确认后执行）：
- **A**：阶段 6 完成懒加载后统一刷新 benchmark baseline（推荐，避免频繁更新 baseline）。
- **B**：现在执行 `npm run benchmark:update`，接受当前包体为新基线。

**建议选 A**，理由：阶段 6 的 XLSX/PDF 动态导入预期显著减小初始 JS，到时一次刷新更准确。

---

## 四、剩余工作清单

### P0：Phase 3 收尾

#### 任务 A：CargoImportDialog 抽取
- **根因**：`src/Workbench.tsx` 仍含导入弹窗的列映射选择、preview 投影、canAutoMap 判断和 draft 转换逻辑，属于页面级交互，不是 Workbench 状态。
- **意图与边界**：
  - 新建 `src/components/CargoImportDialog.tsx`，包含现有 `ImportMappingForm` 调用、列预选、preview 渲染和 template draft 切换。
  - 纯逻辑（canAutoMap、列预选推断、preview 投影）移至 `src/lib/importWorkflow.ts`，补单测。
  - `Workbench` 只传入 `catalog`（已由 `useTemplateCatalogs` 提供）和 `onImported(items: CargoItem[])` 回调。
  - 保留现有 `data-testid`（`import-modal`、`column-select-*`、`preview-table` 等）。
- **验证标准**：
  - `npx vitest run src/lib/importWorkflow.test.ts`：canAutoMap、列预选、preview 投影的典型输入有断言用例。
  - `npx playwright test --grep "import"` 通过，映射弹窗、模板选择和货物导入 E2E 行为一致。
  - `npm run lint && npm test && npm run build && npm run test:e2e` 全绿。
- **提交**：`refactor(import): extract cargo import dialog`

---

### P1：Phase 4 工作台区域边界（3 个独立切片）

> **前置条件**：Phase 3 全部收尾后开始。

#### 任务 B：WorkbenchHeader
- **根因**：`Workbench.tsx` 顶部导航、用户摘要、通知按钮、语言切换、版本通知渲染混在 JSX 中，约 `Workbench.tsx:200-400`。
- **意图与边界**：
  - 新建 `src/components/WorkbenchHeader.tsx`，接收 `currentUser`、`locale`、`onLocaleChange`、`onLogout`、`onNavigate(page)` 作为 props。
  - 不引入 Context；不改变导航语义和 test id。
- **验证标准**：
  - 语言切换 E2E 通过；通知渲染正确；admin 入口可达。
- **提交**：`refactor(layout): extract workbench header`

#### 任务 C：PackingSidebar
- **根因**：柜型选择、货物表单录入、货物列表、装载规则设置混在 Workbench 主 JSX 约 800 行，与结果展示区域无法单独测试。
- **意图与边界**：
  - 新建 `src/components/PackingSidebar.tsx`。
  - 接收 `session`（来自 `usePackingSession`）、`catalog`（来自 hooks）和操作回调。
  - 不持有装箱会话状态；货物 CRUD 回调仍通过 props 传入。
- **验证标准**：
  - 货物录入、柜型切换、装载模式切换的 E2E 行为不变。
  - `npm run test:e2e` 全绿。
- **提交**：`refactor(layout): extract packing sidebar`

#### 任务 D：VisualizationWorkspace + ResultsPanel
- **根因**：2D/3D 切换、层级 tab、分层/明细/诊断/步骤的 JSX 均在 Workbench，约 1200 行，`activeResult` 传递链路模糊。
- **意图与边界**：
  - `VisualizationWorkspace`：持有 2D/3D 视角状态、最大化、回放、手动交互；接收 `activeResult` 作为 prop。
  - `ResultsPanel`：持有 tab 选择、汇总、分层、明细、诊断、导出入口；接收 `activeResult` 作为 prop。
  - 两个组件分别独立提交。
- **验证标准**：
  - 3D benchmark 不回退（`npm run benchmark` 通过）。
  - 层级/明细/导出 E2E 通过。
- **提交**：`refactor(layout): extract visualization workspace`、`refactor(layout): extract results panel`

---

### P2：Phase 5 ContainerScene 内部边界（待 Phase 4 稳定后）

> **前置条件**：Phase 4 完成，3D benchmark 稳定，`ContainerScene.tsx` benchmark 基线已建立。

- 拆分为 `rendering.ts`、`interactions.ts`、`overlays.ts` 三个纯模块，`ContainerScene.tsx` 保留 React refs 与模块接线。
- 每次拆分后运行 3D 像素、拖拽、旋转、resize 与 benchmark 回归。
- **提交**：每个模块独立提交。

---

### P3：Phase 6 按需加载与收口

> **前置条件**：Phase 5 完成。

- App 登录前不加载 Workbench 重型依赖（Three.js）。
- XLSX 仅在导入/导出/模板下载时动态导入。
- PDF/html2canvas 仅在导出时动态导入。
- 完成后执行 `npm run benchmark:update` 刷新 baseline，确认初始 JS 下降。
- 删除本轮产生的孤儿导入/文件。
- **提交**：`perf(frontend): lazy-load heavy workflows`

---

## 五、执行顺序与优先级

```
立即执行：
  [3.1] TemplateManagerPage 生产部署 → 关闭 CHANGELOG 未完条目

Phase 3 收尾：
  [A] CargoImportDialog 抽取 → commit + E2E

Phase 4（三个切片顺序执行）：
  [B] WorkbenchHeader → commit
  [C] PackingSidebar → commit
  [D] VisualizationWorkspace + ResultsPanel → 两次 commit

Phase 5（等 Phase 4 全绿）：
  ContainerScene 内部三模块拆分

Phase 6（等 Phase 5 全绿）：
  懒加载 + benchmark baseline 刷新 + 孤儿清理

全部完成后：
  生产部署 + 远程 E2E + benchmark 最终报告写回 CHANGELOG
```

---

## 六、每轮验证命令（Codex 标准流程）

```bash
# 每个子任务完成后
npm run lint && npm test && npm run build

# 涉及 UI/3D/2D/导入导出/用户流程时额外运行
npm run test:e2e

# Phase 4/5/6 每轮还需运行
npm run benchmark
```

---

## 七、当前已知风险

| 风险 | 描述 | 缓解 |
|------|------|------|
| Benchmark timing 噪声 | 40HQ/登录 P95 受环境影响波动超 20%，多轮记录在 `decision.md` | 不更新 baseline；Phase 6 后统一刷新 |
| ContainerScene 拆分 | 79 KB 单文件，Three.js 生命周期复杂 | Phase 5 在 3D benchmark 稳定后再启动，先行保护用例 |
| Workbench.tsx 剩余行数 | 抽出 Phase 3 页面后仍约 185 KB，Phase 4 切片后才能大幅缩减 | Phase 4 三切片完成后重新测量 |
| 生产 E2E admin log RED | 已知既有问题（admin debug log 用例要求本地夹具，生产返回真实日志） | `decision.md` 有记录，不修改测试断言 |
