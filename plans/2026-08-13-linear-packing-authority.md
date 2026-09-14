# 线性装箱生产权威 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把自动装箱的生产权威从“休眠 SpatialGrid + 线性扫描”收成唯一线性路径，同步修正验收记录，并让原始 `npm test` 稳定通过。

**Architecture:** 合同更新脚本先拆成可导入核心函数，测试不再三次启动 Vite 子进程。随后从 `calculatePacking` 删除 SpatialGrid 接线，保留 `spatialGrid.ts` 作为无生产消费者的实验工具。记录层用 supersede 追加 P6，不重写 P5 历史证据。性能以 `4e18f00` 同机成对 20% 门禁为权威。

**Tech Stack:** TypeScript / Vitest / Node `spawnSync` / Vite SSR / Playwright / Express deploy scripts / `plans/status.json`

**Spec:** `docs/superpowers/specs/2026-08-13-linear-packing-authority-design.md`

## Global Constraints

- 不改装箱规则、放置语义、golden、benchmark 阈值、case 或 iterations。
- 不引入 R-tree / BVH / 新容器结构。
- 不把 SpatialGrid 重新接回 `calculatePacking`。
- 不删除 `src/lib/spatialGrid.ts` 或其独立单测。
- 不重写 P5 当时的 RED/GREEN 证据。
- 不把 `≤6233.03ms` 作为本轮完成门槛。
- 不通过单纯提高 `spawnSync` timeout 或把 `test:unit` 改成 `--maxWorkers=1` 来换绿。
- 不继续搬 Workbench 状态或改 props 聚合。
- 每个提交自身五个 golden hash 必须不变；出现问题按提交 `git revert`。
- 测试不得改写仓库 `test-data/baselines/packing-results.json`。
- 提交前检查 `git status --short`，只提交本任务文件。
- 需要暂缓或改变 spec 时写入 `decision.md`，不得默默改口径。

## Phase 0: Allowed APIs

从现有代码复制，不要发明新入口。

| 用途 | 复制自 | 用法 |
|---|---|---|
| 脚本可导入 + CLI 入口 | `scripts/rollback.mjs:649-665` | `export function main(argv)`；`fileURLToPath(import.meta.url) === resolve(process.argv[1])` 才执行 |
| 合同生成 | `scripts/update-packing-contracts.mjs:30-38` | `createServer(packingBenchmarkViteConfig(root))` + `loadPackingBenchmarkCases` |
| 合同比较/拒绝写入 | `scripts/update-packing-contracts.mjs:40-84` | missing generated case 抛错；placedCount/boxes 下降且无 `--allow-regression` 则 `exitCode=1` 且不写文件 |
| Vite 配置 | `scripts/packing-benchmark-cases.mjs:5-13` | `packingBenchmarkViteConfig(root)` |
| 夹具加载 | `scripts/packing-benchmark-cases.mjs:15-64` | `loadPackingBenchmarkCases(root, vite)` |
| 线性热路径保留 | `src/lib/packing.ts:948-949,557,420-541,1182-1194` | `placed`、`placedByIdLive`、朝向缓存、单遍 `placementScore`、block staging |
| 网格实验工具 | `src/lib/spatialGrid.ts` + `src/lib/spatialGrid.test.ts:8-67,109-116` | 只测网格自身；不测 `calculatePacking` |
| 轮次状态 | `scripts/check-round-status.mjs:11-18,88-109` | 合法 status：`open/in-progress/verified/committed/deployed/superseded/blocked`；`superseded` 必须有 `supersededBy` |
| 部署/回滚 | `scripts/deploy.mjs`、`scripts/rollback.mjs` | 失败只用本次 deploy 打印的 backup 做 guarded rollback |

**禁止：**

- 不要新增 `placedNearby` 替代实现。
- 不要给 `SpatialGrid` 加生产开关。
- 不要调用不存在的 `updatePackingContracts()` 全局函数；先按本计划导出名称实现。
- 不要用 `npm run test:unit -- --maxWorkers=1` 充当 `npm test` 完成证据。

