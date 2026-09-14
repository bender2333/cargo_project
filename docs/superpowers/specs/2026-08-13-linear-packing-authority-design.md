# 2026-08-13 线性装箱生产权威设计

- 状态：已确认，待实施
- 轮次：`P6-linear-packing-authority-and-gate-stability`
- 前置：`plans/2026-08-07-p5-props-aggregation-and-spatial-wiring.md`、`decision.md` 2026-08-07 P5 系列、2026-08-11 复核结论
- 当前 HEAD 基线：`4e18f00`

## 1. 问题

P5 的真实业务需求是：

> 在装箱结果不变的前提下，降低大柜体自动装箱耗时。

空间索引只是当时提出的实现手段。后续实测证明：

- SpatialGrid 的 `query` 固定开销（cellKeys 字符串、Map 查找、Set 去重、结果数组）在 877 箱 40HQ 场景下经常大于线性扫描收益。
- 生产代码随后把激活阈值设为 `GRID_NEARBY_MIN_PLACED = Number.MAX_SAFE_INTEGER`，因此 `placedNearby()` 永远返回完整 `placed`。
- 实际提速来自线性路径优化：`placedByIdLive`、朝向缓存、top-surface 缓存、单遍 `placementScore`、block staging 共享。
- 验收记录仍把 P5-B 写成“空间索引全接线完成”，r65 也向用户宣称完成了空间索引接线。

这造成三处不一致：

1. 代码结构看起来有空间索引，运行时没有。
2. 计划验收要求“热路径零全量扫描”，实现与记录都未真正满足。
3. 标准 `npm test` 仍会因 `updatePackingContracts.test.mjs` 的 30 秒子进程超时失败。

## 2. 已确认决策

| 决策 | 选择 |
|---|---|
| SpatialGrid | 从生产装箱路径移除；保留 `spatialGrid.ts` 与独立测试，作为未采用的实验工具 |
| 性能验收 | 同机成对不回退：变更后较好 median ≤ 1.2 × 变更前较好 median；原 6233ms 只作为历史指标 |
| 记录修正 | 追加 supersede，不重写 P5 历史证据 |
| 标准测试 | 纳入本轮并修根因；连续两次原始 `npm test` 必须通过 |

## 3. 目标

1. 生产装箱路径只有一种实现：已验证的线性热路径。
2. 代码、测试、status、decision、CHANGELOG、release notes 对“当前权威实现”说法一致。
3. 原始 `npm test` 稳定通过，不再依赖单 worker 替代。
4. 删除生产索引接线后，装箱结果不变，且相对 `4e18f00` 不出现超过 20% 的同机性能回退。

## 4. 非目标

- 不改装箱规则、放置语义、golden、benchmark 阈值、case 或 iterations。
- 不引入 R-tree / BVH / 新容器结构。
- 不把 SpatialGrid 重新接回 `calculatePacking`。
- 不删除 `spatialGrid.ts` 或它的独立单测。
- 不重写 P5 当时的 RED/GREEN 证据。
- 不把 `≤6233.03ms` 作为本轮完成门槛。
- 不通过单纯提高 `spawnSync` timeout 或把 `test:unit` 改成 `--maxWorkers=1` 来换绿。
- 不继续搬 Workbench 状态或改 props 聚合。

## 5. 生产代码设计

### 5.1 唯一生产路径

`src/lib/packing.ts` 是自动装箱的唯一生产入口。`calculatePacking()` 继续拥有：

- EMS / block engine / extreme points
- `placed: PlacementBox[]`
- `placedByIdLive: Map<string, StackChainNode>`
- 朝向缓存、top-surface 缓存
- 单遍 `placementScore`
- block staging 共享集合

删除以下生产索引对象和函数：

- `import { SpatialGrid, type SpatialAabb } from './spatialGrid'`
- `placedGrid`
- `ensureGrid`
- `GRID_NEARBY_MIN_PLACED`
- `placedNearby`
- `cellSize` / `gridBounds` 仅服务于网格的计算

以下函数签名去掉 `placedNearby?: (aabb: SpatialAabb) => PlacementBox[]`：

- `respectsStackCapacityWithUpwardRiders`
- `canPlace`
- `bestPlacement`

