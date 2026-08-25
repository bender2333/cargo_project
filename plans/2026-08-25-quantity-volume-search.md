# 数量优先 / 体积优先装箱搜索重构 — 执行计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

拍板后，将本计划另存为仓库内新文件 `plans/2026-08-25-quantity-volume-search.md`（不往设计稿追加）。讨论记录进 `decision.md`。

**Goal:** 把 `quantity` / `volume` 从「当前块局部贪心」改成「终局主目标词典序 + 跨 EMS 候选 + 有预算 beam」，在不改 `calculatePacking` 对外契约的前提下，回答 0824 的 504 是否只是局部损失，以及主目标不回退时紧凑性还能改善多少。

**Architecture:** `calculatePacking` 继续是唯一对外入口。`quantity`/`volume` 的块路径改走内部深模块 `optimizePacking`；可行性、候选、目标比较、可回滚状态和 beam 各自一个内部模块。UI、标签、2D/3D、分层、导出、历史只消费现有 `PackingResult`。`weight`/`input` 不进搜索器。

**Tech Stack:** 现有 Vite + React + TypeScript；算法在 `src/lib` 纯函数中；Vitest 单测 + Playwright E2E；生产部署 `npm run deploy`。

## Global Constraints

- 不改 `PackingResult` schema，不把搜索诊断写入业务结果。
- 不保留向后兼容层；过时的局部贪心选择路径直接删，不留 fallback 开关。
- `weight` / `input` 保持现有语义和实现，作为回归对照。
- 不把 CP-SAT/MIP、GA/RL、完整 2D layer 引擎放进浏览器主路径。
- 主目标下降必须失败，不得用 `placedCount >= 500` 这类宽松下限掩盖回退。
- 测试失败先记 `decision.md`，不削弱断言、不改用例凑绿。
- 每完成一个子任务：独立 `git commit` + 更新 `CHANGELOG.md`。
- 部署前必须更新 in-app release note，并按 README 做独立 SQLite backup + `npm run deploy` + 远程 E2E（SSH 不可用则如实记录，不得把本地 E2E 写成生产已验证）。

---

## 背景：调研与设计已经完成

本轮不重做算法选型。输入是：

- 调研：[plans/2026-08-25-packing-algorithm-research.md](C:/project/cargo_project/plans/2026-08-25-packing-algorithm-research.md)
- 设计：[plans/2026-08-25-quantity-volume-algorithm-design.md](C:/project/cargo_project/plans/2026-08-25-quantity-volume-algorithm-design.md)

结论已经明确：当前不是「紧凑必然少装」，而是构造式启发式把局部空间形状当成终局目标，并且 `selectBlockPlacement` 在第一个可行 EMS 处提前返回。

## 根因（当前代码）

| 问题 | 位置 | 后果 |
|---|---|---|
| 跨 EMS 提前返回 | `src/lib/packing.ts:1184-1226` `selectBlockPlacement`：EMS 按 `(x,z,y)` 排序，第一个有可行块的 EMS 直接 `return best` | 后一个 EMS 即使终局更好也无法胜出 |
| 局部块排序 ≠ 终局目标 | `src/lib/packingLookahead.ts:118-154` `compareBlockPlacement`：quantity 看当前块件数，volume 看当前块体积 | 0824 同件数脚印从 `18×3` 换成 `9×6` 后件数 506→504，测试只要求 `>= 500`（`packing.compactness.test.ts:373-376`） |
| 评分世界 ≠ 提交世界 | `packingLookahead.ts:45-95` 用 `bestBlocksForSpace` 尺寸拟合；真实提交走 `canStageBlock`（`packing.ts:1137-1163`）和 `canPlace`（`packing.ts:370-392`） | lookahead 可能给不可行或支撑失败的剩余空间打高分 |
| 搜索不可回滚 | `placeBlocks`（`packing.ts:1228-1244`）单路径 `commitBlock` | 早期误选永久污染后续 EMS |
| volume 终局目标缺失 | 块路径用当前 block volume；非块 volume fallback（`packing.ts:1321-1381`）用 `placementScore`（位置/支撑/朝向/贴边） | 不等于最终 `usedVolume` 最大 |
| 搜索预算与诊断缺失 | 无 `PackingSearchBudget` / `budgetExceeded` | 超时或候选爆炸时无法证明返回的是完整 best |

