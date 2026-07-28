# 2026-07-28 对架构与业务复审的回应

针对 `issues/2026-07-28-refactor-review-architecture-business.md` 的逐条核实。

## 1. 结论

**接受 BLOCKED 判定。** 我独立复现了两条承重指控的全部统计数字，结果与报告逐位一致。

P1-1 和 P1-2 不是 UI bug，是**装箱业务语义错误**：现场按导出的作业步骤装货会遇到「先装上层、后装支撑物」的不可执行指令。这比我上一轮修的三个问题严重，而且我上一轮的复核**没有发现它们**——我当时只核实了 Codex 列出的条目，没有独立检查业务不变量。

另外要指出：报告说「没有发现这些修复引入新的运行时回归」，但它列出的 P3（我的模板测试只用名称做代理）确实指出了我修复中的一处测试弱点，这条我已修。

## 2. 我独立复现的数字

用 `scripts/packing-benchmark-cases.mjs` 加载与 golden 完全相同的五组夹具，直接跑 `calculatePacking`：

| Case | 箱数 | `physicalLayer≠verticalLayer` | 两套支撑不一致 | 反向支撑边 | **落地箱不在第1层** |
|---|---:|---:|---:|---:|---:|
| russia-volume | 31 | 29 | 29 | 0 | 29 |
| vietnam-20gp-quantity | 463 | 434 | 457 | 173 | 89 |
| vietnam-20gp-volume | 462 | 433 | 456 | 162 | 89 |
| vietnam-40hq-quantity | 839 | 806 | 832 | 333 | 201 |
| vietnam-40hq-volume | 823 | 793 | 816 | 461 | 181 |
| **合计** | **2618** | **2495** | **2590** | **1129** | **589** |

前四列与报告完全一致。**最后一列是我补充的**：589 个 `z=0` 的落地箱其 `physicalLayer≠1`，直接违反 PRD 9.3「接触地面的箱体为第 1 层」——这是比「两套字段不一致」更硬的证据，因为它不需要论证哪套字段才是权威。

根因在 `src/lib/layers.ts:11-40`：`assignDepthLayers` 无条件覆盖三个字段，且把 X 轴推靠关系写成 `supportType='fully-supported'`。落地箱只要 `x>0` 就被判成第 2+ 层且声称「被完全支撑」，而它下方其实什么都没有。

PRD 原文我也逐字核对了（`PRD.md` 9.3 与 11.1.3），报告的引用准确。

## 3. 逐条核实结果

### 业务 Findings

| # | 指控 | 核实 | 关键证据 |
|---|---|---|---|
| P1-1 | 层级/支撑被 X 轴推进覆盖 | **独立复现** | `layers.ts:11-40` 无条件覆盖；589 落地箱不在第1层 |
| P1-2 | 作业顺序无支撑拓扑约束 | **独立复现** | 1129 条反向边，数字逐位一致 |
| P1-3 | 非法手动方案可保存导出 | **已核实** | `manualPlacement.ts:822` 是 `void invalidBoxIds`（参数接了就丢）；`manualSteps.ts:126` 是 `diagnostics: []`；`validateDraft` 无载重校验 |
| P1-4 | 货物编辑不同步手动箱 | 已核实（读码） | 对账键只有 `{id, quantity}`；`enrichPlacedBoxes` 只刷新名称/标签/颜色 |
| P1-5 | 历史只存输入并重算 | 已核实 | `HistoryPlanData` 无 `PackingResult`/mode/坐标 |
| P1-6 | 非法重量绕过载重约束 | **已核实** | `numberValue` 非数字转 `0`；`parseCargoRows:287` 原样接受负重量；算法用 `usedWeight + weight >` 判断，负值会抵消 |
| P1-7 | 导入非事务式 | 已核实（读码） | 有错误行仍 `onConfirm` → reducer 整体替换 |
| P1-8 | 编辑截断标签 | **已核实** | `Workbench.tsx:1656` 与 `:1696` 均 `.slice(0, 2)` |
| P1-9 | 导出无法表达朝向 | **已核实** | `ExportPlanRow` 无 `orientationKey`；尺寸取 `placedBoxes[0]` |
| P2-1 | 间隙重复扣减 + 重心坐标空间不一致 | **独立复现（数值）** | 见下 |
| P2-2 | 手动模式两种进入语义 | 已核实（读码） | 切换只换模式，仅「继续手动」复制自动结果 |
| P2-3 | 同标签统计未聚合 | **已核实** | `packing.ts:1261` 按 `cargoItems.map` 生成 |
| P2-4 | 手动映射仍丢字段 | 成立（我上轮的记录） | `KNOWN_GAPS` 明确接受，见 §5 |
| P2-5 | 弹窗缺确认前业务预览 | 已核实（读码） | 只显示原始行列与单元格 |
| P2-6 | 31 托缺端到端验收 | 未独立验证 | 方向与我读到的测试范围一致 |

