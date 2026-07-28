# 2026-07-28 重构复审：修复、架构与业务

## 状态

- 审查结论：**BLOCKED，当前重构不能通过业务验收**。
- 严重级别：无 P0；9 项 P1；若干 P2/P3。
- 审查目标 HEAD：`f4fc515`。
- 修复复审范围：`26b4ba7..f4fc515`。
- 主要需求基线：`PRD.md`、`plans/2026-07-21-frontend-architecture-refactor.md`、`plans/2026-07-27-containerscene-split.md`。
- 审查性质：只读复审，没有修改运行时代码、测试、baseline 或业务数据。

本轮同时检查了 Claude 针对上一轮 findings 的修复，以及重构后的整体架构、装箱业务闭环和质量门禁。修复提交包括：

```text
f4fc515 chore: untrack user-owned issue attachments committed by mistake
7966204 docs: correct overstated Phase 5-6 completion and record deviations
229b315 fix(benchmark): restore overwritten timing baseline and guard missing baseline
53cb920 fix(users): recover in page when user management chunk fails
4e3eeb7 fix(import): restore two manual-mapping header aliases
f1ef7eb fix(import): restore template rename and delete reconciliation
```

## 结论摘要

Claude 对上一轮列出的模板对账、两个表头别名、UserManagement chunk 恢复、benchmark 数值和完成状态文档进行了有效修复，没有发现这些修复引入新的运行时回归。

但是，整体业务仍有验收阻塞。最严重的问题不是单一 UI bug，而是 `PackingResult` 内同时存在两套互相冲突的层级和支撑关系；手动诊断又通过旁路状态传递；历史方案只保存输入后重新计算。所谓“统一结果契约”尚未成立，现有全绿测试还把错误合同冻结进了 golden baseline。

## 修复复审

| 上轮问题 | 本轮结论 | 说明 |
| --- | --- | --- |
| 导入模板改名、删除和另存为对账 | 已关闭 | catalog 权威更新、加载失败保护和用户自定义名称路径均恢复 |
| `堆疊層數`、`不可堆叠在上` 两个别名丢失 | 已关闭 | 两个别名已恢复并有行为测试；更广泛的别名缺口仍开放 |
| UserManagement 动态 chunk 失败导致页面不可恢复 | 已关闭 | 改为受控动态导入和局部失败态；故障注入 E2E 通过 |
| benchmark timing baseline 被错误覆盖 | 数值已关闭 | timing 段恢复到原可信值，bundle 段保留真实变化 |
| 删除 baseline 可绕过更新守卫 | 部分关闭 | 新增 `--allow-new-baseline`；缺少分支级行为测试，且 update 守卫仍不比较 timing |
| Phase 4/5/6 被误报为完成 | 已关闭 | 文档已如实标记为“部分完成”；底层工作本身仍未完成 |
| review 文档格式 | 开放，P3 | `git diff --check 26b4ba7..f4fc515` 报末尾新增空行 |

## Spec / 业务 Findings

### P1-1 物理分层和支撑关系被 X 轴推进关系覆盖

