# 2026-08-07 第五阶段：P4 收口 — props 聚合 + 空间索引全接线

- 前置：`issues/2026-08-07-refactor-review-round-6-recap.md`（评分/后果）；`decision.md` 2026-08-07「P4 工作确认（架构师复核 Codex 交付）」。
- 现状：P4-1 状态归属已搬完（功能对、接口数字未达标）；P4-2 grid 已落地并接了 2/5 热路径（等价证成、但空载实测反慢 4–13%）。
- 总意图：把这两件从「半成品」收为「真正达标的活」——不是继续搬，而是**修到数字上**。

## 拆分

本阶段两个任务彼此**没有代码依赖**，但都有「写完必须跑 release note + 部署」的常规尾活，所以合并为一个计划文件两条任务线。Codex 可并行做，也可 A 先 B 后；**部署合并为一次**（见文末「收尾例行」）。

---

## 任务 P5-A：props 聚合收口（关闭 round-5 M-7）

### 根因（本轮复核实测）

Knife 5 把 `activeLayerId/activeLabelId/activeResultTab` 搬进了 ResultsPanel（这是对的），但 Workbench 不再持有 setter **并不意味着**接口变小——

- `VisualizationWorkspaceProps` 实测 **67 props**（`src/components/VisualizationWorkspace.tsx:100-166`）。
- 其中稳定成组的有四簇：`manualDraft/manualPool/manualIssues/manualNotice/manualSelectedId/...`（手动域）、`playbackActive/playbackSequence/playbackCursor/...`（回放域）、`renderingContainer/gridSnap/edgeSnap/placementSettings/...`（渲染域）、`activeLayerId/activeLabelId/cogViewState/cogOverlay/...`（视觉域）。
- 目前 30+ 个只在 Workbench 创建一次再原样透传，接口面因此虚胖；Workbench 自身 `src/Workbench.tsx` 也停在 **1862 行**（约 50 个 prop 名字必须保留在 JSX 的字面量里）。

### 意图与边界

- **只做聚合，不再搬状态**。归属已经对了，这轮是把「散 prop」收成「域对象 prop」。
- 不允许为「少传一个 prop」而在接收组件里加 Context / prop drilling 以外的读取路径（包括全局仓 / 三方 state manager）。
- 不改任何运行时行为——这次提交应是纯类型化重构，E2E 数量与断言不变。

### 模块划分

| 改动 | 内容 |
|---|---|
| 新增 `src/components/workspaceProps.ts`（或同等名） | 导出 `ManualWorkspaceProps`、`PlaybackWorkspaceProps`、`SceneRenderWorkspaceProps`、`VisualSelectionWorkspaceProps` 四个域类型；字段全部来自现有 `VisualizationWorkspaceProps`，不新增字段。 |
| 改 `src/components/VisualizationWorkspace.tsx` | 接口从 67 个散 prop 改为 **4 个域对象 prop + 净余 callback**，例如 `{ manual, playback, render, selection, handlers }`；**同时检查同名 prop 在内部的去向**，透传层的 setter（`setHoverInfo`、`setSelectedBoxId`）合并到对应域对象里。 |
| 改 `src/Workbench.tsx` | JSX 改为聚合传参；删除对应散 prop 的中间变量；预期由 1862 行降到 **≤1500**，`VisualizationWorkspaceProps` 顶层键数降到 **≤30**（验收以此为准，`grep -c ':'` 的口径中以顶层第一级为准）。 |
| 改 `src/components/ResultsPanel.tsx` | 同一轮聚合，同样目标（顶层键 ≤30）。 |
| 注意 | `src/Workbench.sessionBoundary.test.ts` 仍会红——允许更新它（沿用 P3-11 既定纪律），**但不得删任何一条「setCargoItems 不得回流」的行为断言**。 |

### 验证标准（可断言）

1. **接口数字**：`VisualizationWorkspaceProps` 顶层字段数 ≤ 30（跑 `node -e` 或用 `scripts/` 一个一次性 grep 校验脚本，把输出贴进 CHANGELOG）。
2. **行数**：`src/Workbench.tsx` ≤ 1500 行；若到不了，**把剩余的 prop 名清单列出**，写入 `decision.md` 说明哪一簇没聚（允许分批，但必须让「没做完的部分」变得显式）。
3. **等值性**：`npm run lint` 0 错、`npm test` 全绿、`npm run build` 0 错；`npm run test:e2e` **128/128** 零失败零跳过。
4. **E2E 关键用例**（手动行为路径）`e2e/manual-3d.spec.ts`、`e2e/manual-2d.spec.ts`（或同等命名）全绿；不因聚合而出现「点层→标签褪色但场景不刷新」之类时序 bug。
5. **回归护栏**：`npm run benchmark` 的浏览器段（首像素/resize/交互）在空载下不回退。