冻结对照（当前合同，不得默默改）：

- 越南 20GP：quantity **464** / volume **468**（`packingInvariants.test.ts:341-342`）
- 越南 40HQ：两模式 **864/864**
- 俄罗斯 volume：**31/31**
- 0802 40HQ：**877/877**
- 0824 quantity：当前实测 **504**，历史 **506**；槽 `< 200mm`，`internal_notch = 0`；**件数合同未冻结**

## 本轮交付边界

**本轮执行并部署 Phase 0–3。Phase 4 LNS、Phase 5 离线 oracle 只立接口与后续计划，不进本次生产默认路径。**

原因：设计已写明 LNS 不得阻塞首屏，精确求解器不得进前端 bundle。本轮要回答的两个问题（504 是否局部损失、主目标不回退时紧凑性能否改善）在 beam 落地后就能验证。LNS/oracle 单独成下一轮计划文件。

不在本轮：

- 改 UI / 3D / 2D / 标签 / 分层 / 导出 / 历史
- 改 `weight` / `input` 放置循环
- 重开 SpatialGrid（`GRID_NEARBY_MIN_PLACED = MAX_SAFE_INTEGER` 保持）
- 把 leftover 评分扩到深空区或 volume（那是 08-24 已否决的路径）
- 为凑绿改 eslint / rollback 测试（Windows 上既有 RED 只记录）

## 架构：三层控制复杂度

```text
工作台 / usePackingSession.calculate
  └─ calculatePacking（对外 façade，签名不变）
       ├─ weight / input：现有单箱路径，本轮不动
       ├─ quantity / volume：
       │    optimizePacking(...)          ← 内部深模块
       │      packingCandidates           ← 跨 EMS 候选
       │      packingFeasibility          ← 与提交相同的硬约束
       │      packingSearchState          ← 可回滚快照
       │      packingSearch               ← 有预算 beam
       │      packingObjective            ← 终局词典序
       │      residual fill（现有合法残件填充）
       └─ finalizePlacementGeometry + 标签/分层/诊断
            → PackingResult
```

概念关系：

1. **可行性**决定一个块能不能放（越界、重叠、支撑、堆叠、落地、重量）。
2. **候选**决定这一步有哪些合法 `(EMS, block, orientation, point)`。
3. **搜索**在有限宽度里比较后继状态；上界只用于剪枝，不能当成已装件数。
4. **目标**只比较完整布局的 `PackingQuality`。quantity 先比件数，volume 先比体积。
5. **结果归一化**仍由现有 finalizer 负责，搜索不知道标签、分层、导出。

`optimizePacking` 是内部 seam，不导出给 UI。搜索指标只给测试 / benchmark / `CHANGELOG`。

内部接口（实现按此形状，不要再发明第二套）：

```ts
type PackingOptimizationRequest = {
  container: ContainerSpec
  cargoItems: CargoItem[]
  loadingMode: 'quantity' | 'volume'
  defaultMaxStackLayers?: number
  minSupportRatio: number
  budget: PackingSearchBudget
}

type PackingOptimizationOutcome = {
  result: PackingResult   // 或 finalize 前的 placed + unplaced；由 calculatePacking 走现有 finalizer
  search: {
    strategy: 'greedy' | 'beam'
    statesExpanded: number
    candidatesEvaluated: number
    budgetExceeded: boolean
  }
}

function comparePackingQuality(a: PackingQuality, b: PackingQuality, objective: 'quantity' | 'volume'): number
```

词典序（设计已定稿）：

```text
quantity: placedCount ↓, internalNotchVolume ↑, interCargoMaxMm ↑, deadEmsVolume ↑, externalResidualVolume ↑, 确定性作业顺序
volume:   usedVolume ↓, placedCount ↓, 其后与 quantity 相同
```

`externalResidual` 是合法外部余量，不得与 `internal_notch` 合成一个惩罚。

## 文件划分

新建（`src/lib` 扁平，与现有风格一致）：

