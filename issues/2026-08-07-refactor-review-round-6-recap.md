# 2026-08-07 第六轮回溯审查：P1–P3 重构与后续（混合证据）

- 审查范围：`plans/2026-08-04-p1-production-safety-and-0802-redeploy.md`、`plans/2026-08-05-p2-test-and-gate-integrity.md`、`plans/2026-08-06-p3-packing-root-cause-and-boundaries.md` 三轮的执行结果（约 40 提交），目标回答三问：可维护性/模块化是否变好；之前的根因问题是否解决、性能方向如何；`0802` issue 是否已解决。
- 审查方式：文档证据链（round-5 审查、三份计划、CHANGELOG、decision.md、plans/status.json）+ 定点源码核对（`packing.ts:444-451, 881-902, 1157-1188`、`quickPlace.ts:95-158`、`Workbench.tsx:773-899`）+ **本地复跑三组测试**（`packingInvariants` 15/15、`packing.blockEngine` 6/6、全量单测 **98 files / 856 tests / 0 failed**，83s）。
- 本文是**发现记录**，不是实施计划。两个后续计划见 `plans/2026-08-07-knife5-visual-selection-ownership.md` 与 `plans/2026-08-07-packing-spatial-index.md`。
- 命名澄清：仓库只有 `issues/0720` 与 `issues/0802`，全库 grep 无 `0822`；用户问题中的「0822」按 `0802`（2026-08-03 立案：越南 40HQ 860/877 + 手动同型号方向混摆）回答。

---

## 证据分级

- **已复跑证实**：三组本地测试计数、benchmark 报告对基线的数值对比、`src/lib/` 无反向依赖、`activeResultTab` 双驱动链路（本文件引用的 file:line 均按 HEAD `a45f9cb` 核对）。
- **文档证实（执行者记录）**：生产部署两次连续 remote E2E 128/128、Vietnam 877/877 在生产验收通过（`CHANGELOG` P1-3c 条目）。
- **未验证**：0802 输入的 `maxStackLayers:99` / `groundOnly:true` 上游 provenance（Excel 单元格 vs 模板默认；快照未存源工作簿）；rotation gizmo 候选缺陷（沿用 round-5 结论，仍不在范围）。
- **已知 mislabel**：本地 benchmark 算法段在满负载下跑过，`vietnam-40hq-volume` 等时延混有负载污染（见下「性能」），不代表纯算法对比。

---

## 摘要：三级成绩

| 维度 | 结论 | 依据 |
|---|---|---|
| 可维护性 / 模块化 | **B+，方向正确，收口差一刀** | lib 零反向依赖；纯 reducer+薄 hook 成立；`boxVisualState` 2D/3D 统一；放置合法性只剩一套。残留：Workbench 1908 行（线 ≤1500）、workspace props ~68（线 ≤25）、ContainerScene 1380 行（线 ≤600），即 round-5 的 M-7 / m2 半达成 |
| 根因修复 | **A-，root-cause 组全部落地且加了回归网** | 0802 四条（B-2/M-1/M-2/M-3）、支撑率双源（M-5）、C1-C3 状态机破口、生产安全三件套（B-1/M-9/M-11）；无删断言取绿 |
| 性能 | **B，一处真实回退待归因** | 20GP qty −25%、20GP vol −43%、40HQ qty −21%；40HQ vol +38%/p95 +69%（含负载污染，部分真实）|
| 0802 issue | **A，已解决且生产验收** | 877/877、28/28 groundOnly 落地、几何/堆叠/越界全零；remote 2×128/128 |
| 过程纪律 | **A，本轮最强项** | 未达标如实记「部分完成」（ContainerScene 600 行线）；两次生产回滚+一次删库事故如实记档；P2-4 建了 golden 防静默回归 |

---

## 一、可维护性：做对了什么、还差什么

### 已成立（下轮不要动）