调用点全部改为直接使用传入的 `placed` 或 `placedByIdLive`。`placeEntry` / `canStageBlock` 不再构造 nearby AABB 再回落到全量数组。

`supportDetails(point, box, placed)`、`canPlace` 中的 `placed.every`、`placementScore` 中的 `for (const candidate of placed)` 可以保留。这些扫描现在明确表示“扫描当前已放集合”，不再假装收到网格近邻子集。

### 5.2 独立实验工具

保留：

- `src/lib/spatialGrid.ts`
- `src/lib/spatialGrid.test.ts`

要求：

- `src/lib/packing.ts` 不得再 import 它们。
- `spatialGrid.test.ts` 只测网格自身：空查询、边界、EPSILON 扩张、跨格、插入/查询正确性。
- 删除任何“同一 `calculatePacking` 运行里每次 `grid.query` 必须等于全量 AABB 子集”的生产接线测试。这类测试锁定的是已被否决的生产接线。
- 文件头注释必须写明：实验工具，当前生产装箱未采用。

### 5.3 结果不变

删除接线不得改变：

- 五个 canonical contract hash
- 0802：877/877、groundOnly 28/28 全部 `z=0`、unplaced 0
- 0629：quantity 188/283、volume 156/283、label-C 84/84 `z=0`

权威命令：`npm run test:contracts:update`。不允许 `--allow-regression`，不允许改 golden。

## 6. 合同测试稳定性设计

### 6.1 根因

`scripts/update-packing-contracts.mjs` 是顶层脚本：解析 argv 后立刻 `createServer()`，再对五个夹具跑完整 `calculatePacking`。

`scripts/updatePackingContracts.test.mjs` 通过 `spawnSync(..., { timeout: 30_000 })` 三次启动该脚本。标准 `npm run test:unit` 与其他 Vitest worker 并发时，子进程会在 30 秒超时。隔离 `--maxWorkers=1` 约 40 秒可通过，因此这是并发争用，不是合同逻辑错误。

### 6.2 目标结构

把脚本拆成可导入模块，模式对齐 `scripts/rollback.mjs`：

- 导出核心函数，例如：
  - `parseUpdatePackingContractsArgs(argv)`
  - `comparePackingContracts(previous, generated)`
  - `applyPackingContractUpdate({ previous, generated, allowRegression, outputPath })`
- CLI 入口只在 `import.meta.url === process.argv[1]` 时运行。
- 测试直接 import 核心函数，构造内存中的 previous/generated，断言拒绝写入、允许回退、warning 文本。
- 最多保留一条真实 CLI 冒烟：调用一次真实脚本，确认 argv 解析和进程退出码。该冒烟不得在每个断言场景重复启动 Vite。

如果真实 CLI 冒烟仍会启动 Vite 并与并发单测争用，则把它移出默认 `test:unit` 包含集，改由 `npm run test:contracts:update` 覆盖 CLI。默认 `npm test` 必须覆盖合同门禁的业务断言，不能把整份测试移出。

### 6.3 禁止项

- 不把 timeout 从 30s 改到 120s 作为唯一修复。
- 不把 `package.json` 的 `test:unit` 改成 `--maxWorkers=1` 来掩盖争用。
- 不削弱 missing-case / placedCount / boxes / allow-regression 断言。
- 测试不得改写仓库 golden 文件。

## 7. 记录权威设计

### 7.1 status.json

保留 P5-A：

- `id: P5-A-props-aggregation`
- `status: deployed`
- 原 commit / verification / acceptance 不变

修改 P5-B：

- `id: P5-B-spatial-full-wiring`
- `status: superseded`
- `supersededBy: P6-linear-packing-authority`
- 原 commit、verification.result、当时性能数字全部保留
- `note` 必须写明：部署与测试事实保留；“空间索引是生产权威实现”的结论被 P6 取代

新增：

- `id: P6-linear-packing-authority`
- `plan: plans/2026-08-13-linear-packing-authority.md`
- `status` 按实施推进：`open` → `verified` → `committed` → `deployed`
- `acceptance` 使用本文件第 8 节，不再要求“热路径零 `placed.filter`”或“必须启用 SpatialGrid”