---

### Task 1: 合同更新逻辑改为进程内测试

**Files:**
- Modify: `scripts/update-packing-contracts.mjs`
- Modify: `scripts/updatePackingContracts.test.mjs`
- Test: `scripts/updatePackingContracts.test.mjs`

**Interfaces:**
- Consumes: 现有 CLI argv `--output`、`--allow-regression`；现有 golden schema `{ schemaVersion: 1, cases: Record<string, { sha256: string, summary }> }`
- Produces:
  - `parseUpdatePackingContractsArgs(argv: string[]): { outputPath: string, allowRegression: boolean }`
  - `hashPackingSummary(summary: unknown): string`
  - `comparePackingContracts(previous, generated): { comparisons, regressions, missingGeneratedNames }`
  - `applyPackingContractUpdate({ previous, generated, allowRegression, outputPath, writeFile }): { status: 0 \| 1, stdout: string, stderr: string, wrote: boolean }`
  - `generatePackingContracts(root: string): Promise<{ schemaVersion: 1, cases }>`
  - `main(argv?: string[]): Promise<number>`

- [ ] **Step 1: 先写会红的进程内测试**

把 `scripts/updatePackingContracts.test.mjs` 改成直接 import 尚未导出的函数。保留现有四个业务断言，不要先改实现。

最小失败测试骨架（先加在文件顶部，可暂时保留旧 `runUpdater`）：

```js
import {
  parseUpdatePackingContractsArgs,
  comparePackingContracts,
  applyPackingContractUpdate,
} from './update-packing-contracts.mjs'
```

断言必须覆盖：

1. `parseUpdatePackingContractsArgs(['--output', '/tmp/out.json'])` 得到 `{ allowRegression: false, outputPath: 绝对路径 }`
2. previous 多一个 `missing-generated-case` 时，`comparePackingContracts` 的 `missingGeneratedNames` 含该名
3. placedCount +1 或 placements.length +1 时，`applyPackingContractUpdate` 返回 `status === 1`、`wrote === false`、stderr 含 `Refusing to update packing contracts`
4. 同样回退数据加 `allowRegression: true` 时，`status === 0`、`wrote === true`、stderr/stdout 含 `record a decision`
5. 写回内容必须等于传入的 `generated` JSON，不得碰仓库 golden

旧的三次 `spawnSync` 先留着，本步只证明新导出不存在。

- [ ] **Step 2: 跑测试确认 RED**

Run:

```bash
npx vitest run scripts/updatePackingContracts.test.mjs --pool=threads --maxWorkers=1
```

Expected: FAIL，原因是 `update-packing-contracts.mjs` 没有这些 named export，或 import 时顶层 `createServer()` 被执行。

- [ ] **Step 3: 抽出可导入核心，CLI 延后到 main**

复制 `scripts/rollback.mjs:661-665` 的入口模式。把 `scripts/update-packing-contracts.mjs` 改成：

