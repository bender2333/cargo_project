# 2026-07-28 分层与支撑契约统一

修复 `physicalLayer` / `supportedBy` / `supportType` 被 X 轴推靠语义覆盖的问题，
并让作业顺序满足「支撑物先于被支撑物」。

## 一、归因

### 1.1 缺陷是如何进入的

`cfeea91`（2026-05-20）引入 `assignDepthLayers`，用途正当：`decision.md` 2026-05-30 记录了真实需求——用户指出「算法应从集装箱里边往外装」，而当时最内侧顶部补装箱被排到第 169~171 步，外侧 `x=400` 却已在第 13 步。集装箱只有一端开门，货装进去人就伸不进去，**必须从最里侧一波波往门口推**。

问题不在这个能力，而在**它没有自己的字段**。`assignDepthLayers` 直接写进了三个已被 PRD 9.3 定义为垂直堆叠语义的字段：

```ts
// src/lib/layers.ts:11-40
box.physicalLayer = 1              // PRD 9.3: 接触地面为第 1 层
box.supportedBy = []               // PRD: 底面支撑关系
box.supportType = 'floor'          // PRD: 支撑类型
// else 分支把「X 轴推靠邻居」写成 supportedBy，并标 'fully-supported'
```

**引入时冲突就已被察觉。** `cfeea91` 在 `packing.ts` 里留下的注释是：

```
// 1. Generate compliance diagnostics under original Z-gravity physical support relations
// 2. Perform inward physical layer mapping and pusher updates (depth layers)
```

作者知道诊断必须在覆盖**之前**跑，于是把 `buildDiagnostics` 提到了 `assignDepthLayers` 前面。这是用**执行顺序**绕开冲突，而不是消除冲突。

`7107135` 又加了 `verticalLayer` / `verticalSupportedBy` 作兜底。`decision.md:1044` 写明动机：「避免 `assignDepthLayers()` 将 `supportedBy` 改写为装柜深度推入关系后影响容量校验」。至此选择固化为「留一份副本」而非「不要覆盖」，两套字段并存的结构性冲突就此定型。

### 1.2 缺陷是如何存活两个月的

三层防护同时失效：

**测试主动绕过覆盖。** `src/lib/packing.test.ts:128-134` 构造影子图：

```ts
function verticalSupportGraph(placed: PlacedBox[]) {
  return new Map(placed.map((box) => [box.id, {
    ...box,
    physicalLayer: box.verticalLayer ?? box.physicalLayer,
    supportedBy: box.verticalSupportedBy ?? [],
  }]))
}
```

测试从兜底字段还原真实语义再做断言。这是明知覆盖存在而主动规避，所以它**永远不会因覆盖失败**。现有 `physicalLayer` 断言只检查 `>= 1` 或具体分层计数，没有一条检查「落地箱是否在第 1 层」。

**golden 冻结了错误状态。** `e73f4ed` 把两套冲突字段一起序列化进 `packing-results.json`，只断言快照相等。`npm test` 全绿因此**不构成**分层正确的证据——它只证明行为没变。

**视图层一致地消费了错误值。** 2D、3D、分层、明细、导出全都读被覆盖后的 `physicalLayer`，所以它们**互相一致**，看不出异常。一致 ≠ 正确。

### 1.3 缺陷的实际规模

用 `scripts/packing-benchmark-cases.mjs` 加载与 golden 相同的五组夹具，直接跑 `calculatePacking`：

| Case | 箱数 | 落地箱不在第1层 | 两套支撑不一致 | 反向支撑边 |
|---|---:|---:|---:|---:|
| russia-volume | 31 | 29 | 29 | 0 |
| vietnam-20gp-quantity | 463 | 89 | 457 | 173 |
| vietnam-20gp-volume | 462 | 89 | 456 | 162 |
| vietnam-40hq-quantity | 839 | 201 | 832 | 333 |
| vietnam-40hq-volume | 823 | 181 | 816 | 461 |
| **合计** | **2618** | **589** | **2590** | **1129** |

「落地箱不在第 1 层」是最硬的证据：不需要论证哪套字段权威，`z=0` 却 `physicalLayer≠1` 直接违反 PRD 9.3。且这些箱被标为 `supportType='fully-supported'`，声称被完全支撑，而其下方为空。

### 1.4 一个改变解法的发现