### 提交

- `refactor(workspace): aggregate visualization props into domain objects`
- `refactor(workspace): aggregate result panel props into domain objects`（如被拆两刀）

---

## 任务 P5-B：空间索引全接线（关闭 P4-2 的「等价是、提速未」）

### 依据

`decision.md`「P4 工作确认」已实测：**接 2/5 之后 40HQ-volume 空载 median 反慢 4–13%**（baseline 5105/5642 vs 当前 5879/6192）。根因是等价性接线没有同时消掉 `directRiders` 与 `buildPlacedBox` 的全量 `placed.filter`，而 `grid.query` 自身的 cellKeys 枚举/Set/EPSILON 扩张在小箱批改下是净负担。

### 根因（本轮复核 file:line，Codex 按此接线）

| 位置 | 当前逻辑 | 要的修改 |
|---|---|---|
| `src/lib/packing.ts:253-263` `directRiders` | 对 `placed` 全量 `filter` 找头顶骑手 | `placedNearby({minX:point.x-ε, minY:point.y-ε, minZ:candidateTop-ε, maxX:point.x+box.length+ε, maxY:point.y+box.width+ε, maxZ:container.height})` 取近邻再 filter；语义严格等价（在网格近邻内做同样的 AABB 相交判）。 |
| `src/lib/packing.ts:269-274` dependents 反转 | `for existing of placed` 建 `dependents` Map | 只对上一步 `directRiders` 的 `supportedBy` 链上的 id 用 `placedById` 取对象，**替代全量遍历**；若需遍历则限制在 `placedNearby(竖直列)`。 |
| `src/lib/packing.ts:1009` `buildPlacedBox` | `supportDetails(point, box, supportPlaced)` 用全量 placed | 把 `supportPlaced` 换成 `placedNearby({min/max: point/box ± ε})`；支撑率/supportedBy 语义不变（`supportDetails` `packing.ts:183` 的 `point.z<=EPSILON` 地板分支提前返回，不受影响）。 |
| `src/lib/packing.ts:1101-1116` `commitBlock` 逐 unit `placeEntry` | 每 unit 单独 `placeEntry` → `buildPlacedBox` | 允许在同一 commit 内先对整块包围盒做一次 `placedNearby`，作为所有 unit 的共享子集；每 unit 在「全 placed 被新加入 unit 累积更新」的语义下，用 `placed.concat(本次 commit 已放的 units)` 做等价集合（参考实现注释里必须点破：块内 units 彼此相贴，块外 placed 集合对块内每 unit 是一样的）。 |
| （已完成项）`canPlace`/`placementScore` | 已用 `placedNearby` | 保持。 |

### 意图与边界

- **五个 golden hash 不变** 是硬约束；任何一处接线行为差异都会被 `npm run test:contracts:update` 拒绝。
- **不改 `SpatialGrid` 本身**（P5-B 不动 `9e471d7` 的代码与测试）；只动 `packing.ts` 的接线。
- **接线必须 5/5 全做完**再验收，避免本轮的「接 2 处反变慢」的形态复发。
- 不改 EMS/blocks/queries；不引入新的容器结构（R-tree/BVH 等）；`cellSize` 仍用「当前批 median 箱尺、下限 100mm」。
- **允许一个例外**：`commitBlock` 的 unit 之间互相不重叠、且同块 unit 的 supportedBy 相对彼此是确定的；为消 O(count²) 的 support 重复，允许借助「同一块内 unit 的 supportedBy 先算到块底」的算术等价推导——但只在**等价性可由 golden hash + packingInvariants 独立几何重算同时绿**的前提下，才允许走这条捷径；否则老老实实做 unit × nearby。

### 验收标准（可断言）