```js
export function parseUpdatePackingContractsArgs(argv, root = defaultRoot) {
  let outputPath = join(root, 'test-data/baselines/packing-results.json')
  let allowRegression = false
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--allow-regression') allowRegression = true
    else if (argument === '--output' && argv[index + 1]) outputPath = resolve(argv[++index])
    else throw new Error(`Unknown or incomplete argument: ${argument}`)
  }
  return { outputPath, allowRegression }
}

export function hashPackingSummary(summary) {
  return createHash('sha256').update(JSON.stringify(summary)).digest('hex')
}

export function comparePackingContracts(previous, generated) {
  const generatedNames = new Set(Object.keys(generated.cases))
  const missingGeneratedNames = Object.keys(previous.cases).filter((name) => !generatedNames.has(name))
  const comparisons = Object.entries(generated.cases).map(([name, candidate]) => {
    const existing = previous.cases[name]
    if (!existing) throw new Error(`Missing existing packing contract case: ${name}`)
    return {
      name,
      oldPlaced: existing.summary.totals.placedCount,
      oldTotal: existing.summary.totals.totalCargoCount,
      newPlaced: candidate.summary.totals.placedCount,
      newTotal: candidate.summary.totals.totalCargoCount,
      oldBoxes: existing.summary.placements.length,
      newBoxes: candidate.summary.placements.length,
      hashChanged: existing.sha256 !== candidate.sha256,
    }
  })
  const regressions = comparisons.flatMap((comparison) => [
    ...(comparison.newPlaced < comparison.oldPlaced
      ? [`${comparison.name}: placedCount ${comparison.oldPlaced} -> ${comparison.newPlaced}`]
      : []),
    ...(comparison.newBoxes < comparison.oldBoxes
      ? [`${comparison.name}: boxes ${comparison.oldBoxes} -> ${comparison.newBoxes}`]
      : []),
  ])
  return { comparisons, regressions, missingGeneratedNames }
}

export function applyPackingContractUpdate({
  previous,
  generated,
  allowRegression,
  outputPath,
  writeFile = writeFileSync,
}) {
  const { comparisons, regressions, missingGeneratedNames } = comparePackingContracts(previous, generated)
  if (missingGeneratedNames.length > 0) {
    throw new Error(`Missing generated packing contract case: ${missingGeneratedNames.join(', ')}`)
  }
  const lines = ['case | old placed/total | new placed/total | delta | hash changed']
  for (const comparison of comparisons) {
    const delta = comparison.newPlaced - comparison.oldPlaced
    lines.push(`${comparison.name} | ${comparison.oldPlaced}/${comparison.oldTotal} | ${comparison.newPlaced}/${comparison.newTotal} | ${delta >= 0 ? '+' : ''}${delta} | ${comparison.hashChanged ? 'yes' : 'no'}`)
  }
  const stdout = `${lines.join('\n')}\n`
  if (regressions.length > 0 && !allowRegression) {
    return {
      status: 1,
      stdout,
      stderr: `Refusing to update packing contracts:\n${regressions.join('\n')}\nRe-run with --allow-regression only after approval.\n`,
      wrote: false,
    }
  }
  let stderr = ''
  if (regressions.length > 0) {
    stderr = `WARNING: Allowing packing regressions:\n${regressions.join('\n')}\nYou must record a decision explaining this regression.\n`
  }
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFile(outputPath, `${JSON.stringify(generated, null, 2)}\n`)
  return { status: 0, stdout: `${stdout}Updated ${outputPath}\n`, stderr, wrote: true }
}
```

`generatePackingContracts` 才调用 Vite。`main()` 才读文件、生成、比较、写文件。文件顶层不得再执行 `createServer()`。

入口：

```js
const isMainModule =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMainModule) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
```

- [ ] **Step 4: 删掉默认路径里的三次 Vite 子进程**

`scripts/updatePackingContracts.test.mjs` 的主测试改为调用 `comparePackingContracts` / `applyPackingContractUpdate`，用内存 previous/generated 和假 `writeFile`。

允许保留**最多一条**真实 CLI 冒烟。如果该冒烟仍 `createServer()`，必须从默认 `test:unit` 排除，改由 `npm run test:contracts:update` 覆盖 CLI。默认 `npm test` 必须留下 missing-case / placedCount / boxes / allow-regression 四条业务断言。

禁止：只把 `timeout: 30_000` 改成 `120_000`。

- [ ] **Step 5: 验证进程内测试和真实 CLI**

Run:

```bash
npx vitest run scripts/updatePackingContracts.test.mjs
npm run test:contracts:update
git diff -- test-data/baselines/packing-results.json
```

Expected:

- 聚焦测试 GREEN，且耗时应远低于 30s（目标数秒级，不得再接近 40s）
- 五个 case delta `+0`、hash `no`
- golden diff 为空

- [ ] **Step 6: 连续两次原始 npm test**

Run:

```bash
npm test
npm test
```