| 文件 | 职责 |
|---|---|
| `packingObjective.ts` | `PackingQuality` 与词典序比较；唯一排序权威 |
| `packingFeasibility.ts` | 从 `packing.ts` 抽出 `canPlace` / 块逐箱 staging / 重量；lookahead 与 beam 共用 |
| `packingCandidates.ts` | 对全部 EMS 生成有限 block 前沿，去重、上限，禁止第一 EMS 提前返回 |
| `packingSearchState.ts` | 剩余件数、EMS、placed/support、重量、累计质量的不可变/clone-on-write 快照 |
| `packingSearch.ts` | `optimizePacking` + beam + 安全上界剪枝 + 预算 |

测试新建：

- `packingObjective.test.ts`
- `packingFeasibility.test.ts`
- `packingCandidates.test.ts`
- `packingSearch.test.ts`
- `packing.0824.baseline.test.ts`（Phase 0 冻结 0824 quantity/volume 实测合同）

改动：

- `packing.ts`：`quantity`/`volume` 块路径改为调用 `optimizePacking`；删除 `selectBlockPlacement` 的第一 EMS 提前返回
- `packingLookahead.ts`：尺寸拟合只能标为乐观上界；生产提交与 beam 评分不得再用它冒充可行件数
- `packing.compactness.test.ts`：0824 件数改为批准门槛，不再 `>= 500`
- `packingInvariants.test.ts` / `packing.blockEngine.test.ts`：件数或体积变化必须逐 fixture 报告；不得先改 golden
- `scripts/` 可加只读 baseline 脚本，输出 JSON 到 `test-results/`，不进 `PackingResult`
- `src/data/releaseNotes.ts`、`CHANGELOG.md`、`decision.md`

不改：`blocks.ts` 的有限前沿生成（每种朝向最大块 + 少一行/列/层），`emsSpace.ts` 分割语义，`finalizePackingResult.ts`，UI 组件。

## 产品合同：0824 的 506 / 504

Phase 0 冻结**当前代码**的 0824 quantity 实测（预期 504）和历史 506，作为对照，而不是把 504 写成「最优」。

搜索目标是恢复 **506**，同时保持槽 `< 200mm`、`internal_notch = 0`。

**部署闸门：**

- 若 Phase 2 达到 `placedCount >= 506` 且槽不回退：冻结新件数，允许部署。
- 若仍只有 504：不得把 504 写成新的数量上限；写入 `decision.md`「件数/紧凑性 Pareto」，**停下来等产品确认**后再改 golden 或部署。紧凑性改善不能自动授权件数回退。
- 任何 `placedCount` 低于当前 504，本轮失败。

volume 的 0824 当前没有 named golden。Phase 0 先记录 `placedCount`、`usedVolume`、利用率、槽、耗时。quantity 改动不得默认改变 volume；若改变，必须独立对照且 `usedVolume` 不低于该基线。

---

### Task 0: 合同、基线、目标比较器

**Files:**
- Create: `src/lib/packingObjective.ts`, `src/lib/packingObjective.test.ts`, `src/lib/packing.0824.baseline.test.ts`
- Create: `scripts/packing-mode-baseline.mjs`（只读，打印 quantity/volume 的 placed、usedVolume、每 SKU、槽、耗时、search 空诊断）
- Modify: `decision.md`（记录实测基线；0824 合同标「已决策：搜索以 506 为目标，504 为当前下限，回退需产品确认」）
- Test: 上述测试；现有 compactness / invariants / blockEngine **先跑一遍作为基线快照，不改断言**

**根因：** 0824 件数合同是 `>= 500`（`packing.compactness.test.ts:373-376`），无法检测 506→504。volume 无 0824 基线。目标比较逻辑若散落在 lookahead/packing/LNS 会再次分叉。

**意图：** 先有可断言的终局比较器和可重复基线，再允许改搜索。不改装箱行为。

**不改：** `packing.ts` 选择逻辑。

- [ ] **Step 1:** 写 `comparePackingQuality` 失败测试（先测意图，再写实现）

用例（必须编码业务意图，不能只测返回了某个数）：

1. quantity：`placedCount` 504 vs 506 → 506 胜，即使 504 的 `internalNotchVolume` 为 0、506 有槽。
2. quantity：件数相同，`internalNotchVolume` 更小者胜。
3. quantity：件数和 notch 相同，`interCargoMaxMm` 更小者胜。
4. volume：`usedVolume` 更大者胜，即使件数更少。
5. volume：体积相同，件数更多者胜。
6. 主目标相等时才比较 `deadEmsVolume` / `externalResidualVolume`。
7. 比较器纯函数、确定性、反对称。