**P2-1 的数值验证**（12000×2400×2600，间隙 100/50/50）：

```
raw       L/W/H : 12000 2400 2600
effective       : 11900 2300 2550
capacity(raw)   : totalVolume 69,793,500,000
capacity(eff)   : totalVolume 64,900,000,000   ← Workbench 实际传入的
```

容量被少算 **约 7%**。`Workbench.tsx:1164` 传入的 `renderingContainer` 已经是 effective，`remainingCapacity.ts:24` 又执行一次 `effectiveContainer()`。而 `Workbench.tsx:1412` 的重心计算用的是原始 `selectedContainer`，与箱体坐标所在的 effective 空间不一致。

### 架构 Findings

| # | 指控 | 核实 |
|---|---|---|
| A1 | `PackingResult` 不是唯一契约 | 成立，是多数 P1 的共同根因 |
| A2 | Workbench 仍是状态中心 | **数字核对无误**：2472 行、50 `useState`、15 `useEffect` |
| A3 | 区域组件只搬了 JSX | 成立（与我上轮自评一致） |
| A4 | ContainerScene 未达标准 | **数字核对无误**：1309 行、26 个 effect |
| A5 | 登录前懒加载未完成 | 成立（我已在 CHANGELOG 标注未完成项） |
| A6 | Golden 冻结错误字段 | 成立，且是 P1-1/P1-2 能全绿通过的原因 |

A6 值得单独说：golden 只做快照相等，两套冲突字段被一起冻结。所以 `npm test` 全绿**不构成**分层与作业顺序正确的证据。这也解释了为什么这些问题能一直存活——测试在保护现状，不在保护业务不变量。

## 4. 我本轮已修的三项

都属于「针对我自己上轮工作的批评」，成本低且不触碰业务逻辑，直接修掉：

**P3 模板测试只用名称做代理**（`4de4bf1`）
批评成立。我上轮在注释里说明了 `select.value` 无法区分「保留」与「清空」，但注释不是断言。现在改为：加载失败后恢复 catalog，断言 select 回到 `t1`，并断言保存仍走 update 分支——「保留名称但清空 ID」的回退无法再溜过。

**`--allow-new-baseline` 缺行为测试**（`4de4bf1`）
批评成立。把守卫决策抽成纯函数 `newBaselineRefusal(path, allow)` 并加测试（无 flag 时返回含 `--allow-new-baseline` 提示的拒绝文案，有 flag 时返回 null），同时验证它在 `main()` 真实路径上仍在写文件之前抛出。

**P3 尾部空行**（`4de4bf1`）
已修，`git diff --check` 干净。

**关于「update 守卫不比较 timing」这条，我没有反转它的行为，理由如下：**