Expected: 两次都 exit 0。若第二次仍 ETIMEDOUT，停下来记 `decision.md`，不要改 timeout 或 `--maxWorkers`。

- [ ] **Step 7: Commit**

```bash
git add scripts/update-packing-contracts.mjs scripts/updatePackingContracts.test.mjs
git commit -m "test(contracts): run updater logic in-process"
```

---

### Task 2: 删除生产 SpatialGrid 接线

**Files:**
- Modify: `src/lib/packing.ts`
- Modify: `src/lib/spatialGrid.ts`（只加文件头注释）
- Modify: `src/lib/spatialGrid.test.ts`（只加实验工具说明；保留网格自身测试）
- Test: `src/lib/packing.test.ts`、`src/lib/packingInvariants.test.ts`、`src/lib/spatialGrid.test.ts`

**Interfaces:**
- Consumes: Task 1 完成后的稳定 `npm test`
- Produces: `calculatePacking` 不再接受或构造空间索引；下列签名去掉最后的 `placedNearby`：
  - `respectsStackCapacityWithUpwardRiders(point, box, item, support, placed, placedById, containerHeight?)`
  - `canPlace(point, box, container, placed, placedById, item, reservedTopPassengerHeight?, reserveTopPassengerStackSlot?, minSupportRatio?)`
  - `bestPlacement(item, container, placed, points, reservedTopPassengerHeight?, preferCapacityOneTopPassenger?, reserveTopPassengerStackSlot?, deferCapacityOneFloorFallback?, committedOrientation?, minSupportRatio?, placedByIdInput?)`

- [ ] **Step 1: 先写锁定“生产不再依赖网格”的失败测试**

在 `src/lib/packing.test.ts` 增加：

```ts
import { readFileSync } from 'node:fs'

it('does not import SpatialGrid in the production packing module', () => {
  const source = readFileSync('src/lib/packing.ts', 'utf8')
  expect(source).not.toMatch(/from ['\"]\.\/spatialGrid['\"]/)
  expect(source).not.toContain('SpatialGrid')
  expect(source).not.toContain('placedNearby')
  expect(source).not.toContain('GRID_NEARBY_MIN_PLACED')
})
```

不要改 `spatialGrid.test.ts:70` 的网格自身等价测试；那条测的是工具，不是 `calculatePacking`。

- [ ] **Step 2: 跑测试确认 RED**

Run:

```bash
npx vitest run src/lib/packing.test.ts -t "does not import SpatialGrid"
```

Expected: FAIL，当前 `packing.ts:9` 仍 import `./spatialGrid`。

- [ ] **Step 3: 从 packing.ts 删除网格接线**

删除：

- `import { SpatialGrid, type SpatialAabb } from './spatialGrid'`
- `calculatePacking` 内 `cellSize` / `gridBounds` / `placedGrid` / `GRID_NEARBY_MIN_PLACED` / `ensureGrid` / `placedNearby` / `gridReady`
- `placeEntry` 里 `placedNearby(...)` 和 `if (gridReady) placedGrid.insert(...)`
- `canStageBlock` 里对 `placedNearby` 的调用
- `bestPlacement` 的 `nearbyFor`；候选检查直接用 `placed`
- 三个函数签名上的 `placedNearby` 参数及所有调用实参

`canStageBlock` 改为：

```ts
const supportSet = placed.slice()
const stagedById = new Map<string, StackChainNode>(placedByIdLive)
```

`placeEntry` 非地板支撑改为：

```ts
const nearbySupport = point.z <= EPSILON ? [] : placed
```

`respectsStackCapacityWithUpwardRiders` 的 dependents 遍历改为直接用 `placed`。

必须保留：

- `placedByIdLive`
- `committedOrientations`
- 单遍 `placementScore`
- block staging 的 `supportSet` / `stagedById` 增量
- 地板 `z<=EPSILON` 跳过 support 查询

- [ ] **Step 4: 给实验工具加注释**