- [ ] **Step 2:** 实现最小 `comparePackingQuality`，单测绿。
- [ ] **Step 3:** 跑当前 `calculatePacking` 记录基线（写入 `CHANGELOG.md` 和 `decision.md`，不要手改 golden）：

| 夹具 | 模式 | 记录字段 |
|---|---|---|
| `test-data/json/0824/input.json` | quantity、volume | placed、usedVolume、utilization、每 SKU placed、internal_notch、interCargoMaxMm、external_residual、耗时 |
| 越南 20GP/40HQ | quantity、volume | 与 invariants 对照 464/468/864/864 |
| 0802 | 现有 loadingMode | 877 |
| `packing.compactness.test.ts` seed 1/7/13 | quantity | 无封闭空腔 |

- [ ] **Step 4:** `packing.0824.baseline.test.ts` 冻结**当前** quantity `placedCount`（实测值，预期 504）和槽 `< 200`、notch `0`。注释写明：这是重构前快照，不是最优合同；后续搜索测试另设 506 目标。
- [ ] **Step 5:** Commit：`test(packing): freeze quantity/volume objective and 0824 baselines`

验证：`npx vitest run src/lib/packingObjective.test.ts src/lib/packing.0824.baseline.test.ts src/lib/packing.compactness.test.ts src/lib/packingInvariants.test.ts src/lib/packing.blockEngine.test.ts`

---

### Task 1: 共享可行性 + 跨 EMS 候选（仍 greedy，无 beam）

**Files:**
- Create: `src/lib/packingFeasibility.ts`, `src/lib/packingFeasibility.test.ts`, `src/lib/packingCandidates.ts`, `src/lib/packingCandidates.test.ts`, `src/lib/packingSearchState.ts`, `src/lib/packingSearchState.test.ts`
- Modify: `src/lib/packing.ts`（块路径改为：生成全部可行候选 → 按当前 objective 代理排序 → 提交；删除第一 EMS `return`）
- Modify: `src/lib/packingLookahead.ts`（尺寸拟合标为乐观上界；`scoreRemainingEmsQuality` 不得作为「可装件数」）

**根因：** `selectBlockPlacement` `:1223` 第一 EMS 即返回；lookahead `:45-95` 不走 `canPlace`。

**意图：** 候选必须跨所有可行 EMS 竞争。提交与评分共用 `canPlace` / 块逐箱 staging / 重量。本步仍是单路径 greedy，不引入 beam，以便把「跨 EMS」和「搜索宽度」分开验证。

**不改：** beam、LNS、`weight`/`input` 循环、`PackingResult`。

可行性必须覆盖：越界、重叠、支撑比、`groundOnly`、`stackable`/`maxStackLayers`、向上 rider 容量、重量上限、块内逐箱。上界估算若存在，测试名和注释必须写「乐观上界」，并证明它 **≥** 真实可放，绝不能低估。

候选保留当前有限 block frontier（`bestBlocksForSpace` / `maxBlocksForSpace`），但对 quantity 与 volume 都提供：每朝向最大块、少一行/列/层、同主目标接近时的不同脚印、稳定去重和每 EMS/几何类别上限。

- [ ] **Step 1:** 可行性测试（最小几何，不跑 0824 全柜）

1. `groundOnly` 箱 `z>0` → 不可行。
2. `maxStackLayers=1` 的底箱上再叠 → 不可行。
3. 支撑比 `< 0.5` → 不可行；`= 0.5` → 可行（与现政策一致）。
4. 超重一块 → 不可行。
5. 块内第二箱与已放重叠 → 整块不可行。
6. 尺寸能拟合但支撑失败的 EMS，lookahead/上界不得把它计为「已证明可装件数」。

- [ ] **Step 2:** 跨 EMS 候选测试

