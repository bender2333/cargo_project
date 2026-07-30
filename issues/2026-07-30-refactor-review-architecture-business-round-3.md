# 2026-07-30 重构复审与代码审查（第三轮）

## 状态

- 审查结论：**BLOCKED，当前 HEAD 不具备合并、发布或业务验收条件**。
- 固定点：`5fa9856`。
- 上一轮目标：`6dfcc0b`。
- 当前目标：`b13b9fd`。
- 审查范围：`git diff 5fa9856...b13b9fd`，并复核 [`2026-07-29-refactor-review-architecture-business-round-2.md`](./2026-07-29-refactor-review-architecture-business-round-2.md) 的全部 findings。
- 需求基线：`AGENTS.md`、`PRD.md`、`decision.md`。
- 重要事实：`6dfcc0b..b13b9fd` 只有提交 `b13b9fd docs: record second architecture and business re-review`，运行时代码、测试、baseline 和业务夹具均未修改。因此上一轮开放项没有因新实现获得关闭证据。
- 审查性质：只新增本报告并更新 `CHANGELOG.md`、`decision.md`；不修改运行时代码、测试、baseline 或业务夹具。

## 结论摘要

自动垂直支撑/分层、支撑拓扑作业顺序、effective 柜空间、映射别名、长标签和 31 托真实流程仍保持已关闭；31 托定向 E2E fresh 通过 `1/1`。但自动算法仍稳定产出 capacity-one 非法堆叠，手动结果仍伪造垂直支撑，保存/导出守卫仍可绕过，历史快照、事务导入、实际朝向导出和标签统计合同均未闭环。

本轮全量 E2E 从上一轮定向确认的 4 条冲突扩大为 **8 条稳定失败**：进入手动模式自动接管 18 箱后，旧用例仍要求空草稿和可用货物池。该行为本身与 PRD 11.1.1 一致，但实现、测试和“用户主动删空”状态模型没有形成统一合同。另新增 3 项 P2：隐藏手动草稿可被全局撤销快捷键修改、导入映射弹窗缺少对话框可访问性边界、自动 error diagnostics 没有进入复核清单及其导出。

## 上一轮修复复审矩阵

| 上一轮 finding | 当前状态 | fresh 证据 |
| --- | --- | --- |
| P1-S1 质量门禁 RED 被写成通过 | **开放** | `npm test`、packing-performance、全量 E2E、benchmark 均 RED |
| P1-S2 benchmark baseline 绕过硬门禁 | **开放** | baseline 仍包含 5 个 contract hash 改写及 initial JS/total 各 `+642 B`；当前 benchmark 继续拒绝增长 |
| P2-S1 自动/手动没有共享结果终结器 | **开放** | 自动调用 `reconcileSupportRelations`；手动仍由 `toPlacedBoxes` 默认伪字段后独立构造 |
| P2-S2 顶层编排和 3D 组件过大 | **开放** | `Workbench.tsx` 2476 行；`ContainerScene.tsx` 1310 行；`ResultsPanel`/`VisualizationWorkspace` props 仍超过 60 项；`App.tsx` 静态导入 Workbench |
| P2-S3 手动入口重复映射且空草稿语义混淆 | **开放** | `setMode` 与 `continueFromAutomatic` 继续复制映射；仍以 `draft.boxes.length === 0` 推断未初始化 |
| P2-S4 `depthLayer` 未进入合同保护 | **开放** | `PlacedBox.depthLayer` 仍可选；`canonicalizePackingResult().placements` 仍不记录它 |
| P2-S5 用户管理范围冲突未决 | **开放** | header/sidebar 仍向管理员暴露 Users 页面；`decision.md` 无对应决策 |
| P1-B1 手动结果伪造落地第 1 层 | **开放** | `toPlacedBoxes` 仍固定 `physicalLayer:1/supportType:'floor'/supportedBy:[]`；手动结果不重算支撑 |
| P1-B2 自动算法违反 stack capacity | **开放且 fresh RED** | `top-only-L-8`、`capacity-one-0-10` 均在容量 1 支撑链第 4 层 |
| P1-B3 合规守卫存在旁路 | **开放** | 仅 ResultsPanel 主 XLSX/保存按钮检查 blocking manual issue；命令、历史页、辅助导出和自动 error diagnostic 均未守卫 |
| P1-B4 手动箱未完整同步货物编辑 | **开放** | cargo plan/reconcile 仍缺尺寸、`canRotate`、原始姿态和全局默认层数 |
| P1-B5 缺失/非法重量静默变 0 | **开放** | `numberValue` 仍统一返回 0，`parseCargoRows` 写入 `Math.max(0, ...)` |
| P1-B6 历史只保存输入 | **开放且已延期** | `HistoryPlanData` 无模式、坐标、朝向、支撑、诊断和版本化结果；恢复仍以当前算法重算 |
| P1-B7 Excel 导入非事务式 | **开放且已延期** | 自动/手动映射路径在错误存在时仍可直接 `cargoImported/onConfirm` 覆盖当前数据 |
| P1-B8 导出实际朝向不完整 | **开放** | `ExportPlanRow` 无朝向/朝向数量字段；混合朝向只清空尺寸并写备注 |
| P2-B1 `labelStats` 未按标签聚合 | **开放** | 自动和手动计划统计仍按 `CargoItem` 逐条产生；仅摘要显示时二次去重 |
| P2-B2 映射前无业务预览 | **开放** | 预览仍渲染原始单元格；解析器只在确认时执行 |
| P2-B3 手动超重 duplicate diagnostic ID | **开放** | `buildManualDiagnostics` 先推 `weight-check`，再把 `overweight` issue 映射为相同 ID |

