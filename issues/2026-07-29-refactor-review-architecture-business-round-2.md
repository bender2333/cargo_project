# 2026-07-29 重构复审：架构、业务与修复闭环（第二轮）

## 状态

- 审查结论：**BLOCKED，当前 HEAD 不具备合并、发布或业务验收条件**。
- 严重级别：无 P0；10 项 P1；8 项 P2。
- 固定点：`5fa9856`。
- 审查目标：`6dfcc0b`。
- 审查范围：`git diff 5fa9856...6dfcc0b`，并补查当前整体架构、PRD 业务闭环和现有测试合同。
- 需求基线：`AGENTS.md`、`PRD.md`、`decision.md`、上一轮 [`2026-07-28-refactor-review-architecture-business.md`](./2026-07-28-refactor-review-architecture-business.md)。
- 审查性质：只修改本报告和 `CHANGELOG.md`；未修改运行时代码、测试、baseline 或业务夹具。

本轮确认 Claude 的自动分层/支撑与自动作业拓扑修复有效，31 托真实业务流程也已补上浏览器验收。但是，自动算法仍能产出违反堆叠限制的结果，手动 `PackingResult` 仍使用伪造的层级/支撑字段，合规守卫存在多条旁路；历史快照和事务导入则被明确延期。因此不能把本轮描述为“仅有已知 RED 的通过状态”。

## 修复复审状态

| 上轮问题 | 本轮结论 | 说明 |
| --- | --- | --- |
| P1-1 自动物理层/支撑被 X 轴深度覆盖 | **已关闭（自动路径）** | `reconcileSupportRelations` 恢复垂直语义，`assignDepthLayers` 只写 `depthLayer` |
| P1-2 自动作业顺序违反支撑拓扑 | **已关闭（自动路径）** | 自动路径改为支撑拓扑排序；手动路径仍未共用该终结流程 |
| P1-3 非法手动方案可保存/导出 | **部分关闭** | 主报告 XLSX/保存按钮被禁用，但保存命令、历史页和多种导出仍可绕过 |
| P1-4 编辑后手动草稿不同步 | **部分关闭** | 已同步重量和堆叠字段，仍漏尺寸、`canRotate` 和全局默认堆叠层数 |
| P1-5 历史方案只存输入 | **延期且开放** | `decision.md` 已如实记录，但 PRD 验收仍未满足 |
| P1-6 非法重量绕过载重 | **部分关闭** | 负数被归零；缺失/非数字仍静默变成 0，载重继续可能被低估 |
| P1-7 Excel 导入非事务式 | **延期且开放** | 有错误行时仍可整体替换当前货物数据 |
| P1-8 编辑截断长标签 | **已关闭** | 已移除两位截断并补测试 |
| P1-9 导出缺实际朝向 | **部分关闭** | 混合朝向改为空尺寸并附朝向集合，仍无逐朝向数量或显式朝向字段 |
| P2-1 effectiveContainer/CoG 坐标空间 | **已关闭** | effective 容器幂等，CoG 使用相同有效空间 |
| P2-2 手动模式入口语义 | **部分关闭** | 首次进入会接管自动结果；空草稿状态仍有歧义，且 4 条 E2E 与新语义冲突 |
| P2-3 类型数/标签统计 | **部分关闭** | 摘要改为 distinct label；`PackingResult.labelStats` 仍逐 CargoItem 生成 |
| P2-4 手动映射别名缺口 | **已关闭** | 繁中、颜色、旋转和堆叠候选均已补齐 |
| P2-5 映射确认前业务预览 | **开放** | 仍只展示原始单元格，没有换算结果和成功/错误/警告统计 |
| P2-6 31 托真实 E2E | **已关闭** | 当前 HEAD 定向 E2E 1/1 通过，导入 31 托并在指定自定义柜型全部装入 |

## Standards / 架构 Findings

### P1-S1 质量门禁实际为 RED，但交付记录把 RED 写成“通过”