1. 两个不相交可行 EMS：后一个 EMS 的块在终局代理（quantity 件数上界 / volume 体积上界）更优时，**必须被选中**。禁止「只测生成了候选」；要测 greedy 提交结果。
2. 第一 EMS 有更大当前块、第二 EMS 终局上界更好：第二 EMS 胜。
3. 候选去重：同一 `(sku, nx, ny, nz, point, orientation)` 只出现一次。
4. 超限时截断稳定、确定性，且跨 EMS 截断，不是只截同一 EMS。

- [ ] **Step 3:** 抽出可行性与候选，改 `selectBlockPlacement` 为全局竞争。状态快照至少能 clone 后互不共享 `placed` / `emsList` 引用（为 Task 2 做准备，本步 greedy 只用一份）。
- [ ] **Step 4:** 跑 Task 0 同一组夹具。任何 20GP/40HQ/0802/0824 主目标变化写入 `CHANGELOG.md` 对照表。主目标下降 → 停，记 `decision.md`，不改 golden。
- [ ] **Step 5:** Commit：`feat(packing): compete block candidates across all EMS`

验证：可行性/候选单测 + compactness + invariants + blockEngine。0824 若升回 506，记录为跨 EMS 单独贡献，不要等到 beam 再测。

---

### Task 2: quantity beam（width 4/8，depth 2）

**Files:**
- Create: `src/lib/packingSearch.ts`, `src/lib/packingSearch.test.ts`
- Modify: `src/lib/packing.ts`（quantity 块路径走 `optimizePacking`；残件填充仍用现有合法 residual fill）
- Modify: `src/lib/packing.compactness.test.ts`（0824 quantity 主目标改为批准门槛，见下）

**根因：** greedy 即使跨 EMS，仍单路径提交（`placeBlocks` `:1228-1244`）。0824 的 2 件损失需要短深度后继比较。

**意图：** quantity 用最终件数上界保留 beam 状态；上界相同再用紧凑性代理。每个候选短深度后，用同一 residual fill 完成终局，再用 `comparePackingQuality(..., 'quantity')` 选完整解。不得用当前块紧凑度替代最终件数。

参数（设计已定，先测再调宽度，不先加配置层）：

- beam width 8，超时或节点超预算降到 4
- depth 2 个 block 决策
- 每状态每 EMS/几何类别限制候选
- 预算耗尽：返回当前最好**完整**解，`budgetExceeded: true`，禁止静默半成品

安全上界：`当前 placedCount + 各 EMS 可容纳件数乐观上界`。上界可以不紧，但不能低估，否则会剪掉最优。

- [ ] **Step 1:** 搜索器测试（小容器，可手算）

1. 两步决策的玩具柜：greedy 装 4，第二候选终局 5 → beam 必须输出 5。
2. 件数相同、notch 更小的分支胜。
3. 件数更少但更紧凑的分支不得胜。
4. 人为 `budget.statesExpanded = 0` 或极小预算：返回完整 greedy/best，`budgetExceeded === true`，`placedCount > 0`（有货可装时）。
5. 乐观上界低于真实可装的实现必须让「上界安全」测试失败。
6. beam 两分支不得共享可变 `placed` / `emsList`（改 A 不影响 B）。

- [ ] **Step 2:** 实现 beam + 接 quantity。volume 本步仍走 Task 1 greedy。
- [ ] **Step 3:** 0824 quantity 验收（主断言，编码「件数优先」）：

```ts
expect(result.placedCount).toBeGreaterThanOrEqual(quantityApprovedFloor) // 默认 506；若未恢复则不要把 504 写进这个常量
expect(gaps.interCargoMaxMm).toBeLessThan(200)
expect(gaps.internalNotchVoxels).toBe(0)
```

若未到 506：保持旧 snapshot 测试绿，新增「搜索未恢复 506」记录到 `decision.md`，**不要改 `quantityApprovedFloor = 504` 后继续部署**。等产品确认。

C13 脚印用例（`packing.compactness.test.ts:380-413`）仍要求 y-span > 1700，且件数 `>= 64`。若 beam 用别的脚印达到更高件数，以件数为主，更新该用例时必须在 `CHANGELOG` 写清新旧布局。

