# 计划：重写空间模型 — EMS 空的最大长方体（根治纯散货列间缝隙）

来源：2026/07/07 用户用 `越南第十一批6.2海运.xlsx` 测试，3D 列间仍有大缝。架构师实测 + 根因定位 + 用户两轮拍板。根因、数据、决策见 `decision.md` 同日条目。
本计划落地 06-30 计划里被推迟的「层次2（重写空间模型）」。

## 已决策（与用户确认，不再讨论）

1. **根治手段 = EMS（Empty Maximal Space）差分空间法**：维护柜内所有「最大空长方体」列表，替换现有极值点（角点）候选生成。放箱后：切分所有与新箱相交的 EMS，剔除被其它 EMS 完全包含的冗余 EMS；候选放置点 = 每个剩余 EMS 的近原点角（(x,y,z) 最小角）。
2. **彻底替换极值点模型**：删除 `extremePoints` 累积逻辑与 `topSurfacePoints` 作为候选来源；两条模式路径都改用 EMS 角点作候选。
3. **fixture 差异先报告**：重写前先冻结基线，重写后逐条 diff 报架构师，**不得为过测试改断言/弱化用例**。

## 必须原样保留（契约，不可动）

- `canPlace`（`packing.ts:246-252`）几何门控：越界、重叠、支撑率 ≥ 0.5、`respectsMaxStackLayers`、`groundOnly` 落地。**新引擎放箱前仍必须过 canPlace。**
- `placementScore`（`:281-405`）评分启发式全套：EMS 只改「候选点来源」，选哪个候选仍由 placementScore 打分决定。
- `PackingResult` 全字段、`physicalLayer`、支撑链 `supportedBy`（`supportDetails` `:158`）——下游共享，不重算。
- `orientations` / `committedOrientations`（同货同朝向承诺）语义不变。

---

## 子任务顺序：1 → 2 → 3 → 4 → 5。每个单独 commit。

## 子任务 1：冻结基线快照（重写前，必做第一步）

- **意图**：为「先报差异」提供可 diff 的基准。重写前把现有算法在所有 packing fixture 上的产出固化。
- **范围**：新增 `src/lib/_baseline/` 或临时脚本，对以下输入跑当前 `calculatePacking`，导出 JSON（每箱 id/x/y/z/orientation + 汇总 placed/util/maxZ/floorCoverage）：
  - `packing.test.ts`、`packing.31pallet.test.ts`、`packing.stackfill.test.ts` 里的全部装箱输入。
  - 越南十一批数据（24 SKU，见 decision.md 尺寸表）× 40HQ × quantity/volume 两模式。
- **验证标准**：基线 JSON 落盘（提交到仓库或写入 `test-data/json/baseline-2026-07-07/`），含每个 fixture 的 placed 数、util、包络填充率。**这是后续差异判定的唯一基准。**
- **边界**：不改任何算法代码。

## 子任务 2：实现 EMS 空间模型核心（纯函数，独立模块 + 完整单测）

- **意图**：把 EMS 作为**可独立测试的纯几何模块**落地，先不接入主循环。
- **范围**：新建 `src/lib/emsSpace.ts`：
  - `type EMS = { x,y,z, length,width,height }`（一个空的最大长方体）。
  - `initEMS(container): EMS[]` → 整柜一个 EMS。
  - `splitEMS(emsList, placedBox): EMS[]` → 对每个与 placedBox 相交的 EMS，切出最多 6 个子 EMS（±x/±y/±z 方向的剩余板块），不相交的原样保留；最后 `pruneContained` 剔除被其它 EMS 完全包含的。
  - `emsCandidatePoints(emsList): PackingPoint[]` → 每个 EMS 的最小角 (x,y,z)，去重。
- **验证标准（可断言单测，编码几何意图）**：
  - 空柜放 1 箱在原点 → 剩余 EMS 恰好覆盖 L 型剩余空间，且两两不被包含。
  - 放两个不相邻箱 → 列间缝隙作为独立 EMS 出现（其角点能被 `emsCandidatePoints` 返回）——**这是根治缝隙的核心断言**：构造「两个高箱夹一个矮空档」，断言矮空档对应 EMS 存在且尺寸正确。
  - `pruneContained`：人为放入一个被包含 EMS，断言被剔除。
  - 覆盖：相交切分、包含剔除、边界贴合（EPSILON）、去重。