1. **纯核 + 薄壳**：`packingSession.ts` / `manualPlacementSession.ts` 是纯 reducer；`packing.ts` 是引擎唯一入口、全仓 `calculatePacking` 仅 4 个调用点，无任何视图重算结果。
2. **分层方向**：`src/lib/` 反向依赖为零（本轮 grep 复验：无 `from '../components/'`、无 `from '../hooks/'`）；仅剩 4 个组件直连 `src/api/`（`CargoImportDialog`、`CustomContainerDialog`、`DebugPanel`、`UserManagement`），round-5 m5 已记档，非新发现。
3. **视觉单一源**：`boxVisualState.ts` 三档不透明度已同时服务 3D（`rendering.applyBoxVisualState`）与 2D（`ContainerPlan2D`），2D/3D 层选中漂移已消除（round-5 M-8 的修复）。
4. **放置合法性单一化**：场景侧 `computeInvalidByGeometry` 已废弃，3D 拖拽/放置改调 `manualPlacement.validateBox`，且场景侧驳回与 hook 侧一并进 issues 可回溯（round-5 M-6 的修复）。
5. **验证资产**：`packingInvariants.test.ts` 用纯几何独立重算 `supportedBy`，是对 0629「1129 条反向边」假绿的正本清源；本轮补充了 `placed+unplaced === total` 守恒断言（P2-1）。

### 未收口（带量化差距，不重新判定，直接沿用 round-5 记录）

| 指标 | 验收线 | 当前 | 出处 |
|---|---|---|---|
| `Workbench.tsx` | ≤1500 行 | 1908 | round-5 M-7 |
| `VisualizationWorkspace` props | ≤25 | ~68 | round-5 M-7 |
| `ContainerScene.tsx` | ≤600 行 | 1380 | round-5 m2（`7966204` 已自我记为部分完成）|

**本轮新证据（刀 5 未做的确切机制）**：`activeResultTab`（`Workbench.tsx:293`）除了驱动 ResultsPanel 页签（`ResultsPanel.tsx:356`），还驱动 `Workbench.tsx:837-843` 的 3D 重心 overlay `cogViewState` 与 `:859-864` 的柜型对比 `compareRows`；`activeLayerId` 还被 `:1023`（`activeLayerIndex`）与 `:1429-1441`（键盘层导航 `selectLayerByOffset`）消费。这三个状态同时被 ResultsPanel 与 3D 工作区双向消费，是 props 停在 68 的主因，也是「名义视觉 tab 实为跨区计算驱动」的最后残留。

## 二、根因修复与性能

### 已解决（均有 RED→GREEN 或前后对照）

- **0802 根因四连**（P3-2/3/4）：`maxStackLayers=99` 不再翻转策略（`packing.ts:444-451` 按 binding 判分支）；gate 改逐 SKU（`:892-901`），`maxStackLayers=12` 不再整批退回（P3-1 实测 877→827 的回归面已消除）；quickPlace 补传 `groundOnly`（`quickPlace.ts:117`）+ 块 fallback 纳入 groundOnly（`packing.ts:1163-1168`）。
- **支撑率双源**（P3-5）：自动路径接同一 `supportPolicy.minSupportRatio`（`packing.ts:916`），默认 0.5 时五个 golden hash 不变；`draftFromAutomaticResult` 已下移 `src/lib/manualDraftFromAutomatic.ts`。
- **状态机破口**（P3-6/7/8）：手动 draft 的 label/color 参与对账，保存不再抛错；编辑选中柜型 dispatch `resultInvalidated`（激活了 C4 的死代码逃生口）；`blockingInvalid` 箱体保留可见但退出统计口径，前后端 validator 同步接受该字段（golden 重生成、数量未退）。
- **生产安全**（P1-1/2/2b/3）：rollback 脚本 `--exclude=database.db` 并有 dry-run gate；生产不再种入已知口令 testuser；README 与实际「前端+Express+SQLite」架构对齐。
- **边界收口**：`ImportMappingValue` / `SceneViewMode` 下移到 lib（P3-9）；历史恢复跨 packing/manual 原子化（P3-13a）；0802 fixture provenance 以 SHA-256+SKU/箱数/flag 分布记录（P3-13c）；自定义柜型 payload 校验复用 `positiveNumber`（P3-12a）。

### 性能：真实改善 + 一处回退

当前报告 `test-results/benchmark/frontend-architecture.json`（2026-08-06T10:26Z）对基线 `test-data/baselines/frontend-architecture.json`（2026-07-28）：

| case | 基线 median/p95 | 当前 median/p95 | 变化 |
|---|---|---|---|
| vietnam-20gp-quantity | 134.3 / 139.1 | 101.0 / 109.1 | **−25% / −22%** |
| vietnam-20gp-volume | 155.1 / 157.5 | 88.0 / 93.5 | **−43% / −41%** |
| vietnam-40hq-quantity | 3020.5 / 3334.9 | 2386.1 / 2609.0 | **−21% / −22%** |
| vietnam-40hq-volume | 5194.2 / 5526.7 | 7194.7 / 9368.1 | **+38% / +69%** |
| 3D 首像素 | 206.6 / 238.1 | 47.2 / 50.2 | **−77%**（注：基线未随 P2-5 收紧，门禁名存实亡，round-5 m6 已记档）|
| loginClickToInteractive | 463.1 基线 | 571.3 / 589.2 | 超 20% 门（负载污染项之一）|