`src/lib/spatialGrid.ts` 文件头改为明确：

```ts
/** Experimental uniform grid. Not used by calculatePacking. Kept as a standalone probe. */
```

`src/lib/spatialGrid.test.ts` describe 上方加同样说明。不要删除 `:8-67` 和 `:109-116` 的网格自身测试。

- [ ] **Step 5: 跑装箱回归和合同**

Run:

```bash
npx vitest run src/lib/packingInvariants.test.ts src/lib/packing.31pallet.test.ts src/lib/packing.blockEngine.test.ts src/lib/packing.stackfill.test.ts src/lib/packing.test.ts src/lib/spatialGrid.test.ts --pool=threads --maxWorkers=1
npm run test:contracts:update
git diff -- test-data/baselines/packing-results.json
npx vitest run src/lib/packing.test.ts -t "keeps 0629 ground-only cartons on the floor"
node scripts/p3-0802-block-route-baseline.mjs
```

Expected:

- 聚焦装箱测试全绿
- 五个 hash `no`，golden 无 diff
- 0629 目标用例通过
- 0802 original：`placedCount=877`、`unplacedCount=0`、`groundOnly.allZ0=true`

再确认：

```bash
rg -n "from './spatialGrid'|from \"./spatialGrid\"|SpatialGrid|SpatialAabb|placedNearby|GRID_NEARBY_MIN_PLACED" src/lib/packing.ts
```

Expected: 零命中。

- [ ] **Step 6: Commit**

```bash
git add src/lib/packing.ts src/lib/spatialGrid.ts src/lib/spatialGrid.test.ts src/lib/packing.test.ts
git commit -m "refactor(packing): drop unused SpatialGrid production wiring"
```

---

### Task 3: 记录权威切换到 P6

**Files:**
- Modify: `decision.md`
- Modify: `plans/status.json`
- Modify: `CHANGELOG.md`
- Modify: `src/data/releaseNotes.ts`
- Test: `scripts/check-round-status.mjs`；`src/data/releaseNotes.ts` 无独立单测，用字面检查

**Interfaces:**
- Consumes: Task 2 的线性生产路径
- Produces:
  - `P5-B-spatial-full-wiring.status = "superseded"`
  - `P5-B-spatial-full-wiring.supersededBy = "P6-linear-packing-authority"`
  - 新任务 `P6-linear-packing-authority`，`plan = "plans/2026-08-13-linear-packing-authority.md"`
  - release note `2026-08-13-r66-linear-packing-authority`

- [ ] **Step 1: 先写记录检查 RED**

Run:

```bash
rg -n "完成空间索引热路径接线|finishing spatial-index wiring" src/data/releaseNotes.ts
rg -n "P6-linear-packing-authority" plans/status.json
```

Expected: 第一条有命中，第二条无命中。这就是本任务开始前的 RED。

- [ ] **Step 2: 追加 decision，不改旧条目**

在 `decision.md` 末尾追加：

```md
## 2026-08-13 正式采用线性装箱路径

- 背景：P5 的业务需求是大柜体性能且结果不变；SpatialGrid 只是手段。生产随后用 `GRID_NEARBY_MIN_PLACED = Number.MAX_SAFE_INTEGER` 关闭网格，实际提速来自线性缓存与单遍扫描。验收记录仍把 P5-B 写成空间索引全接线完成。
- 选项：A. 继续把 dormant 接线写成已完成；B. 保留线性/grid 双路径；C. 从 `calculatePacking` 删除网格接线，保留 `spatialGrid.ts` 作实验工具，并用 supersede 把生产权威切到 P6。
- 决策：C。
- 影响：P5-A 保持 deployed；P5-B 的部署/测试事实保留但结论被取代；6233ms 降为历史指标；本轮性能权威改为相对 `4e18f00` 的同机成对 20% 门禁。
- 后续：按 `plans/2026-08-13-linear-packing-authority.md` 实施、对拍、部署。
```

- [ ] **Step 3: 更新 status.json**