- **边界**：纯函数，无 React、不 import packing.ts。

## 子任务 3：接入主循环 — 用 EMS 候选替换极值点（核心改动）

- **根因**：`packing.ts:718,818,821-823` 极值点模型不追踪最大空区。
- **意图**：两条模式路径的候选来源从 `extremePoints`/`topSurfacePoints` 换成 `emsCandidatePoints`。
  - 维护 `let emsList = initEMS(effective)`；`placeEntry` 放箱后 `emsList = splitEMS(emsList, newBox)`。
  - volume 路径（`:830-886`）：`candidatePointSets` 用 `emsCandidatePoints(emsList)`。
  - quantity/weight/input 路径（`:901-968`）：`bestPlacement` 的 points 传 `emsCandidatePoints(emsList)`。
  - 删除 `extremePoints` 累积、`topSurfacePoints` 候选注入、`normalizePoints` 里与极值点耦合的部分（保留容器边界过滤 + 去重 + 排序）。
- **保留**：`canPlace` 仍对每个 EMS 角点 × 每个朝向做门控；`placementScore` 仍打分选最优。`reserveTopPassengerStackSlot`/`minPendingTopPassengerHeights` 这套「顶部乘客预留」是为旧极值点模型缓解缝隙加的——**若 EMS 已能填缝，评估删除**（连带修 decision.md 记的 C=0 bug 隐患），删前先在越南数据 + 0629 数据实测确认不掉件数，记录结论。
- **验证标准**：
  - 越南十一批 40HQ：**装载包络内填充率 > 85%**（基线 77.5%）；util ≥ 76.5% 基线；无重叠/越界（几何断言）。
  - 子任务1 基线逐 fixture diff：**产出差异清单（placed/util/关键坐标变化）交架构师判定**，不擅自改断言。

## 子任务 4：fixture 差异裁决 + 回归收口

- **意图**：把子任务3 的差异清单落地为「改善」或「回归」。
- **流程**：
  - 差异中「util 上升 / 缝隙减少 / 无几何违规」→ 改善，更新对应硬坐标断言到新值，并在断言旁注释「EMS 重写后坐标，2026-07-07」。
  - 差异中「util 下降 / 件数减少 / 出现违规」→ 回归，**记 decision.md**，不改测试，回子任务3 修算法。
  - 架构师确认后才动 `packing.test.ts`/`31pallet`/`stackfill` 断言。
- **验证标准**：`npm run lint && npm test && npm run build` 全绿；无未经确认的断言弱化；差异裁决记录写入 decision.md。

## 子任务 5：E2E + 性能实测收口

- **意图**：确认 UI/3D/2D/导入导出链路在新引擎下正常，性能不劣化。
- **验证标准**：
  - `npm run test:e2e` 全绿（失败先记 decision.md，不弱化）。
  - 性能：越南十一批 864 箱两模式各跑一次，记录耗时；对比基线 ~1.8s，**不显著劣化**（给上界 ≤ 3s，超则记 decision.md 评估空间索引，不作硬门槛）。
  - 3D 目视：列间/列顶缝隙明显减少（附截图或包络填充率数据）。

---

## 必跑验证
- 每子任务：`npm run lint && npm test && npm run build`。
- 子任务 5：额外 `npm run test:e2e`。
- 验收夹具：越南十一批（`test-data/excel/越南第十一批6.2海运.xlsx`）40HQ，包络填充率 > 85%、util ≥ 76.5%、无几何违规。

## 风险与回归门槛
- **最大风险 = fixture 硬坐标大面积破**。已定：先冻结基线（子任务1）→ 逐条 diff → 架构师裁决（子任务4），不得为过测试改用例。
- EMS 切分/剔除若有 bug 会产生重叠或漏空区——子任务2 单测必须覆盖切分、包含剔除、缝隙 EMS 存在性三类断言，且主循环 canPlace 是最后防线（重叠必被拒）。
- 删「顶部乘客预留」逻辑前必须实测两数据集件数不掉，否则保留。
- 性能：EMS 列表可能膨胀，pruneContained 是关键；864 箱需实测。
- `loadingPriority` 残留清理**不在本轮**，避免混入两套 churn。