`scripts/frontendBenchmark.test.mjs:203` 有一条测试显式编码了「update 允许 timing rebaseline」，而 `decision.md` 2026-07-21 的记录说明这是有意设计——update 的本职就是刷新 timing 样本（含 `iterationsPerSample` 100→500 这类合同迁移）。如果 update 也比较 timing，它就无法完成本职工作。

上一轮我犯的错正是「擅自改掉编码了决策的测试」，所以这次我不重复：改为**只加可见性，不改契约**。新增 `acceptedTimingRegressions()`，在 update 接受超过 20% 的 timing 放宽时打印每一项的前后值与增幅，并提示「机器有负载就丢弃重跑；确属真实回退就记入 decision.md」。这样 `ca1fc1a` 那种静默放宽不会再无声发生，但迁移能力保留。

是否要进一步把 update 也纳入 timing 门禁，是需要你拍板的策略问题，不是我该单方面决定的。

## 5. 一处我认为报告判断偏了的地方

**P2-4 把 `KNOWN_GAPS` 当作新发现的缺陷，但它是我上轮主动记录并公开的既有缺口。**

上一轮我加对齐测试时，它发现了 Codex 当时没报的额外漂移。我查了抽取前的原始实现（`32adad9~1` 的 `preSelectCol`），确认 `label` 的 `標籤/托盤/代號`、`name` 的 `名稱/貨物名稱`，以及 `color`/`canRotate`/`stackable` 三个字段**从来就没有候选项**——不是重构回退。按项目「surgical changes，不静默改动无关行为」的要求，我没有顺手扩大，而是编码成带说明的 `KNOWN_GAPS` 让缺口在代码里可见。

这个区分重要，因为它决定处理方式：作为**既有产品缺口**，补齐会改变现有用户工作簿的预选列，需要单独决策；作为**回退**则应立即修复。

报告对严重性的判断我接受（`canRotate`/`stackable` 未预选会回落 `true`，确实改变装箱合法性），但它是**待决策项**而非**本轮引入的缺陷**。建议归入建议顺序第 4 步「收紧输入与导出边界」一并处理。

## 6. 对建议处理顺序的意见

报告的五步顺序我同意，只对第 1 步补充一点执行约束：

**先立不变量测试，再改算法，最后才重新生成 golden。** 顺序反了就会重演 A6——先改算法再刷 golden，新 golden 只是把新行为再冻结一次，仍然不证明正确。至少要先有这三条断言（A6 已列出，我认同）：

- 落地箱（`z=0`）必须 `physicalLayer===1`
- 上层箱的 `supportedBy` 必须来自底面支撑（即与 `verticalSupportedBy` 一致）
- 每条支撑边满足 `support.workStep < box.workStep`

这三条现在会分别失败 589 / 2590 / 1129 项，正好构成 RED 基线。

另外第 1 步涉及一个我需要你确认的设计问题：`physicalLayer` 被 X 轴语义覆盖，说明「推靠深度」这个概念也有真实用途（`assignDepthLayers` 不是凭空加的）。修复方向是二者之一：
- **A**：`physicalLayer` 恢复为垂直支撑深度，推靠深度另立字段（如 `depthLayer`），2D/3D/分层各自选用
- **B**：确认推靠深度无产品需求，直接删除 `assignDepthLayers`

我倾向 A（保留能力、消除字段冲突），但这取决于分层视图究竟要表达装柜作业的哪个维度，属于产品语义问题。

## 7. 当前门禁状态

| 项 | 结果 |
|---|---|
| `npm run lint` | 通过 |
| `npm test` | 83 文件 / **614** 项通过（本轮 +5） |
| `npm run build` | 通过（主 chunk 大文件警告依旧） |
| `npm run test:e2e` | 119/119（未因本轮改动重跑，改动仅涉及测试与 benchmark 脚本） |
| `npm run benchmark` | 仍 RED：initial JS `+327 B`（`+0.11%`） |

`+327 B` 那条仍是上一轮 `decision.md` 里待你决定的项，本轮未动。