- `round` 改为 `2026-08-13-linear-packing-authority`
- `updatedAt` 改为 `2026-08-13`
- `P5-A-props-aggregation` 保持 `deployed`，字段不改
- `P5-B-spatial-full-wiring`：
  - `status`: `superseded`
  - `supersededBy`: `P6-linear-packing-authority`
  - 保留 `commit`、`verification`、`acceptance`
  - `note`: `部署与测试事实保留；“空间索引是生产权威实现”的结论被 P6 取代`
- 追加：

```json
{
  "id": "P6-linear-packing-authority",
  "plan": "plans/2026-08-13-linear-packing-authority.md",
  "status": "open",
  "verification": {
    "commands": [
      "npm test",
      "npm run test:contracts:update",
      "node --expose-gc scripts/frontendBenchmark.mjs --algorithm-case vietnam-40hq-volume"
    ]
  },
  "acceptance": "production packing has no SpatialGrid wiring; 5 golden hashes unchanged; raw npm test x2 green; paired 40HQ-volume median <= 1.2x 4e18f00"
}
```

- [ ] **Step 4: 修正 release notes 并追加 r66**

`src/data/releaseNotes.ts`：

r65 最后一条改为：

```ts
'Large-container packing is faster after linear hot-path cache and scan reductions (same packing results).'
'大柜体装箱通过线性热路径缓存与扫描优化加快（装箱结果不变）。'
```

r64 最后一条改为：

```ts
'SpatialGrid remains in the library as an unused experimental probe, not the production packing path.'
'SpatialGrid 仅作为未接入生产的实验工具保留，不是当前装箱路径。'
```

列表顶部新增：

```ts
{
  version: '2026-08-13-r66-linear-packing-authority',
  date: '2026-08-13',
  title: {
    en: 'Production packing uses the measured linear path',
    zh: '生产装箱统一到已验证的线性路径',
  },
  items: {
    en: [
      'Automatic packing no longer keeps a dormant spatial-index branch. The production path is the existing linear scan with caches.',
      'Packing results are unchanged. SpatialGrid remains available only as a standalone experiment.',
    ],
    zh: [
      '自动装箱不再保留休眠的空间索引分支。生产路径就是现有带缓存的线性扫描。',
      '装箱结果不变。SpatialGrid 只作为独立实验工具保留。',
    ],
  },
}
```

r66 不得写绝对耗时数字。

- [ ] **Step 5: 追加 CHANGELOG**

只追加，不删 P5 旧条目：

```md
## 2026-08-13 P6 linear packing authority

- Spec: `docs/superpowers/specs/2026-08-13-linear-packing-authority-design.md`.
- Production `packing.ts` no longer imports SpatialGrid; `spatialGrid.ts` kept as unused probe.
- P5-B superseded by P6; deploy/test facts retained.
- Contracts updater tests now run in-process; raw `npm test` must pass twice.
```

- [ ] **Step 6: 验证记录**

Run:

```bash
node scripts/check-round-status.mjs
rg -n "完成空间索引热路径接线|finishing spatial-index wiring" src/data/releaseNotes.ts
rg -n "P6-linear-packing-authority" plans/status.json
```

Expected: round-status 通过；release notes 旧措辞为零命中；status 含 P6。

- [ ] **Step 7: Commit**

```bash
git add decision.md plans/status.json CHANGELOG.md src/data/releaseNotes.ts
git commit -m "docs: adopt linear packing as production authority"
```

---

### Task 4: 同机性能对拍、全部门禁、部署

**Files:**
- Modify: `CHANGELOG.md`（追加对拍数字与部署 backup）
- Modify: `decision.md`（若完整 benchmark 因外部负载 RED，记录本轮权威是成对门禁）
- Modify: `plans/status.json`（P6 推进到 `verified` / `committed` / `deployed`）

**Interfaces:**
- Consumes: Task 2 代码、Task 3 记录、基线 commit `4e18f00`
- Produces: 成对 median 记录、本地门禁证据、deploy backup 路径、两次远程 128/128