1. **等价性**：`npx vitest run src/lib/packingInvariants.test.ts src/lib/packing.31pallet.test.ts src/lib/packing.blockEngine.test.ts src/lib/packing.stackfill.test.ts src/lib/packing.test.ts` 全绿；`npm run test:contracts:update` **5 个 golden hash 逐一不变（不准 `--allow-regression`、不准 baseline 更新）**；0802 fixture 877/877、groundOnly 28/28 z=0、unplaced 0 逐项相等；0629 quantity 188/283 / volume 156/283、label-C 84/84 z=0 逐项相等。
2. **查询正确性独立断言**：新增测试（追加到 `src/lib/spatialGrid.test.ts` 或新文件）——对 5 个基准 fixture，同一 `calculatePacking` 运行里**每次** `grid.query(candidateAABB)` 返回的集合必须等于「placed 全量按相同 AABB 相交判（含 EPSILON）筛出的子集」。这锁定网格自身对，不靠结果间接证。
3. **接线完备性**：`grep -n "placed.every\|placed.filter\|for (const candidate of placed)\|for (const existing of placed)" src/lib/packing.ts` 在热路径上**应为零命中**——允许保留 `placedById` 构造、`supportDetails` 的 floor 分支、以及文件尾部非热路径（如 finalize 相关的 unplaced 整理）。把命中清单附在 CHANGELOG。
4. **性能验收（双方各跑一次、空载、取较好的一次）**：
   - `node --expose-gc scripts/frontendBenchmark.mjs --algorithm-case vietnam-40hq-volume`：median **≤ 1.2 × 5194.192 = 6233.03ms**，且与 9e471d7 worktree 基线的同机对比必须**不慢于基线**（即不允许比 baseline 差）。
   - 其余四个 case（russia-volume、20GP qty/vol、40HQ qty）在空载下不回退超出 20% 硬门。
   - 同一轮记录对 `node scripts/p3-0802-block-route-baseline.mjs` 的 elapsedMs 前后对比作为旁证。
5. **失败处理**：若达成 「5/5 接线 + golden 不变」后 median 仍 >6233ms 或比基线慢，**不得动 baseline/阈值/case/iterations**；把 profile 报告（`node --prof` 或 `0x`，放入 `test-results/`）与剩余 hot path 写入 `decision.md`，任务留 `in-progress`，下一轮再起 P6。
6. **回退纪律**：本任务必须是**单 commit 或两到三个小 commit**，每个 commit 自身 golden hash 不变；出现问题 `git revert` 即可回整。

### 提交

- `perf(packing): wire spatial grid into upwardRiders and buildPlacedBox`（P-C 完成首刀）
- `perf(packing): share placed-subset query across block commit units`（P-D，可选；若不选则在 `decision.md` 说明不做理由）

---

## 收尾例行（按新 CLAUDE.md「提醒」节，**每轮计划都要做**）

- **release notes**：在 `src/lib/releaseNotes.ts`（或现有发布说明聚合处）追加 `r65` —— 内容覆盖「界面一致性/组件结构收口（P5-A）」与「大柜体装箱速度修复（P5-B）」；**如果 P5-B 未达成性能验收则不在 r65 写 40HQ-volume 提速，只写 P5-A**。
- **部署**：两个任务都 GREEN、E2E 128/128、五 hash 不变后，按 CLAUDE.md 生产部署流程 `npm run deploy`；随后 remote E2E 连跑两次都应 128/128。任一失败走保护 rollback（`npm run rollback -- --backup <deploy 打印的新 backup>`），并记录在案（沿用 08-04/08-06 的记账纪律）。
- **status.json**：合并任务验收后把 `P4-1-knife5` → `superseded by P5-A`、`P4-2-spatial-index` → `superseded by P5-B`，并把本两条新任务 `P5-A`/`P5-B` 标对应状态；提交一次 `docs(status): close P4 via P5 rollout`。**round-status check 必须通过**：`node scripts/check-round-status.mjs`。

## 执行顺序建议

1. P5-A（低风险、纯重构、收益是 Workbench/ResultsPanel 接口读得懂）。
2. P5-B（高风险、做不对会反变慢；**严格空载**，先做 P-C 单 commit、跑 `test:contracts:update` 与等价性测试，再做 P-D）。
3. 都 GREEN 后统一 release notes + 部署 + status.json 更新。

## 必跑命令（阶段完成前）

- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `npm run test:contracts:update`（P5-B 的等价性硬门）
- `node --expose-gc scripts/frontendBenchmark.mjs --algorithm-case vietnam-40hq-volume`（idle×2，对拍 worktree 9e471d7）
- `node scripts/check-round-status.mjs`

## 完成标准

- `VisualizationWorkspaceProps` / `ResultsPanelProps` 顶层字段数 ≤30；`Workbench.tsx` ≤ 1500 行（或剩余 prop 列出）。
- `packing.ts` 热路径上零 `placed.every/filter/for…of placed` 的直接命中。
- 五个 golden hash 不变；0802/0629 行为逐项相等。
- 空载 `vietnam-40hq-volume` median ≤ 6233ms 且不比 9e471d7 慢。
- `check-round-status.mjs` 通过；release notes 与部署已按例行执行且成功。