## 本轮新增 Standards / React Findings

### P2-N1 全局撤销/重做会在自动模式和其他页面修改隐藏手动草稿

[`src/Workbench.tsx:1294`](../src/Workbench.tsx#L1294) 注册 window 级 keydown；[`src/Workbench.tsx:1306`](../src/Workbench.tsx#L1306) 对 `Ctrl/Cmd+Z`、`Ctrl/Cmd+Y` 直接调用 `undoManualPlacement` / `redoManualPlacement`。它只排除 input、textarea 和 contentEditable，没有检查 `placementMode === 'manual'`、`activeNav === 'overview'` 或焦点是否位于手动工作区。

最小路径：手动编辑一次 → 切回自动模式或打开历史/模板页 → body/button 获得焦点时按 Ctrl+Z → 隐藏手动草稿被修改，浏览器或页面原本的撤销也被 `preventDefault()` 阻断。用户返回手动模式后才看到意外回退。

影响：隐藏状态可被不可见命令修改，违反可预测交互和单一活动上下文边界。

### P2-N2 Excel 映射弹窗没有对话框语义与键盘边界

[`src/components/CargoImportDialog.tsx:282`](../src/components/CargoImportDialog.tsx#L282) 使用两个普通 `div` 实现视觉模态层；组件没有 `role="dialog"`、`aria-modal`、标题关联、打开后焦点定位、focus trap 或 Escape 关闭处理。

影响：屏幕阅读器无法识别模态上下文；键盘焦点可进入被遮挡的 Workbench，且会触发上述 window 级快捷键。导入确认是覆盖当前货物的数据入口，该可访问性缺口也构成状态安全风险。

## 本轮新增 Spec / Business Finding

### P2-N3 自动 error diagnostics 没有进入复核清单和复核导出

[`src/lib/reviewChecklist.ts:40`](../src/lib/reviewChecklist.ts#L40) 只提取非 info diagnostic ID；这些 ID 仅在存在 `unplaced` 时挂到未装入项目（[`src/lib/reviewChecklist.ts:81`](../src/lib/reviewChecklist.ts#L81)）。函数没有把 diagnostics 自身转换为 checklist item。

当前 capacity-one 场景会生成 `stacking-check: error`，但若已装结果没有对应未装入项，复核清单的 `errorCount`、JSON 和 Excel 导出可以完全不包含该硬约束错误。用户在“合规与诊断”页能看到错误，在“复核清单”及其对外文件中却看不到。

影响：同一 `PackingResult` 的两个审核出口结论不一致，违反 PRD 8 的“图上所有箱体必须合法”和 PRD 14 的诊断/导出一致性要求，也进一步证明当前自动 error diagnostic 没有形成集中合规门禁。

## 仍成立的关键业务阻塞

### P1 自动算法仍产出非法堆叠

`respectsMaxStackLayers` 只沿新箱的支撑链向下检查。后续箱体插入已有上层箱下方时，不会向上复核已有乘员。最终 `reconcileSupportRelations` 能发现完整支撑图并生成 error diagnostic，但没有拒绝或移除非法 placement。PRD 8 的硬约束仍被违反。

### P1 手动结果仍没有真实支撑/分层终结流程

自动路径在最终坐标上执行 `reconcileSupportRelations → diagnostics → assignDepthLayers → assignWorkStepsByDepth → buildPackingLayers`。手动路径从 `toPlacedBoxes` 的伪支撑字段出发，只执行 `assignDepthLayers`，再以 depth/z/y/x 排序写 workStep。合法手动叠箱仍被报告为 floor/第 1 层，且没有保证支撑物先于上层箱。

### P1 合规判定仍不在命令边界

当前 disabled 只保护报告面板的主 XLSX 和保存按钮，并且只看手动 blocking issue。`saveCurrentPlan`、历史页保存、playback XLSX、loading sheet PDF、current view、review JSON/Excel 均无统一 guard；自动 `diagnostics.severity='error'` 也不阻止任何命令。

## 验证结果

| 验证项 | fresh 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm test` | **失败**：81 文件通过、1 文件失败；`packing.test.ts:556` capacity-one 硬约束失败 |
| `npm run test:packing-performance` | **失败**：1 文件通过、1 文件失败；`packing.stackfill.test.ts:69` capacity-one 硬约束失败 |
| `npm run build` | 通过；主 chunk `1,067.20 kB`，gzip `297.56 kB`，保留 >500 kB warning |
| 手动入口定向 E2E | **失败 0/4** |
| 全量 `npm run test:e2e` | **失败：112 passed / 8 failed**；8 项均集中在新手动入口语义与旧空草稿/货物池合同冲突 |
| 31 托完整定向 E2E | 通过 `1/1`，11.7 秒测试时间 |
| `npm run benchmark` | **失败**：initial JS/total 增长；3D 首像素 median `296.125 ms`、P95 `298.025 ms`，相对 baseline `206.625/238.125 ms` 均超 20% |
| benchmark 正确性合同 | 五个 contract hash 与当前 baseline 一致；benchmark Playwright `1/1` 通过 |
| `git diff --check 5fa9856...HEAD` | 通过 |

说明：首次 benchmark 与全量 E2E 并发时因端口 3010 冲突退出，随后在端口释放后独占重跑得到上述正式 RED；未修改配置、阈值、baseline、样本数或断言。

## 建议处理顺序

1. 修复自动 capacity-one 后插入校验，并在所有保存/导出命令边界统一拒绝任何 error diagnostic。
2. 提取自动/手动共享的结果终结器：最终坐标 → 支撑图 → physical layer → depth wave → 拓扑 work steps → layers/diagnostics。
3. 统一手动入口状态模型：显式记录初始化/来源，抽出单一自动转草稿函数，同步更新 8 条 E2E 合同并覆盖“用户主动删空”。
4. 完整同步 CargoItem 到 ManualDraft 的几何、旋转和默认堆叠规则；关闭重量与事务导入数据风险。
5. 让 `labelStats` 按业务标签聚合；导出结构化实际朝向与各朝向数量；映射弹窗在确认前展示解析结果并建立真正的 modal 焦点边界。
6. 实现带 schema 版本的历史方案快照；旧输入记录走可见降级。
7. 恢复可信门禁后再审批 benchmark contract/bundle baseline；先诊断 3D 首像素回退，不得用更新 baseline 吞掉。
8. 最后继续拆分 Workbench/ContainerScene 状态所有权和登录前静态 Workbench 依赖。

## 汇总

- 上一轮复审：18 项 finding 中，已关闭项保持关闭；**全部 18 项当时开放/部分开放 finding 当前仍开放**。
- 本轮新增：3 项 P2（隐藏手动草稿全局撤销、映射弹窗可访问性、复核清单遗漏自动 diagnostics）。
- fresh 门禁：lint/build/31 托通过；普通单测、packing-performance、全量 E2E、benchmark 失败。
- 最终结论：**BLOCKED**。