原以为深度序与支撑序不冲突（一横一纵）。实测否定了这个假设：

```
垂直支撑边总数        : 3467
  支撑物在同一 x      : 1509
  支撑物在更外侧 (x>) : 1080   ← 与深度优先真冲突
```

1080 条边的支撑物比被支撑箱更靠外，**严格按 x 排序必然违反这些支撑关系**。这解释了 1129 条反向边的由来：`assignWorkStepsByDepth`（`packing.ts:585`）只按 `x → y → z` 排序，完全没有支撑依赖约束。

因此深度**不能作为全局排序键**，只能作为拓扑排序内的次序权重。

### 1.5 根因归纳

一个字段承载两套互斥语义。三处症状（分层错误、支撑关系错误、作业顺序错误）同源。

而它能长期存活，是因为每次遇到冲突都选择了**增加绕过层**（调执行顺序、加兜底字段、测试读兜底字段），而没有一次回到「这两个概念需要各自的字段」。

## 二、目标与非目标

### 目标

1. `physicalLayer` / `supportedBy` / `supportType` 恢复为纯垂直支撑语义，任何环节不得覆盖
2. 推靠深度独立为 `depthLayer`，保留装柜从内向外的作业能力
3. `workStep` 满足硬约束：每条支撑边上 `support.workStep < box.workStep`
4. 业务不变量进入测试，不再依赖 golden 快照相等

### 非目标

- 不改变几何摆放算法（极点贪心、朝向选择、评分）
- 不改变装入数量、利用率、标签统计
- 不改 `PackingResult` 之外的模块边界
- 不顺手修本轮 review 的其他 P1（手动合规、历史快照、导入事务等）

## 三、方案

### 3.1 字段语义重新划分

| 字段 | 新语义 | 生产者 |
|---|---|---|
| `physicalLayer` | 垂直支撑深度，落地箱=1 | `packing.ts` 支撑链计算 |
| `supportedBy` | 底面支撑箱 ID | 同上 |
| `supportType` | `floor` / `fully-supported` / `partially-supported` | 同上 |
| `depthLayer` | 推靠波次，贴后墙=1 | `assignDepthLayers` |
| `verticalLayer` / `verticalSupportedBy` | **删除**（恢复本义后成为冗余副本） | — |

删除兜底字段是这次修复的关键收尾：留着它们，下一个人还会以为 `physicalLayer` 不可信而继续读副本。

### 3.2 `assignDepthLayers` 改为只写 `depthLayer`

`src/lib/layers.ts` 中三处赋值改为只写 `depthLayer`，不再触碰 `physicalLayer` / `supportedBy` / `supportType`。函数重命名为 `assignDepthLayers` → 保留名称（语义已由字段名表达）。

`buildPackingLayers`（`layers.ts:95-103`）继续按 `physicalLayer` 聚合——恢复本义后它自然表达垂直层，符合 PRD 9.3。

### 3.3 `assignWorkStepsByDepth` 改为拓扑排序

现状（`packing.ts:585`）：按 `x → y → z → id` 排序。
改为 Kahn 算法：

- 节点：所有 `placed` 箱
- 边：`supportedBy` 中每个支撑物 → 被支撑箱（支撑物必须先装）
- 就绪集合取次序：`depthLayer → x → y → z → id`（深度优先，但让位于支撑约束）

这样 1080 条「支撑物更靠外」的边不再被违反，同时在不违反支撑的前提下尽量保持从内向外。

若图中存在环（理论上不应有，垂直支撑不可能循环），按 `depthLayer → x → y → z` 回退并在诊断中报告。

### 3.4 消费方调整

`stackCapacity.ts` 读 `physicalLayer`/`supportedBy`，恢复本义后**语义正确性提升**，且不再依赖「在覆盖前执行」这一隐含时序。`packing.ts:1244-1258` 的执行顺序注释可以移除。

`loadingTaskGroups.ts:54` 用 `physicalLayer` 做装柜步骤分段——这里**应改用 `depthLayer`**，因为装柜步骤表达的是作业波次，不是垂直层。

`manualSteps.ts` 对手动盒子跑 `assignDepthLayers`（`decision.md:921`），同样需要跟随改动。

其余消费方（2D/3D/分层/明细/导出/`boxVisualState`/`labelDeconfliction`）继续读 `physicalLayer`，语义自动变正确，无需改动。

