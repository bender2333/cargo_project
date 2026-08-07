# 2026-08-07 计划：packed 空间索引（性能优化，不改装箱规则）

- 前置：第六轮回溯审查 `issues/2026-08-07-refactor-review-round-6-recap.md`（性能节、结构隐患节）。
- 现象：`vietnam-40hq-volume` median 从基线 `5194.192 ms` 涨到 `7194.698 ms`（+38%），p95 从 `5526.746` 涨到 `9368.1`（+69%）。其中一部份是满负载下跑 benchmark 的污染（同一报告 login 与 20GP-volume 也异常高），**一部份是真实的**——P3-3 逐 SKU gate + P3-4 groundOnly 两阶段块路径让 volume 模式做了更多候选评估。本计划先**归因**，再**优化**。

## 根因（按 HEAD `a45f9cb` 核对，热路径全是对 placed 的线性扫）

装箱主循环（`src/lib/packing.ts:904 calculatePacking`）在 877 箱场景下，每次放置尝试都做一次「placed 全量 O(n)」：

| 调用点 | 做什么 | 复杂度 |
|---|---|---|
| `packing.ts:350` `canPlace` → `placed.every(!overlaps)` | 碰撞检测 | O(placed) |
| `packing.ts:352` `supportDetails(point, box, placed)` | 支撑率/支撑集合 | O(placed) |
| `packing.ts:252` `respectsStackCapacityWithUpwardRiders` → `placed.filter(riders)` | 上方骑手探测 | O(placed) |
| `packing.ts:268`（同上函数内）`for existing of placed` 建 dependents | 支撑边反转 | O(placed + Σedges) |
| `packing.ts:423 / :455 / :472` `placementScore` 三个 `for (const candidate of placed)` | snap / sameLabel / sameHeight 打分 | 3 × O(placed) |

且**块提交对每箱重复付费**：`commitBlock`（`:1101-1116`）展开成 `blockUnitPlacements`（`:1056-1098`）逐 unit 调 `placeEntry`（`:1025`），每 unit 里 `buildPlacedBox`（`:985-1023`）又重新算一次 `supportDetails(point, box, placed)`。对一次 `nx×ny×nz` 块 commit，support 计算付了 count 次全量 O(placed)。

**结果**：每次放置尝试 ≈ O(n)（n=已放箱数），877 箱时一个候选 score 约扫 877 次，×候选点数 ×3 个打分循环——这就是箱数翻倍时耗时变 4 倍的平方级机制，也是 volume 模式箱密度高时被放大的原因。

## 意图与边界

**意图**：给 `placed` 挂一个**均匀网格（uniform grid）**空间索引，把上述 5 处全量扫描换成「候选 AABB 扩张一个 epsilon 后的近邻子集」。选择均匀网格而非 R-tree/BVH 的理由：

- 柜内尺寸固定（`container.length/width/height` 已知）、箱尺分布同量级；
- 维护成本最低（一次 insert、无删除——放置是单调的）；
- `CLAUDE.md` 规则 2（选能满足当前需求的最简单实现）、规则 5（没有明确理由不自造高深结构）。

**边界**：
- **不改任何装箱规则**——只换「从 placed 里拿出相关子集」的方式；目标是**逐位装出完全一致的五个 golden hash**（`test-data/baselines/frontend-architecture.json` 的五项 `contractHashes` 不做 `benchmark:update`）。
- 网格只在 `calculatePacking` 函数作用域内构造，**不外传到 PlacedBox / PackingResult / contract** 层——`blockingInvalid`、`orientationKey`、`labelRotationDeg` 等字段不变。
- 不优化 EMS（`emsSpace.ts`）与 `generateBlockCandidates`（`blocks.ts`）；本计划只针对 placed 查询这一侧。
- `placementScore` 里 snapBonus 的三个容器边界判定（`:417-422`）、`topPassengerFloorPenalty`、`tiltPenalty`、`_orientationCommitmentPenalty`、`labelFacingPenalty` 等与 placed 无关的分支**原样保留**。
- 块 commit 的 `supportDetails` 不只换索引——对同一块内逐 unit 的 `buildPlacedBox`，由于块内 unit 紧密排列、支撑关系可一次算出复用，允许把「整块共享的支撑子集先拿出、再逐 unit 求交」作为本计划内的等价改写（语义必须严格等价：同一 unit 的 supportedBy 集合逐箱不变）。

**精度纪律**：网格的 AABB 查询必须保留 `EPSILON` 扩张，任何一条「先得候选子集、再按原逻辑判」的两阶段实现都要在原判据前再扫一次精确 AABB 重叠，不许用网格格号做近似判定。

## 模块划分（最小新增面）

| 新增/改动 | 内容 |
|---|---|
| **新增** `src/lib/spatialGrid.ts` | `class SpatialGrid<T>`：`constructor(bounds, cellSize)`、`insert(id, aabb, payload)`、`query(aabb): T[]`。cellSize 取「当前批输入箱尺中位数的 max(l,w,h)」，下限 100mm（防退化）。本体约 60–80 行，**单测覆盖**：空查询、边界重叠、EPSILON 扩张、单格多箱、跨格箱、插入后查询命中数。|
| **改动** `src/lib/packing.ts` | 只有 5 处热路径换成「`grid.query(candidateAABB)` → 现存逻辑」；`placementScore` 的 `placed` 参数收缩为「近邻子集」；`placed.every(!overlaps)` 换 `grid.query(pointAABB+box).every(!overlaps)`；`respectsStackCapacityWithUpwardRiders` 的 `placed.filter` 收缩为「候选上方 AABB 列」的子集；`commitBlock` 在同一 commit 内共享一次网格插入流程（不是每次 unit 重查层层）。|
| **不动** | `emsSpace.ts`、`blocks.ts`、`stackCapacity.ts`、`layers.ts`、`finalizePackingResult.ts`、contract 与 golden 文件、UI。|