当前 HEAD 的两条业务硬约束测试稳定失败：

- [`src/lib/packing.test.ts:556`](../src/lib/packing.test.ts#L556)：`top-only-L-8` 的 `stackCapacity=1`，实际处于堆叠链第 4 层。
- [`src/lib/packing.stackfill.test.ts:69`](../src/lib/packing.stackfill.test.ts#L69)：`capacity-one-0-10` 的 `maxStackLayers=1`，实际处于堆叠链第 4 层。

P2-2 又改变了进入手动模式的用户流程，但没有同步浏览器合同。当前定向执行 4 项得到 **4/4 failed**：

- [`e2e/manual-3d.spec.ts:157`](../e2e/manual-3d.spec.ts#L157) 仍期待进入手动模式后 `data-box-count=0`，实际为 `18`。
- [`e2e/manual-3d.spec.ts:320`](../e2e/manual-3d.spec.ts#L320) 等待货物池首项超时，因为自动结果已全部接管。
- [`e2e/manual-3d.spec.ts:414`](../e2e/manual-3d.spec.ts#L414) 仍期待调试快照中的手动箱数和层数为 0，实际为 18/1。
- [`e2e/manual-3d.spec.ts:536`](../e2e/manual-3d.spec.ts#L536) 仍期待手动活动结果为 `0/18`，实际为 `18/18`。

但 [`CHANGELOG.md:14`](../CHANGELOG.md#L14)、[`CHANGELOG.md:25`](../CHANGELOG.md#L25)、[`CHANGELOG.md:34`](../CHANGELOG.md#L34) 和 [`CHANGELOG.md:68`](../CHANGELOG.md#L68) 使用“通过，仅已知 RED”“E2E 119/119”“最终门禁通过”等表述。失败可以作为明确延期项存在，但不能同时被计入通过。该表述违反 [`AGENTS.md:136`](../AGENTS.md#L136) 的 Fail Loudly 规则和 [`AGENTS.md:223`](../AGENTS.md#L223) 的 UI/E2E 验证要求。

影响：CI/交付记录不能作为发布证据；P2-2 的新业务语义尚未形成单测与 E2E 一致的验收合同。

### P1-S2 benchmark baseline 更新绕过了仓库自己的硬门禁

提交 `e0c1fc2` 只修改 [`test-data/baselines/frontend-architecture.json`](../test-data/baselines/frontend-architecture.json)，把：

- initial JS gzip：`291680 -> 292322`，增加 `642 B`；
- initial total gzip：`301536 -> 302178`，增加 `642 B`；
- 五个算法 contract hash：全部改写。

而 [`scripts/frontendBenchmark.mjs:211`](../scripts/frontendBenchmark.mjs#L211) 明确把 contract mismatch、initial JS 增长和 initial total 增长列为硬失败；[`gateBenchmarkUpdate`](../scripts/frontendBenchmark.mjs#L230) 会拒绝写入。用当前门禁规则比较该提交前后 baseline，得到 **7 个拒绝项**：5 个 contract mismatch、initial JS increased、initial total increased。

因此该 baseline 不可能由未改动的正常 `npm run benchmark:update` 路径产生。`CHANGELOG.md` 又把成本写成 `+327 B` 并称 benchmark 通过，与提交中的 `+642 B` 不一致。

影响：性能和合同门禁被新的基线吸收，后续正常 benchmark 即使变绿也无法证明本次增长/合同变化经过审批。需要提供显式、可审计的 contract rebaseline 流程，不能直接改 JSON 越过硬门禁。

### P2-S1 `PackingResult` 仍不是自动和手动共享的唯一事实源

自动路径在 [`src/lib/packing.ts:1353`](../src/lib/packing.ts#L1353) 执行最终支撑重算，再派生 depth、work steps 和 layers。手动路径却由 [`toPlacedBoxes`](../src/lib/manualPlacement.ts#L831) 先写入默认伪数据，再在 [`buildManualPackingResult`](../src/lib/manualSteps.ts#L113) 独立派生结果。

这不是两个算法共享一个结果合同，而是两个生产者各自拼装同名字段。自动路径的支撑修复无法自然覆盖手动路径，正是本轮 P1-B1 的根因。应把“最终坐标 -> 支撑图 -> physical layer -> work steps -> layers/diagnostics”做成共享的、可测试的结果终结器。

### P2-S2 顶层编排和 3D 组件仍超出可维护边界

- `src/Workbench.tsx` 当前 2476 行，包含约 49 个 `useState` 调用和 14 个 `useEffect` 调用；导入、导出、历史、导航、手动模式、结果派生和 3D 编排仍集中在同一状态中心。
- `ResultsPanelProps` 与 `VisualizationWorkspaceProps` 均超过 60 项，说明 JSX 虽被移出，状态所有权和行为边界仍未下沉。
- `src/components/ContainerScene.tsx` 当前 1310 行、约 25 个 effect；[`plans/2026-07-27-containerscene-split.md:146`](../plans/2026-07-27-containerscene-split.md#L146) 的 `<=600` 行验收标准仍未达到。
- [`src/App.tsx:2`](../src/App.tsx#L2) 在登录前静态导入整个 `Workbench`，登录边界懒加载仍未完成。

这些是既有架构债，不是本 diff 新增的单点回归；但本轮整体架构仍不能标记为完成。下一步应按业务边界下沉状态和命令，而不是继续增加更宽的区域 props。

### P2-S3 手动入口复制逻辑重复，状态模型混淆“未初始化”和“用户删空”

[`useManualPlacementSession.ts:214`](../src/hooks/useManualPlacementSession.ts#L214) 和 [`useManualPlacementSession.ts:436`](../src/hooks/useManualPlacementSession.ts#L436) 各自复制约 35 行“自动结果 -> ManualDraft”映射。朝向、基础尺寸或货物属性以后新增一项，就必须同时修改两个入口。

同时，`setMode('manual')` 用 `draft.boxes.length === 0` 判断是否首次进入。用户主动删空手动方案、切回自动、再进入手动时，也会被当成“从未初始化”并重新灌入自动结果。现有测试只覆盖非空草稿，不覆盖“用户故意保留空方案”。

建议：抽出纯转换函数，并在 session state 中记录显式初始化状态或草稿来源，不能从箱数推断用户意图。

### P2-S4 新增 `depthLayer` 没有完整进入结果合同保护

[`src/types.ts:69`](../src/types.ts#L69) 把 `depthLayer` 定义为可选字段；作业分组消费者在 [`loadingTaskGroups.ts:59`](../src/lib/loadingTaskGroups.ts#L59) 和 [`loadingTaskGroups.ts:100`](../src/lib/loadingTaskGroups.ts#L100) 用 `?? 1` 静默回退。更重要的是，[`packingContract.ts:66`](../src/lib/packingContract.ts#L66) 的 canonical placement 没有记录 `depthLayer`。

本轮把装柜波次从 `physicalLayer` 迁到 `depthLayer`，它已经是输出业务合同，而不是可有可无的内部缓存。当前 golden 无法发现它丢失或整体退化为 1。

### P2-S5 账号/用户管理范围在文档和实现之间冲突，尚未形成决策

最新 [`AGENTS.md:168`](../AGENTS.md#L168) 明确写“暂不实现多用户、权限、账号、许可证”；`PRD.md` 又同时要求保留管理员运维能力（[`PRD.md:21`](../PRD.md#L21)、[`PRD.md:521`](../PRD.md#L521)），并在验收标准写账号不作为有效入口（[`PRD.md:590`](../PRD.md#L590)）。当前管理员仍可从 [`WorkbenchHeader.tsx:61`](../src/components/WorkbenchHeader.tsx#L61) 和 [`PackingSidebar.tsx:216`](../src/components/PackingSidebar.tsx#L216) 进入完整 Users 页面。

这里有互相冲突的规则，不能静默挑一条执行。需要在 `decision.md` 明确：保留登录/审计作为基础设施时，是否仍允许暴露用户管理产品入口。

## Spec / 业务 Findings

### P1-B1 手动 `PackingResult` 仍把所有箱体伪装成落地第 1 层

[`toPlacedBoxes`](../src/lib/manualPlacement.ts#L831) 对每个手动箱固定写入：

```ts
physicalLayer: 1
supportType: 'floor'
supportedBy: []
```

随后 [`buildManualPackingResult`](../src/lib/manualSteps.ts#L113) 只调用 `assignDepthLayers`；自动路径的 [`reconcileSupportRelations`](../src/lib/packing.ts#L184) 是私有函数，手动路径无法复用。即使一个手动箱合法地放在另一个箱体上，结果仍会显示为落地第 1 层。

影响：手动多层方案的分层、2D/3D、明细、回放、loading sheet、作业步骤和导出共同消费错误字段。它违反 [`PRD.md:265`](../PRD.md#L265) 的支撑分层规则和 [`PRD.md:388`](../PRD.md#L388) 的手动方案数据模型要求。

### P1-B2 自动算法仍会产出违反 `stackable/maxStackLayers` 的非法方案

当前两条测试不是 snapshot 漂移，而是直接调用 `violatesStackChain()` 检查支撑链：

- snapshot-11 场景：不可堆叠货物承载到第 4 层；
- snapshot-12 场景：`maxStackLayers=1` 货物承载到第 4 层。

[`decision.md:28`](../decision.md#L28) 已记录根因：算法只向下检查新箱的支撑链；后插入已有上层箱下方的货物，不会触发向上复核。选择“保持 RED”是诚实记录，不是缺陷关闭。

影响：违反 [`PRD.md:184`](../PRD.md#L184) 的硬约束“不可堆叠货物上方不得放置其他货物”，且当前方案仍进入可视化、导出与保存链路。

### P1-B3 合规守卫只是两个 UI 按钮的局部守卫，命令和其他出口仍可绕过

[`ResultsPanel.tsx:295`](../src/components/ResultsPanel.tsx#L295) 只在手动模式有 blocking issue 时禁用主报告的 XLSX 和保存按钮（[`ResultsPanel.tsx:329`](../src/components/ResultsPanel.tsx#L329)）。以下路径没有同一业务守卫：

- [`saveCurrentPlan`](../src/Workbench.tsx#L1921) 自身不校验；History 页面从 [`HistoryPage.tsx:69`](../src/components/HistoryPage.tsx#L69) 直接调用它。
- Playback XLSX：[`Workbench.tsx:1820`](../src/Workbench.tsx#L1820)。
- Loading sheet PDF：[`Workbench.tsx:1853`](../src/Workbench.tsx#L1853)。
- 当前 2D/3D 视图：[`Workbench.tsx:1893`](../src/Workbench.tsx#L1893)。
- Review JSON/Excel：[`Workbench.tsx:1868`](../src/Workbench.tsx#L1868)。

守卫还只看 `manualIssues`，自动结果即使含 `severity='error'` 的 stacking diagnostic 也不阻止保存/导出。合法性必须在命令边界集中判定，UI disabled 只能作为反馈，不能作为业务安全边界。

### P1-B4 货物编辑仍不会完整同步既有手动箱

[`ManualCargoPlanItem`](../src/lib/manualPlacementSession.ts#L10) 只包含 `id/quantity/weight/stackable/maxStackLayers/groundOnly`；[`reconcileDraft`](../src/lib/manualPlacementSession.ts#L46) 也只同步这些字段。仍未同步：

- `length/width/height`；
- `canRotate`；
- 基础尺寸与朝向元数据；
- 全局 `defaultMaxStackLayers` 的变化。

因此编辑尺寸后，CargoItem 和既有手动箱会同时保留两套几何；把可旋转改为不可旋转后，旧手动箱仍可能继续旋转。与 [`PRD.md:147`](../PRD.md#L147) “编辑后所有视图和导出同步更新”不符。

### P1-B5 缺失或非数字重量仍被静默转成 0

[`numberValue`](../src/lib/importCargo.ts#L124) 对 `undefined`、空值和不可解析文本统一返回 0；[`parseCargoRows`](../src/lib/importCargo.ts#L287) 再用 `Math.max(0, ...)` 写入货物。负数被 clamp 只是避免负值抵消载重，没有解决“未知重量被当成零重量”。手工编辑数字也在 [`Workbench.tsx:1640`](../src/Workbench.tsx#L1640) 允许 0。

影响：真实总重量可能被系统性低估，违反 [`PRD.md:189`](../PRD.md#L189) 的最大载重硬约束。重量缺失/非法应是行级错误或明确的待确认状态，不能静默赋 0。

### P1-B6 历史方案仍是“输入模板”，不是可恢复的装柜方案

[`HistoryPlanData`](../src/api/historyPlans.ts#L4) 只保存柜型、CargoItem、数量/层数/标签摘要和默认层数；[`restoreHistory`](../src/hooks/usePackingSession.ts#L81) 用当前版本的 `calculatePacking` 重新计算。

这会丢失：手动坐标、朝向、层级、支撑关系、诊断、模式，以及旧算法当时的自动结果。`decision.md` 已将正确快照契约延期，但 [`PRD.md:388`](../PRD.md#L388) 和 [`PRD.md:512`](../PRD.md#L512) 的验收仍然开放。

### P1-B7 Excel 导入仍不是“解析 -> 预览 -> 提交”的事务

自动路径在 [`Workbench.tsx:1779`](../src/Workbench.tsx#L1779) 中，只要 `imported.items.length > 0` 就 dispatch `cargoImported`，即使同一批还有 errors；reducer 会整体替换当前数据。手动映射路径在 [`CargoImportDialog.tsx:249`](../src/components/CargoImportDialog.tsx#L249) 解析后也直接 `onConfirm(imported.items, messages)`，没有因 errors 阻止提交。

影响：有错误的工作簿会先丢弃坏行并覆盖用户现有货物，用户只能事后从日志看到结果，不能在覆盖前确认或回滚。该项虽在 `decision.md` 延期，仍违反 [`PRD.md:447`](../PRD.md#L447) 的确认前不得覆盖要求。

### P1-B8 “导出实际朝向”仍只是在混合场景中清空尺寸

[`ExportPlanRow`](../src/lib/exportPlan.ts#L4) 没有 `orientationKey` 或朝向数量字段。混合朝向时，[`buildExportPlanRows`](../src/lib/exportPlan.ts#L35) 将实际长宽高置空，仅在备注写 `Mixed orientations: LWH, WLH`；对应测试甚至把三个空值作为成功条件（[`exportPlan.test.ts:209`](../src/lib/exportPlan.test.ts#L209)）。

这无法回答每个朝向各有多少件；单一朝向下，等边尺寸也不能从实际尺寸反推出朝向。与 [`PRD.md:467`](../PRD.md#L467) 导出“实际朝向”的字段要求不符。

### P2-B1 `labelStats` 的领域合同仍是“每条 CargoItem 一行”，不是“按标签统计”

摘要的货物类型数已使用 [`countDistinctLabels`](../src/lib/labels.ts#L12)，但自动路径 [`packing.ts:1373`](../src/lib/packing.ts#L1373) 和手动路径 [`manualSteps.ts:50`](../src/lib/manualSteps.ts#L50) 仍对 `cargoItems.map()`，同一业务标签会产生多条 stats。

历史摘要、loading sheet 图例和导出继续消费该数组；[`exportPlan.ts:33`](../src/lib/exportPlan.ts#L33) 又用 `label+name` 做 `find`，同标签多行可能重复展示或错配统计。`PackingResult.labelStats` 应明确按标签聚合，符合 [`PRD.md:175`](../PRD.md#L175) 的业务术语。

### P2-B2 映射弹窗仍没有确认前的转换结果和行级业务预览

[`CargoImportDialog.tsx:278`](../src/components/CargoImportDialog.tsx#L278) 只截取原始 preview rows；[`CargoImportDialog.tsx:347`](../src/components/CargoImportDialog.tsx#L347) 只渲染原始列值。真正的 `parseCargoRowsWithTemplate` 要到点击确认时才执行（[`CargoImportDialog.tsx:249`](../src/components/CargoImportDialog.tsx#L249)）。

因此用户在确认前看不到换算后的毫米值、预计有效行、错误行、警告行和厘米换算数，不满足 [`PRD.md:447`](../PRD.md#L447) 的映射确认设计。

### P2-B3 手动超重会生成重复 diagnostic ID

[`buildManualDiagnostics`](../src/lib/manualSteps.ts#L65) 先根据总重量推入 `id='weight-check'`，随后又把 `validationIssues` 中的 `overweight` 映射成相同 ID。内部 `seen` 只对 issue type 去重，不会与前一条 diagnostic 去重。诊断页在 [`ResultsPanel.tsx:456`](../src/components/ResultsPanel.tsx#L456) 用 `diagnostic.id` 作为 React key。

影响：超重时可能出现重复信息和重复 key warning；这也说明诊断仍从“结果重算”和“外部 issue”两个来源拼接，缺少唯一的诊断生成边界。

## 验证结果

| 验证项 | 当前 HEAD 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm test` | **失败**：81 文件通过、1 文件失败；641 项通过、1 项失败 |
| `npm run test:packing-performance` | **失败**：1 文件失败、1 文件通过；5 项通过、1 项失败 |
| `npm run build` | 通过；主 chunk `1,067.20 kB`，gzip `297.56 kB`，保留大 chunk warning |
| P2-6 31 托定向 E2E | 通过：1/1，约 6.1 秒测试时间 |
| P2-2 冲突的手动流程定向 E2E | **失败：4/4** |
| 全量 E2E | 本次未重跑；由于上述 4 项属于全量集合，当前全量不可能为全绿 |
| benchmark | 本次未执行正式采样；baseline 前后按硬门禁比较为 7 项拒绝 |
| `git diff --check 5fa9856...HEAD` | 通过 |

## 建议处理顺序

1. 先修自动算法的 capacity-one 后插入校验，让两条硬约束测试真实转绿；任何 error diagnostic 的自动结果不得进入保存/导出。
2. 提取共享的 `PackingResult` 终结器，让自动和手动统一派生支撑、物理层、作业拓扑、layers 和 diagnostics；补手动多层业务测试。
3. 把合规判定下沉到保存/导出命令边界，覆盖历史页、XLSX、PDF、当前视图和 review 导出。
4. 完成 CargoItem -> ManualDraft 的尺寸/旋转/默认堆叠同步，并用显式状态区分“未初始化”和“用户删空”。
5. 关闭重量、事务导入、朝向导出和 labelStats 四个数据合同；映射弹窗复用解析器生成确认前预览。
6. 设计带版本的历史方案快照后再开放“恢复方案”验收；旧记录必须走可见降级。
7. 恢复可信门禁：先让单测和 E2E 全绿，再通过显式审批流程更新 contract/benchmark baseline，修正 CHANGELOG 中 `+327 B` 与“通过”的错误记录。

## 汇总

- Standards / 架构：7 项 finding；最严重的是质量门禁被误报为通过，以及 benchmark baseline 绕过 7 项硬门禁。
- Spec / 业务：11 项 finding；最严重的是自动算法仍产出非法堆叠方案，且手动结果没有真实垂直支撑/分层契约。