- [ ] **Step 4:** 越南 20GP quantity 不得低于 464；40HQ quantity 保持 864；0802 877。下降则停。
- [ ] **Step 5:** 记录 `statesExpanded`、`candidatesEvaluated`、`budgetExceeded`、P50 耗时。20GP 交互目标参考现有 `< 5s`（blockEngine）和 0824 `< 15s`。超预算先降 width 到 4，不关数量目标。
- [ ] **Step 6:** Commit：`feat(packing): add bounded quantity beam search`

---

### Task 3: volume beam（同一搜索器，只换 objective 和体积上界）

**Files:**
- Modify: `src/lib/packingSearch.ts`（volume 走同一 `optimizePacking`）
- Modify: `src/lib/packing.ts`（volume 块路径接入；非块 volume 的 `placementScore` 循环仅保留给 `shouldUseBlockEngine === false` 的小票）
- Test: `packingSearch.test.ts` 增加 volume 用例；0824 volume 对照 Task 0 基线

**根因：** volume 块路径按当前 block 体积排序；非块路径 `placementScore`（`packing.ts:420+` / `:1321-1381`）不是终局体积。quantity lookahead 未覆盖 volume。

**意图：** 复用搜索器，只替换 comparator 和安全体积上界。quantity 的阈值、`QUANTITY_COUNT_NEAR_WINDOW`、浅层 leftover 条件不得复制到 volume。

- [ ] **Step 1:** volume 测试

1. 当前块体积更大、终局 `usedVolume` 更小的候选不得胜。
2. 终局体积相同，件数更多者胜。
3. 体积下降即使件数上升 → 失败（volume 模式）。
4. 0824 volume：`usedVolume` ≥ Task 0 基线；报告 placed 与槽，但不被 quantity 评分污染（同一输入两种模式结果应可区分，与 `packing.blockEngine.test.ts:329-332` 同类意图）。
5. 越南 20GP volume `placedCount === 468` 或 **usedVolume 不低于** 现合同对应体积；40HQ volume 864。主目标（体积）下降则停。

- [ ] **Step 2:** 接入 volume beam。`shouldUseBlockEngine` 仍为 false 的小票走旧单箱路径，本轮不把它们强行送进 beam。
- [ ] **Step 3:** quantity 回归：Task 2 的 0824/越南/0802 不得被 volume 改动打回。
- [ ] **Step 4:** Commit：`feat(packing): search volume by final usedVolume`

---

### Task 4: 全量验证、release note、部署

**Files:**
- Modify: `src/data/releaseNotes.ts`（顶部新增 r73 条目，中英）
- Modify: `CHANGELOG.md`、`decision.md`
- 不改测试来凑绿

**意图：** 算法改动对用户可见（装得下更多或同样件数更紧），需要 release note。部署按仓库生产流程，不以本地算法测试替代。

Release note 要点（按真实结果改写，禁止承诺未达到的 506）：

- 数量优先按最终装入件数选择方案，不再只看眼前一块是否塞得满。
- 体积优先按最终占用体积选择方案。
- 货物之间的长槽仍会压，但不会为了好看少装（除非产品已确认 Pareto）。
- 门端/侧壁合法余量仍允许。

- [ ] **Step 1:** 全量门禁（按序，失败记 `decision.md`）：

```bash
npx eslint src/lib/packing.ts src/lib/packingObjective.ts src/lib/packingFeasibility.ts src/lib/packingCandidates.ts src/lib/packingSearchState.ts src/lib/packingSearch.ts src/lib/packingLookahead.ts
npm run test:unit
npm run test:packing-performance
npx tsc -b
npm run build
npm run test:e2e
```

`npm run lint` 全量若仍因 `.worktrees` 的 `tsconfigRootDir` RED：记录既有问题，不改 eslint 配置。`test:rollback` 在 Windows 离线 bash fixture 失败同样只记录。

E2E 至少覆盖：自动装箱出结果、0802 越南 40HQ 满装、工作台 3D/2D/分层仍能打开当前 `PackingResult`。本轮无新 UI，不新写大套 E2E；回归现有 `e2e/container-calc.spec.ts`。

- [ ] **Step 2:** 对照表写入 `CHANGELOG.md`（每个 fixture 一行：旧 placed/usedVolume/槽/耗时 → 新值）。主目标下降禁止标完成。
- [ ] **Step 3:** 更新 `src/data/releaseNotes.ts`。Commit：`docs(release): r73 quantity/volume search`
- [ ] **Step 4:** 部署