`vietnam-40hq-volume` 的 +38% **一部分是负载污染**（同一报告里 login 与 20GP-volume 也异常高，与 0802 部署前的 mixed-load RED 模式一致），**一部分是真实的**——P3-3 逐 SKU gate + P3-4 groundOnly 两阶段块路径让 volume 模式做了更多候选评估。CHANGELOG 最后一条也只把它记为「blocked under load」，未归因。**该回退没有独立的归因分析，是本轮唯一挂起的性能问题**。

**结构隐患**（本轮定点核对确认）：`placementScore` 的 sameLabel/sameHeight/snap 循环（`packing.ts:423/455/472`）与 `canPlace` 的 `placed.every(!overlaps)`（`:350`）、`respectsStackCapacityWithUpwardRiders` 的 `directRiders = placed.filter`（`:252`）都是**对全量 placed 的线性扫**；单次放置尝试是 O(placed)，877 箱时约 38 万次比较×候选点数。这就是 40HQ-volume 在箱数大时被放大的机制。修复方向 —— 给 `placed` 挂均匀网格空间索引（见 `plans/2026-08-07-packing-spatial-index.md`）。

## 三、0802：已解决（860→877，比用户记忆最好的 873 还高）

| 时点 | 同一份越南 40HQ 输入装载数 |
|---|---|
| 用户称 7/22 | 873 / 877（历史实验，无当前可复跑证据）|
| 0802 报案 | 860 / 877 |
| **当前生产** | **877 / 877，unplaced 0** |

- 修复后约束未放水：28/28 groundOnly 在 `z=0`、全部 877 保留 `maxStackLayers:99`、error/geometry/stack violations 均为 0（`issues/0802/analysis.md` 2026-08-04 实施复核 + `CHANGELOG` r61 条目）。
- 生产验收：2026-08-06 两次连续 remote E2E **128/128**，其中 Vietnam 877/877 与同 SKU quick-place 朝向用例每次固定通过（`CHANGELOG` P1-3c）。中间两次部署回滚（含一次真实删库事故）已恢复并记档。
- 残留（不阻断 issue 关闭，但需知道）：输入 provenance 未闭环（99/groundOnly 来自 Excel 还是模板默认，快照未存）；「P1 计划里的人工现场确认（越南 40HQ 实际装满、手动方向一致）」如果用户尚未正式确认，建议补一次。
- direction：第二问「体积模式变慢 38%」不影响「能装满」这一结论，属于优化而非修复。

## 四、给下一轮的挂起事项（均非新发现，防止重复发现）

1. **vietnam-40hq-volume +38%**：先归因（负载污染 vs 候选路径增多各占多少），再决定是否动空间索引；见 `plans/2026-08-07-packing-spatial-index.md`。
2. **刀 5**：`activeLayerId` / `activeLabelId` / `activeResultTab` 三状态归属；`activeResultTab` 驱动的 `cogViewState`/`compareRows` 派生随之下沉 ResultsPanel。见 `plans/2026-08-07-knife5-visual-selection-ownership.md`。
3. **backlog（本轮明确不做，已记档）**：P3-12b `CustomContainerDialog` 两处英文环境弹中文；P3-12c 四张表无每用户上限 + `package.json` 依赖卫生；P3-13b `interactions.ts` / `overlays.ts` 有状态部分单测补齐；round-5 m6 3D 首像素基线需空载收紧。
4. **out-of-scope 运维债**（沿用 P1-3c 披露，不得写成已整改）：systemd 以 root 运行、DB owner/mode legacy、OpenSSH PQ warning。

## 本轮未取证

- 未跑 `lint` / `build` / `test:e2e` / `benchmark`（只复跑了三组单测；E2E 与 benchmark 引用的是 08-05/08-06 已有记录）。
- 未在浏览器里确认刀 5 之后 props 数的实际下降空间——计划文件里按接口逐项列出，不承诺 ≤25 一定达成。
- 未探测生产（0802 生产状态引用 `CHANGELOG` 的 08-06 验收记录）。