## 验证标准（可断言，红绿双向）

1. **同一性硬约束（最重要）**：`npx vitest run src/lib/packingInvariants.test.ts src/lib/packing.31pallet.test.ts src/lib/packing.blockEngine.test.ts src/lib/packing.stackfill.test.ts src/lib/packing.test.ts` 全绿；`npm run test:contracts:update` 五个 golden hash **不变**（这一步由 P2-4 的门禁自动拒绝数量回退；若 hash 变了，本任务视为失败，停下记入 `decision.md`，不做 `benchmark:update`）。
2. **行为不变断言**：0802 fixture（`test-data/json/0802/input.json`）的 877/877、groundOnly 28/28 z=0、`unplaced` 为空逐项相等；0629 的 quantity 188/283 / volume 156/283 与 label-C 84/84 z=0 逐项相等。
3. **查询正确性断言**：新增一条参数化测试——对 5 个基准 fixture（russia、20GP qty/vol、40HQ qty/vol），同一 `calculatePacking` 运行中，**每次** `grid.query(candidateAABB)` 返回的 placed 集合必须**等于**「placed 全量里 AABB 与候选 AABB（含 EPSILON）相交的子集」。这锁定索引自身正确，不依赖装箱结果间接证明。
4. **性能验证**：
   - 复跑 `node scripts/p3-0802-block-route-baseline.mjs` 与 benchmark 算法段；在同机同负载状态下记录「优化前 / 优化后」的 `vietnam-40hq-volume` median/p95 与 `vietnam-40hq-quantity` median/p95。
   - **验收**：`vietnam-40hq-volume` median 回落到基线 `5194.192` 的 **1.0×~1.2×**（即 ≤ ~6200 ms），其它四 case 不回退超出 20% 门禁。
   - 若优化后 `vietnam-40hq-volume` 仍 >6500 ms，把剩余热点 profile 记入 `decision.md`（下一步候选：EMS 合并、块 commit 的 support 共享、placementScore 的 sameLabel/sameHeight 的合成索引）；**不在本计划内扩大范围**。
5. **环境纪律**：本地跑性能对比必须先 GUI/其它工作空闲时跑 2 次，取较低的一组作为对比样本；满负载的 benchmark 报告不得用于验收（沿用 round-5 对 load 污染的教训）。

## 风险与回归门槛

- **风险 1（行为漂移）**：网格格号边界若错一个 EPSILON，`overlaps` 会漏检 → 装出重叠的箱。护栏是「每次查询仍回原精确 AABB 判」+ golden hash 不变。
- **风险 2（supportedBy 等价性）**：块 commit 共享支撑子集若改写不慎，可能把同一 unit 的 `supportedBy` 换序或漏箱 → `packingInvariants` 的独立几何重算会抓到（`supportedBy` 由纯几何重建，不信 diagnostics）。
- **风险 3（可调试性）**：`SpatialGrid` 若泄漏到 contract 或日志，会污染后续调试快照；要求 debug snapshot（`debugSnapshot.ts`）输出**不含网格内部结构**。
- **回退**：整个改动是 `packing.ts` + 一个新文件，`git revert` 单 commit 即可回退，不留 contract/字段残留。

## 执行顺序 / 提交粒度 / 必跑命令

1. **P-A 归因（read-only，先写 `decision.md`）**：用 Node profiler 或简单计时打点记录 0802 fixture 的 ×5 热点耗时占比；**不成文不动代码**。
2. **P-B 空间网格**：`feat(lib): add uniform spatial grid for placed-box queries`（只新增 `spatialGrid.ts` + 单测，**不改 packing.ts**——证明网格自身的查询正确性）。
3. **P-C 接入热路径**：`perf(packing): index placed lookups by spatial grid`（改 5 处；一次提交）。跑测试 + 五 golden hash 相同性校验 + 0802/0629 行为断言。
4. **P-D 块 commit 优化**（可选子任务，独立提交；仅在 P-C 后 profile 仍显示 `buildPlacedBox` 内部 `supportDetails` 为大头时做）：`perf(packing): share support query across block commit units`。
5. 全套门禁：`npm run lint && npm test && npm run build && npm run test:e2e`（E2E 只做冒烟：128/128 或至少 `manual-3d` / 0802 fixture 的两条关键用例）；`npm run benchmark` 在空载下跑两次取较严格的一次作为报告。

## 完成标准

- 五个 golden hash 不变、0802 / 0629 行为逐项相等。
- `vietnam-40hq-volume` median ≤ 6200 ms 且其他 case 不回退；若没达成，剩余热点已写入 `decision.md`，且本任务没有悄悄改写 benchmark 基线 / 阈值 / case。
- `packing.ts` 中不再有 `for (const candidate of placed)` 或 `placed.filter/every(...)` 在热路径上跑全量 placed 的残留（`placementScore` / `canPlace` / `respectsStackCapacityWithUpwardRiders` / `buildPlacedBox` / `commitBlock` 五处都走网格近邻）。