真实垂直支撑在 [`src/lib/packing.ts`](../src/lib/packing.ts#L920) 生成，并同时写入 `physicalLayer`/`supportedBy` 与 `verticalLayer`/`verticalSupportedBy`。计算结束前又调用 [`assignDepthLayers`](../src/lib/layers.ts#L3)，根据 X 方向“推靠箱”覆盖：

- `physicalLayer`
- `supportedBy`
- `supportType`

这与 [`PRD.md`](../PRD.md#L265) 和 [`decision.md`](../decision.md#L1348) 定义的业务规则相反：落地箱为第 1 层，上层箱由底面支撑关系进入更高层。

对 checked-in golden 数据的独立统计如下：

| Case | 箱体数 | `physicalLayer != verticalLayer` | 两套支撑关系不一致 |
| --- | ---: | ---: | ---: |
| Russia volume | 31 | 29 | 29 |
| Vietnam 20GP quantity | 463 | 434 | 457 |
| Vietnam 20GP volume | 462 | 433 | 456 |
| Vietnam 40HQ quantity | 839 | 806 | 832 |
| Vietnam 40HQ volume | 823 | 793 | 816 |
| **合计** | **2,618** | **2,495** | **2,590** |

2D、3D、分层、明细、作业步骤和导出继续消费被覆盖的 `physicalLayer`，因此这些视图虽然相互一致，却共同表达了错误业务语义。

### P1-2 作业顺序没有保证支撑物先于上层货物

[`assignWorkStepsByDepth`](../src/lib/packing.ts#L585) 仅按 `x -> y -> z` 和 ID 排序，没有对 `verticalSupportedBy` 建立拓扑约束。对五组 golden 数据检查得到 **1,129 条反向支撑边**：

| Case | 反向支撑边 |
| --- | ---: |
| Russia volume | 0 |
| Vietnam 20GP quantity | 173 |
| Vietnam 20GP volume | 162 |
| Vietnam 40HQ quantity | 333 |
| Vietnam 40HQ volume | 461 |

例如某上层箱的 `workStep=5`，其三个支撑箱却分别为步骤 10、52、54。Playback 和装柜步骤直接使用该顺序，现场将看到“先装上层货物，再装支撑物”的不可执行指令。

### P1-3 非法手动方案仍可保存和导出

[`validateDraft`](../src/lib/manualPlacement.ts#L624) 校验边界、重叠、悬空和堆叠，但不校验总载重。删除支撑物后，[`useManualPlacementSession`](../src/hooks/useManualPlacementSession.ts#L361) 会计算新问题但仍提交草稿。

此外：

- [`toPlacedBoxes`](../src/lib/manualPlacement.ts#L818) 接收 `invalidBoxIds` 后直接忽略，非法箱仍进入结果。
- [`buildManualPackingResult`](../src/lib/manualSteps.ts#L126) 把 `diagnostics` 固定为空数组。
- [`ResultsPanel`](../src/components/ResultsPanel.tsx#L323) 的保存和导出按钮没有合规阻断条件。

这直接违反 [`PRD.md`](../PRD.md#L373) “越界、重叠、超重或支撑不合法时必须阻止保存”的要求。

### P1-4 货物编辑没有同步既有手动箱

手动会话只以 `{id, quantity}` 作为货物计划对账键，[`useManualPlacementSession`](../src/hooks/useManualPlacementSession.ts#L159) 不会因尺寸、重量、旋转或堆叠规则变化而更新草稿。

[`enrichPlacedBoxes`](../src/lib/manualSteps.ts#L31) 只刷新名称、标签和颜色，既有手动箱仍保留旧尺寸、旧重量、旧旋转和旧堆叠限制。全局 `defaultMaxStackLayers` 也没有传入手动会话。同一货物因此可能同时存在新旧两套定义。

### P1-5 历史方案没有保存实际方案

[`HistoryPlanData`](../src/api/historyPlans.ts#L4) 仅保存：

- 柜型和 `CargoItem[]`
- 数量、层数、标签摘要
- 装载模式和默认最大堆叠层数

它没有保存 `PackingResult`、自动/手动模式、手动草稿坐标、朝向、层级、支撑关系或诊断。恢复时 [`usePackingSession`](../src/hooks/usePackingSession.ts#L81) 使用当前算法重新自动计算。

因此历史页面保存的是“输入参数”，不是“当时的方案”。手动方案无法恢复，自动方案也无法保证与保存时结果一致，违反 [`PRD.md`](../PRD.md#L402) 和 [`PRD.md`](../PRD.md#L514)。该缺口虽已在 `decision.md` 记录为延期，仍属于未关闭的验收问题。

### P1-6 非法重量可以绕过载重硬约束

[`numberValue`](../src/lib/importCargo.ts#L124) 把缺失或非数字重量转成 `0`；[`parseCargoRows`](../src/lib/importCargo.ts#L287) 原样接受负重量。手工新增和编辑同样没有正数校验。

装箱算法使用 `usedWeight + item.weight > maxWeight` 判断超重，负重量会抵消已装重量，缺失重量会把真实载荷当成零。系统可能生成表面“未超重”但实际上不合法的方案。

### P1-7 Excel 导入不是事务式确认流程

自动映射路径在 [`Workbench.tsx`](../src/Workbench.tsx#L1780) 中只要存在部分有效行就直接用 `cargoImported` 替换当前货物，即使同批次已有错误行。

手动映射直到点击确认才执行解析，[`CargoImportDialog`](../src/components/CargoImportDialog.tsx#L249) 在存在错误时仍调用 `onConfirm`。随后 [`packingSessionReducer`](../src/lib/packingSession.ts#L146) 整体替换当前数据。

用户无法在覆盖前审阅转换结果、错误和警告，也没有回滚入口，违反 [`PRD.md`](../PRD.md#L458) 和 [`PRD.md`](../PRD.md#L464)。

### P1-8 编辑导入货物会静默截断标签

导入解析允许较长业务标签，例如 `TB-C10-EV_v1.1`。但保存编辑时 [`Workbench.tsx`](../src/Workbench.tsx#L1696) 统一执行 `.slice(0, 2)`，输入框也设置 `maxLength={2}`。

一次普通编辑就会把标签改成 `TB`，可能造成标签冲突，并破坏录入、计算、2D、3D、明细、导出和历史之间的标签连续性。

### P1-9 默认装箱计划导出无法表达实际朝向

[`ExportPlanRow`](../src/lib/exportPlan.ts#L4) 没有 `orientationKey` 或等价朝向字段。实际尺寸只取同货物第一个已放置箱体 [`placedBoxes[0]`](../src/lib/exportPlan.ts#L41)。

当同一货物使用多种朝向放置时，一个尺寸被用于代表全部箱体，无法满足 PRD 12.4 和 13.1 的“实际朝向”要求。

### P2-1 预留间隙被重复应用，重心又使用不同坐标空间

[`Workbench.tsx`](../src/Workbench.tsx#L1092) 先构造 `renderingContainer = effectiveContainer(selectedContainer)`，随后又把它传给 [`computeRemainingCapacity`](../src/lib/remainingCapacity.ts#L20)，该函数再次执行 `effectiveContainer()`。非零间隙会被扣两次。

重心计算却在 [`Workbench.tsx`](../src/Workbench.tsx#L1412) 使用原始 `selectedContainer`，而箱体坐标位于有效柜空间。带 `sideGap`、`doorGap` 或 `topGap` 时，容量比例和偏载判断可能同时失真。

### P2-2 手动模式存在两种冲突的进入语义

直接点击 [`placement-mode-manual`](../src/components/VisualizationWorkspace.tsx#L248) 只切换模式，首次进入会显示空草稿；只有单独的“继续手动”按钮才复制自动结果。PRD 11.1.1 要求切换手动模式时保留当前自动结果作为初始草稿。

### P2-3 同标签统计没有聚合

[`packing.ts`](../src/lib/packing.ts#L1261) 为每个 `CargoItem` 生成一条 `labelStats`，相同标签会重复。结果摘要又使用数组长度展示货物类型，导致同标签多条货物时类型数和统计口径错误。

### P2-4 手动映射仍会静默丢失部分字段

本轮只恢复了两个回归别名。测试中的 `KNOWN_GAPS` 仍明确接受：

- `label`：`標籤`、`托盤`、`代號`
- `name`：`名稱`、`貨物名稱`
- `color`、`canRotate`、`stackable`：全部自动映射别名

这些列不会在手动映射时预选。特别是禁止旋转或禁止堆叠字段会回落为 `true`，改变装箱合法性。

### P2-5 映射弹窗缺少确认前业务预览

当前弹窗只显示原始总行列数和原始单元格预览，没有换算后的毫米值、预计有效行数、错误数、警告数和厘米换算行数。解析发生在最终确认处理器中，未满足 PRD 12.3。

### P2-6 31 托真实流程缺少端到端验收

单测使用 `13400 x 2450 x 2650` 并断言俄罗斯 31 托全部装入；浏览器测试只导入业务文件后在默认柜型检查一条明细，不能发现自定义柜型选择、UI 接线或导出回归。

## Standards / 架构 Findings

### A1 `PackingResult` 不是唯一业务契约

当前至少存在三条互相分裂的数据流：

1. `physicalLayer/supportedBy` 与 `verticalLayer/verticalSupportedBy` 同时存在且大量冲突。
2. 自动诊断写入 `PackingResult.diagnostics`，手动诊断通过 `manualIssues` 旁路传递。
3. 运行时视图消费 `PackingResult`，历史持久化却只保存输入并重新计算。

这违反项目“2D、3D、分层、明细、导出和历史方案统一消费 `PackingResult`”的架构目标，也是多数 P1 业务问题的共同根因。

### A2 Workbench 仍是状态和流程中心

[`Workbench.tsx`](../src/Workbench.tsx#L855) 当前约 2,472 行，包含约 50 个 `useState` 和 15 个 effect，仍直接处理：

- XLSX 读取、解析入口和多个导出流程
- 历史方案 payload 构造和恢复接线
- 手动交互通知和大量视觉临时状态
- 容量、重心、回放、装柜步骤和复核清单组合

这未达到架构计划“Workbench 仅负责页面组合与会话接线”的完成标准。

### A3 区域组件主要完成了 JSX 搬迁，没有迁移状态所有权

[`VisualizationWorkspace`](../src/components/VisualizationWorkspace.tsx#L81) 和 [`ResultsPanel`](../src/components/ResultsPanel.tsx#L162) 接收大型 props 镜像，视觉临时状态仍由 Workbench 所有。文件边界已经形成，但职责边界和可独立测试的控制器边界尚未完成。

### A4 ContainerScene 仍未达到自身拆分标准

`ContainerScene.tsx` 仍为 1,309 行、约 26 个 effect；计划要求不超过 600 行，并提取事件处理器。文档已正确改为“部分完成”，因此这是已知但未关闭的架构债务，不再是状态误报。

### A5 登录前懒加载边界仍未完成

[`App.tsx`](../src/App.tsx#L2) 静态导入 Workbench，登录页首次访问仍下载其重型依赖。生产构建主 chunk 为 `1,059.25 kB`，gzip `295.06 kB`，并触发大 chunk 警告。

### A6 Golden contract 冻结了错误字段，没有编码业务不变量

Golden contract 同时序列化两套冲突的层级和支撑字段，并只断言快照相等。现有测试没有断言：

- 落地箱必须是物理第 1 层。
- 上层箱的 `supportedBy` 必须来自底面支撑。
- 每个支撑物的 `workStep` 必须小于被支撑箱。

因此 `npm test` 全绿不能证明分层和作业顺序正确。

## 工具链与测试缺口

### P2 Benchmark update 守卫与文档口径不一致

[`gateBenchmarkUpdate`](../scripts/frontendBenchmark.mjs#L230) 只检查 contract hash 和 bundle 硬门禁，不比较 algorithm/browser timing；对应测试还明确要求“允许 timing rebaseline”。因此现有 baseline 存在时，`benchmark:update` 仍能吸收任意 timing 回退。

此外，`--allow-new-baseline` 的“无 flag 拒绝且不写文件、有 flag 才创建”行为没有端到端脚本测试。

### P3 模板失败测试没有直接证明 ID 被保留

`CargoImportDialog.test.tsx` 的加载失败用例只用模板名称作为引用保留代理，无法发现“保留名称但清空 ID”的回归。应在恢复 catalog 后断言 select 回到原 ID，或断言保存仍走 update 分支。

### P3 提交范围存在 Markdown 尾部空行

```text
issues/2026-07-27-refactor-review-verification.md:192: new blank line at EOF.
```

## 验证结果

| 验证项 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm test` 普通单测 | 81 文件，603/603 通过 |
| `npm test` 装箱性能测试 | 2 文件，6/6 通过 |
| `npm run build` | 通过；主 chunk 仍触发大文件警告 |
| `npm run test:e2e` | 119/119 通过，零 skip，用时约 9.3 分钟 |
| `npm run benchmark` | **失败**；首屏 JS gzip 和首屏总 gzip 均增长 327 B |
| benchmark 首屏 JS | baseline 291,680 B；actual 292,007 B |
| benchmark 首屏总量 | baseline 301,536 B；actual 301,863 B |
| 开发数据库 | 前后 SHA-256 均为 `70212B27A8781D648197BAAEABC84E7C550E03B363E856B290CEA66DA331E901` |
| 测试端口 | `3010`、`5176` 均已释放 |
| 工作区 | 未产生测试污染；保留用户原有 `.codegraph`、`.serena`、`issues/0720/` 改动 |

E2E 中出现的 API 失败和动态 chunk 错误日志均来自故障注入用例，不是未处理的测试失败。

## 建议处理顺序

1. **先统一层级和支撑契约。** 明确 `physicalLayer` 只表示垂直支撑深度；推进/作业阶段使用独立字段，不再覆盖支撑字段。增加支撑和作业拓扑不变量测试，然后重新生成 golden。
2. **关闭手动方案合规闭环。** 把手动校验转成 `PackingDiagnostic[]` 写入 `PackingResult`；补总载重校验；非法草稿禁止保存和导出；货物编辑必须原子更新或明确作废手动草稿。
3. **把历史方案改成真实快照。** 持久化 mode、PackingResult 或可版本化的手动草稿，以及坐标、朝向、层级、支撑和诊断；恢复时不得无提示重算成新方案。
4. **收紧输入与导出边界。** 重量必须为有限正数；导入必须先预览再事务式替换；标签编辑不得截断；导出按实际箱体朝向表达混合放置。
5. **最后继续架构收口和性能拆分。** 将 Excel/导出 controller、视觉状态所有权移出 Workbench；完成登录前 Workbench 懒加载；在 benchmark 重新为 GREEN 后再更新完成状态。

## 验收条件

以下条件全部满足前，本 issue 保持开放：

- 分层和支撑关系符合 PRD，并且 2D、3D、明细、导出共享同一真值。
- 作业步骤对每条支撑边满足“支撑物先于被支撑物”。
- 手动非法方案无法保存或导出，诊断进入统一 `PackingResult`。
- 历史方案能原样恢复自动和手动结果。
- 导入、标签编辑、重量校验和实际朝向导出不再丢失业务信息。
- `lint`、单测、构建、零 skip E2E 和 benchmark 全部通过。