## 四、执行步骤

### Step 1：先立不变量测试（RED 基线）

新建 `src/lib/packingInvariants.test.ts`，对五组 golden 夹具断言：

| 不变量 | 当前失败数 |
|---|---:|
| `z===0` 的箱必须 `physicalLayer===1` | 589 |
| `supportedBy` 必须等于垂直支撑集合 | 2590 |
| 每条支撑边 `support.workStep < box.workStep` | 1129 |

补充不变量（防修复过头）：
- 非落地箱 `physicalLayer === max(支撑物 physicalLayer) + 1`
- `supportType==='floor'` ⟺ `supportedBy.length===0`
- `depthLayer` 贴后墙（`x≈0`）为 1，且推靠箱 `depthLayer > 被推靠箱`
- 装入数量/利用率与现有 golden 一致（证明几何未变）

**这一步提交时测试是 RED**，作为修复前的事实基线。

### Step 2：字段拆分（`depthLayer` 独立）

1. `types.ts` 加 `depthLayer: number`
2. `layers.ts` 的 `assignDepthLayers` 只写 `depthLayer`
3. `packing.ts` 移除执行顺序注释与依赖
4. `loadingTaskGroups.ts` / `manualSteps.ts` 改用 `depthLayer` 做分段

验收：Step 1 中「落地箱第 1 层」589→0、「两套支撑一致」2590→0。反向边此时仍为 1129。

### Step 3：作业顺序拓扑排序

重写 `assignWorkStepsByDepth` 为拓扑排序。

验收：反向边 1129→0，且深度优先性质保持（同一 `depthLayer` 内不出现大幅逆序）。

### Step 4：删除冗余兜底字段

移除 `verticalLayer` / `verticalSupportedBy`，同步清理 `packing.ts:921-925`、`quickPlace.ts:88,92`、`packingContract.ts`、`manualPlacement.ts`。

**同时移除 `packing.test.ts:128-134` 的 `verticalSupportGraph` 影子图**，改为直接读 `physicalLayer`/`supportedBy`——这是让测试重新具备发现能力的关键一步。

### Step 5：重新生成 golden

最后一步。`npm run test:contracts:update` 重新生成 `packing-results.json`。

**顺序不可颠倒**：先改算法再刷 golden，新 golden 只是把新行为再冻结一次，仍不证明正确。必须先有 Step 1 的不变量测试。

生成后核对：装入数量、利用率、标签统计与旧 golden 一致（几何未变）；`physicalLayer`/`supportedBy`/`workStep` 按预期改变。

## 五、验收标准

| 门槛 | 要求 |
|---|---|
| 落地箱在第 1 层 | 589 → 0 |
| 两套支撑关系一致 | 2590 → 0（且兜底字段已删除） |
| 反向支撑边 | 1129 → 0 |
| 装入数量 / 利用率 | 与修复前 golden 逐位一致 |
| `npm run lint` | 通过 |
| `npm test` | 全绿，含新增不变量测试 |
| `npm run test:e2e` | 119/119 零跳过 |
| `npm run benchmark` | 五个 contract hash 更新且算法 timing 不退步 20% |
| 影子图 | `packing.test.ts` 不再从兜底字段还原语义 |

## 六、风险

| 风险 | 缓解 |
|---|---|
| 分层视图层数变化，E2E 断言具体层号 | Step 2 后立即跑分层相关 E2E，按真实业务语义判断断言是否本就写错 |
| 拓扑排序改变 `workStep`，回放/装柜步骤 E2E 受影响 | Step 3 后单独跑回放与装柜步骤用例 |
| golden hash 全部变化，无法与历史对比 | 保留旧 golden 的装入数量/利用率作对照，证明几何未变 |
| `depthLayer` 新字段影响 `PackingResult` 序列化体积 | 只增一个整数字段，历史方案不存 `PackingResult`，无迁移问题 |

## 七、E2E 断言的处理原则

Step 2/3 可能让部分 E2E 失败。处理原则（避免重演上一轮的错误）：

- **先判断断言本身是否正确**：若它断言的是被覆盖后的错误层号，则它编码了错误业务语义，应改
- **若断言的是正确业务行为**：则是修复引入了回退，应改代码
- 任何测试改动必须在提交说明中写清属于哪一类，不得为了变绿而改断言