1. 独立 SQLite `.backup` + `PRAGMA quick_check=ok`（README 流程；SSH 被拦则停止部署或明确记录「静态可发、库未备」）。
2. `npm run deploy -- --dry-run` 再 `npm run deploy`。
3. 健康检查：首页 200，未认证 API 401，记录 live Workbench chunk 名。
4. 有 SSH 隧道则远程 `test:e2e`；没有则写明未跑，不得写「生产已验证」。

- [ ] **Step 5:** 推送通知：改了 quantity/volume 搜索架构、0824/越南数字、是否恢复 506。

---

## Phase 4 / 5（本轮不部署，只留接口）

不要在本轮实现 LNS 或引入 OR-Tools。

在 `decision.md` 写后续入口即可：

- Phase 4 LNS：从 beam 完整解拆除最大槽相邻块，同一候选/可行性重填；只接受 `comparePackingQuality` 改善；固定 seed；默认自动装箱先返回 beam。
- Phase 5 离线 oracle：2–5 个几何类、少量库存、固定候选点的 CP-SAT/MIP；比较 beam 差距；依赖不进前端 bundle。

若 Task 2 已恢复 506 且槽达标，LNS 不是本轮发布条件。

## 测试矩阵（所有任务共用）

| 意图 | 断言 |
|---|---|
| quantity 主目标 | 终局件数优先；同件数才允许紧凑性改变选择 |
| volume 主目标 | 终局体积优先；同体积才允许件数/紧凑性改变选择 |
| 主目标回退 | 测试必须失败，禁止宽松下限 |
| 跨 EMS | 后一个 EMS 终局更好时必须能胜出 |
| 0824 脚印 | C13 `18×3` vs `9×6`：件数优先，同件数才消 400mm 槽 |
| 真实可行性 | groundOnly、maxStackLayers、支撑 0.5、重量、边界、重叠 |
| 预算 | 耗尽返回完整 best，`budgetExceeded` 可见 |
| 越南 20GP | quantity 464、volume 468 或主目标不降 |
| 越南 40HQ / 0802 | 864/864、877 |
| 随机 seed 1/7/13 | 无封闭空腔 |
| weight/input | 现有 `packing.test.ts` / `packing.stackfill.test.ts` 行为不变 |
| 标签/分层 | `PackingResult` 仍能过 `canonicalizePackingResult` 与 invariants 的 depth/support |

## 风险与回归门槛

- **越南回退：** 08-24 曾因扩大 leftover 把 20GP quantity 打到 480、40HQ volume 到 860。本轮每步都用 invariants 挡，不允许「先改 golden 再看」。
- **性能：** beam 复制 EMS/支撑状态。预算必须先有数字再合并。超过现有 20GP `<5s` / 0824 `<15s` / 40HQ `<20s` 先降 width，不关主目标。
- **抽出 canPlace：** `packing.ts` 体量大，weight/input 也调用它。抽出后必须跑 `packing.test.ts` 里 input/weight 顺序用例。
- **0824 两件：** 可能跨 EMS 即恢复，可能需要 beam，可能物理上 506 与无槽不可兼得。第三种只能产品确认，执行者不得自行接受。
- **既有门禁 RED：** 全量 eslint `.worktrees`、Windows rollback fixture。沿用 08-24 决策：不改测试凑绿。

## 提交粒度（每个子任务一次 commit）

1. `test(packing): freeze quantity/volume objective and 0824 baselines`
2. `feat(packing): compete block candidates across all EMS`
3. `feat(packing): add bounded quantity beam search`
4. `feat(packing): search volume by final usedVolume`
5. `docs(release): r73 quantity/volume search`（含 CHANGELOG / decision / releaseNotes）
6. 部署证据另记 `CHANGELOG.md`，不把环境产物提交进 git

## 执行提醒（给 Codex）

- 先测后改。每个任务的失败测试要在实现前红。
- 不要把 `packingLookahead` 权重继续堆成复杂分数。
- 不要为 beam 加用户可调配置面板。
- 更新 in-app release note 并部署，这是常规动作。
- 任何失败写入 `decision.md`，格式：背景 / 选项 / 决策 / 影响 / 后续。