- [ ] **Step 1: 建立 4e18f00 worktree 并测基线**

在无项目 test/dev/e2e 并发时：

```bash
git worktree add ../cargo_project-p6-baseline 4e18f00
cd ../cargo_project-p6-baseline
node --expose-gc scripts/frontendBenchmark.mjs --algorithm-case vietnam-40hq-volume
node --expose-gc scripts/frontendBenchmark.mjs --algorithm-case vietnam-40hq-volume
```

记录两次 median / P95 / contractHash。`contractHash` 必须是 `09d1533e4b2134f237c50defb7ff295302f25b698b90a0df7dd47b47eeac7174`。

- [ ] **Step 2: 测当前代码**

回到本仓库：

```bash
node --expose-gc scripts/frontendBenchmark.mjs --algorithm-case vietnam-40hq-volume
node --expose-gc scripts/frontendBenchmark.mjs --algorithm-case vietnam-40hq-volume
```

计算：

```text
baselineBest = min(baselineRun1.median, baselineRun2.median)
currentBest  = min(currentRun1.median, currentRun2.median)
pass if currentBest <= 1.2 * baselineBest
```

失败则停，写入 `decision.md`，不改 baseline/阈值，不部署。

- [ ] **Step 3: 本地全部门禁**

```bash
npm run lint
npm test
npm test
npm run build
npm run test:e2e
npm run test:contracts:update
node scripts/check-round-status.mjs
```

Expected:

- lint 0 error
- `npm test` 连续两次 exit 0
- build 0 error
- e2e 128/128
- 五个 hash `no`
- round-status 通过

完整 `npm run benchmark` 也要跑。若旧绝对 timing gate 因外部负载 RED，保留 `test-results/benchmark/frontend-architecture.json`，在 `decision.md` 写明本轮性能权威是 Step 2 的成对门禁，不是 6233ms。

- [ ] **Step 4: 部署**

```bash
npm run deploy -- --dry-run
npm run deploy
```

记录 backup 路径。部署后检查：

- 静态首页可访问
- 未认证 API 401
- live bundle 含 `2026-08-13-r66-linear-packing-authority`

- [ ] **Step 5: 远程 E2E 连续两次**

经既有 SSH tunnel：

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080/ npm run test:e2e
PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080/ npm run test:e2e
```

Expected: 两次都明确 128/128、exit 0、无 skip。任一失败只对本次 deploy 打印的 backup 执行：

```bash
npm run rollback -- --backup <deploy-printed-backup>
```

- [ ] **Step 6: 收口记录并提交**

把成对 median、本地门禁、backup、远程两次 128/128 写入 `CHANGELOG.md`。`plans/status.json` 中 P6 标 `deployed`，填 `commit` 和 `verification.result`。

```bash
git add CHANGELOG.md decision.md plans/status.json
git commit -m "docs(release): record P6 linear authority deploy"
```

最后：

```bash
git worktree remove ../cargo_project-p6-baseline
```

---

## Final Verification

对照 spec 第 3、8、9、10 节：

| Spec 要求 | 对应任务 |
|---|---|
| 生产只有线性路径 | Task 2 |
| SpatialGrid 保留为实验工具 | Task 2 |
| 五个 hash / 0802 / 0629 不变 | Task 2 Step 5、Task 4 Step 3 |
| 原始 `npm test` 连续两次 | Task 1 Step 6、Task 4 Step 3 |
| P5-B supersede + r64/r65 修正 + r66 | Task 3 |
| 同机成对 ≤ 1.2× | Task 4 Step 1-2 |
| 部署 + 远程 128/128 x2 | Task 4 Step 4-5 |
| 不改 golden / 不改 benchmark baseline | 全局约束 + Task 1/2/4 |

计划完成后按仓库纪律提交本文件：

```bash
git add plans/2026-08-13-linear-packing-authority.md
git commit -m "docs: add P6 linear packing authority plan"
```