`scripts/check-round-status.mjs` 必须继续通过。已完成 CHANGELOG 段落若出现未勾选 checkbox，必须有 supersede 指向。

### 7.2 decision.md

只追加，不改写旧条目。新条目标题：

`## 2026-08-13 正式采用线性装箱路径`

必须记录：

- 背景：P5 需求是性能，空间索引是手段
- 选项：继续假装网格已接线 / 保留 dormant 双路径 / 生产删除接线并保留实验工具
- 决策：第三项
- 影响：生产唯一权威变为线性路径；P5-B 被 supersede；6233ms 降为历史指标
- 后续：本轮实施、同机对拍、部署

### 7.3 CHANGELOG.md

只追加本轮执行证据。不删除 P5 的“grid remains hybrid/linear-default”历史条目。

### 7.4 用户可见发布说明

`src/data/releaseNotes.ts`：

- 修正 r65 中英条目，去掉“完成空间索引接线 / 完成空间索引热路径接线”
- 改为“大柜体装箱通过线性热路径缓存与扫描优化加快，结果不变”
- 修正 r64 中 SpatialGrid 条目：标明实验工具，不是生产装箱路径
- 在列表顶部新增 r66，版本号：`2026-08-13-r66-linear-packing-authority`
- r66 只说明实现路径收口和结果不变，不宣称新的绝对耗时数字

修正已发布文案是纠正错误产品说明，不是伪造历史。P5 当时的 CHANGELOG/decision 数字仍保留。

## 8. 验收

### 8.1 正确性

- `npx vitest run src/lib/packingInvariants.test.ts src/lib/packing.31pallet.test.ts src/lib/packing.blockEngine.test.ts src/lib/packing.stackfill.test.ts src/lib/packing.test.ts src/lib/spatialGrid.test.ts --pool=threads --maxWorkers=1` 全绿
- `npm run test:contracts:update` 五个 hash 全部 `no`，golden 无 git diff
- 0802 / 0629 行为逐项相等
- `rg -n "from './spatialGrid'|from \"./spatialGrid\"|SpatialGrid|SpatialAabb|placedNearby|GRID_NEARBY_MIN_PLACED" src/lib/packing.ts` 为零命中

### 8.2 标准测试

- 原始 `npm test` 连续两次 exit 0
- 不接受 `--maxWorkers=1` 作为完成证据
- lint 0 error
- `npm run build` 0 error

### 8.3 性能

在无项目测试/dev/e2e 并发的前提下：

1. 用 `4e18f00` worktree 跑两次  
   `node --expose-gc scripts/frontendBenchmark.mjs --algorithm-case vietnam-40hq-volume`
2. 用变更后代码跑两次同样命令
3. 取双方较好 median，要求  
   `currentBestMedian <= 1.2 * baselineBestMedian`
4. 五个 contract hash 必须与 golden 一致
5. 不改 `test-data/baselines/frontend-architecture.json`

完整 `npm run benchmark` 仍要跑。若外部负载导致旧绝对 timing gate RED，保留报告，并在 `decision.md` 写明：本轮性能权威是同机成对门禁，不是 6233ms。

### 8.4 UI / 发布

- `npm run test:e2e`：128/128，零失败零跳过
- `node scripts/check-round-status.mjs` 通过
- `npm run deploy` 成功后，经既有 SSH tunnel 连续两次远程 E2E 128/128
- 任一远程失败只能对本次 deploy 打印的 backup 执行 guarded rollback

## 9. 提交顺序

1. `test(contracts): run updater logic in-process`
2. `refactor(packing): drop unused SpatialGrid production wiring`
3. `docs: adopt linear packing as production authority`
4. 性能对拍、本地全部门禁、部署和远程 E2E 的证据提交  
   `docs(release): record P6 linear authority deploy`

每个提交自身必须保持五个 golden hash 不变。出现问题可按提交 `git revert`。

## 10. 明确禁止的验收偷换

- 不得把“接口接了 `placedNearby`”写成“空间索引已启用”
- 不得把串行单测写成 `npm test` 通过
- 不得把一次非空载 benchmark RED 写成算法回归，也不得把一次空载 GREEN 在未记录环境时写成永久合同
- 不得更新 packing golden 或 frontend benchmark baseline 来吸收本轮改动
