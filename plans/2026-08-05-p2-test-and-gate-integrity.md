# 2026-08-05 第二阶段：测试与通过体系可信化

- 前置：`plans/2026-08-04-p1-production-safety-and-0802-redeploy.md` 全部完成并验证。
- 依据：`issues/2026-08-04-refactor-review-full-audit-round-5.md`。该记录的 ID 体系是：`B-1`/`B-2`（Blocker）、`M-1`～`M-12`（Major）、`m1`～`m23`（Minor 表格）、`R-1`～`R-3`（被推翻的初判）。**大小写承载语义，不要混用**。本阶段对应的是 `M-4`（被删的 unplaced 断言）与小写 `m6`/`m7`/`m8`/`m9`/`m10`/`m11`/`m12`。每个任务正文里的 file:line 是自洽的，以正文为准；若某个 ID 查不到，按正文执行并在 `decision.md` 记录 ID 对不上。
- 本阶段**不修任何产品缺陷、不改任何装箱算法**。唯一目标：让「测试通过」这件事重新具备证明力，为第三阶段的算法修复提供可验收的地基。
- 判定原则：本阶段结束时，必须能对每一条业务规则回答「如果它被写坏，哪个测试会红，失败信息是否指向原因」。回答不出来的规则就是缺口。

## 为什么这一阶段必须在修复之前

第五轮审查确认了一次真实的「删断言取绿且未披露」：`d037df0` 删除了 0629 的 groundOnly `no-space` 契约断言，而该 fixture 的行为**没有变化**（quantity 仍 188/283，label C 仍只有 84/172 落地），因此断言不是过时被替换，是删掉后无人会发现。同时 `CHANGELOG.md` 把本轮观测值 188 写成「required 188」，把观测反写成要求。

如果在这种状态下进入第三阶段，第三阶段的每一条「修好了」都无法与「把断言改松了」区分开。

---

## 任务 P2-1：补回被删除的 unplaced 契约，并建立数量守恒不变量

- 根因：`d037df0` 删除 `src/lib/packing.test.ts` 中 0629 用例结尾的 `expect(result.unplaced).toContainEqual({ label: 'C', reasonCode: NO_SPACE })`，替换为 `expect(result.placedCount).toBeGreaterThanOrEqual(quantity ? 188 : 156)`。当前该用例位于 `src/lib/packing.test.ts`「keeps 0629 ground-only cartons on the floor in quantity and volume modes」。
- 辅助断言缺口：`src/lib/packing.test.ts:103-130` 的 `expectValidLargePacking` 校验越界、重叠、体积/重量累加一致与载重上限，**完全不涉及 `unplaced`**；全库没有任何 `placed + unplaced === planned` 的守恒断言。
- 意图与边界：
  - 补回 groundOnly 装不下时必须显式进入 `unplaced` 且 `reasonCode` 正确的契约。不要因为「现在也能过」就跳过——本任务的价值正是让它以后被改坏时会红。
  - 守恒不变量分两级，**不要试图把 per-SKU 守恒塞进现有辅助函数**：`expectValidPacking`（`packing.test.ts:61`）与 `expectValidLargePacking`（`:103`）的签名都是 `(container, result)`，拿不到 per-SKU 的 planned quantity，改签名会波及全部调用点，属于计划外的范围扩张。
    - **整批守恒**放进这两个现有辅助函数：`placedCount + Σunplaced.quantity === totalCargoCount`。这一项只需 `result` 自身，签名不变，所有既有用例自动获得保护。
    - **per-SKU 守恒**单独写一个 `expectQuantityConservation(cargoItems, result)`，只在需要的用例里显式调用（0629 两个模式 + 五个夹具）。
  - 不改 fixture、不改 0629 输入、不放宽任何既有阈值。
  - **死锁出口**：若整批守恒在某条路径不成立，不要改断言也不要改算法。`markUnplaced`（`packing.ts:952` 附近按 cargoId 累加）与 `:1292` 附近的 `retryEntries` 重试路径理论上存在「先标 unplaced 后又放下」的双计可能（架构师未运行验证）。若真的撞上：先把该断言限定在 0629 与五个夹具上启用，把根因作为第三阶段的新任务写入 `decision.md`，本任务照常收尾。这是预期内的产出，不是失败。
- 验证标准（可断言）：
  - 0629 quantity 模式：`unplaced` 必须包含 `label: 'C'` 且 `reasonCode === NO_SPACE`；`placedCount === 188`（改为精确值，不用 `>=`；若实测非 188 则以实测为准并在 `decision.md` 说明为何此前记为 188）。
  - 0629 volume 模式：同上，`placedCount === 156` 或实测精确值。
  - 守恒不变量在五个既有夹具（俄罗斯 31 托、越南 20GP/40HQ × quantity/volume）上全部成立。
  - 反向证明：临时把 `markUnplaced` 的某个调用点注释掉，守恒断言必须变红；恢复后转绿。此反证过程写入 `decision.md`，代码改动不得提交。
- 提交：`test(packing): restore unplaced contract and add quantity conservation`。

## 任务 P2-2：把「循环自证」的几何断言改为独立重算

- 根因：`src/lib/packingInvariants.test.ts:318-325` 的用例标题是「keeps every placed box inside the effective container and free of overlap」，但实现只读 `result.diagnostics` 里 `boundary-check` / `overlap-check` 的 severity 并断言 `not.toBe('error')`——而这两条诊断正是 `calculatePacking` 自己在 `src/lib/packing.ts:676` 与 `:692` 算出来的。检测器本身回退（EPSILON 写错、遍历漏箱）时该用例仍全绿。
- 对照：同一文件 `:91-104` 的 `verticalSupportersOf` 用纯几何独立重算 `supportedBy`，是全仓最有价值的测试资产；`src/lib/packing.test.ts:50-75` 的 `boxesOverlap` 与 `src/lib/packing.blockEngine.test.ts:104` 的 `expectNoOverlapOrBounds` 也都是独立重算。缺的只有 `packingInvariants` 这一处。
- 意图与边界：把该用例改为独立几何重算越界与重叠，不再读 `diagnostics`。保留一个**单独的**用例断言「几何违规时 diagnostics 必须报 error」——那是诊断层的契约，与几何层是两件事，不要混在同一个用例里。
- 验证标准：
  - 反向证明（**方法必须按此执行**）：`src/lib/packing.ts:71` 的 `EPSILON = 0.001` 是模块级单一常量，全文用了 **61 处**（`fitsInsideContainer`、`overlaps`、`supportOverlap`、`hasBoundaryViolation`、`placementScore` 的 snapBonus 等）。直接改它会让整个装箱行为崩塌、全套 packing 测试一起红，无法区分「新断言抓到了」与「什么都坏了」。正确做法：在 `hasBoundaryViolation` 内部引入一个**局部**容差常量，只把这个局部值临时抬高（例如 100），然后只跑 `npx vitest run src/lib/packingInvariants.test.ts` 观察红绿。抬高后的效果正是想要的反证形态——越界箱被放进去、检测器同时沉默。
  - 改造后的用例必须变红，改造前的旧写法（读 diagnostics）不会红。两种结果都记入 `decision.md`，所有临时改动必须还原且不提交。
  - 诊断契约用例：构造一个已知越界的 `PackingResult` fixture，断言 `boundary-check` 的 severity 为 `error`。
- 提交：`test(packing): assert geometry independently instead of reading diagnostics`。

## 任务 P2-3：为 50% 支撑率与 support-check 诊断建立具名测试

- 根因一：`src/lib/packing.ts:345` 的 `if (support.supportRatio < 0.5) return false` 是自动路径唯一的重力稳定性约束，测试中 `supportRatio` 在 `src/lib/packing.test.ts` 零命中。
- 根因二：`src/lib/packing.ts:700-707` 的 `support-check` warning 分支（「some boxes are only partially supported」）在自动路径从未被断言；唯一相关断言是 `src/lib/packing.test.ts:496` 的 `severity: 'info'`，而那个夹具没有部分支撑箱体。审查核算 golden 显示四个越南夹具分别含 21/31/34/74 个 `partially-supported` 箱体，该 warning 分支在真实规模上必然触发。
- 重要事实（不要误判严重度）：对抗复核核算了 golden，四个越南夹具的部分支撑箱支撑率最小值分别是 0.5205 / 0.5273 / 0.5345 / 0.5261，全部紧贴 0.5，说明这条线是真正 binding 的；改动它会让 `src/lib/packingInvariants.test.ts:313` 的精确 `placedCount` 断言变红。所以这**不是**一个可静默改错的开放洞，缺的是「失败时能指向原因」。
- 意图与边界：
  - 为 0.5 阈值写三个具名用例：支撑率约 0.6 应被放置且 `supportType === 'partially-supported'`；约 0.4 应被拒绝并以 `NO_SPACE` 进入 `unplaced`；恰好 0.5 的边界行为按当前实现（`< 0.5` 拒绝，即 0.5 放行）固定下来，并在用例注释里写明这是边界约定。
  - 为 `support-check` warning 写一个用例：存在部分支撑箱体时该诊断的 severity 必须是 `warning` 而非 `info`。
  - 只加测试，不改阈值、不引入配置通道。支撑率双源问题（自动硬编码 0.5 vs 手动可配 `supportPolicy`）留给第三阶段处理。
- **可构造性警告（必须先解决，否则会写出新的假绿）**：自动路径的落点由 `extremePoints` 生成、`canPlace` 是私有函数，测试**无法直接指定箱子放在哪**。如果只断言 `placedCount`，用例可能因完全无关的原因（无候选点、被 `respectsMaxStackLayers` 拒）而通过或失败——那就是又造了一个假绿。两条出路，任选其一并在 `decision.md` 记录选择：
  - **优先**：export `supportDetails` 与阈值判定，对其做直接单测（输入几何 → 期望 `supportRatio` 与放行/拒绝）。这样测的是规则本身，与落点无关。
  - 次选：仍走 `calculatePacking`，但用例**必须**同时断言实际达成的 `supportType` 与 `z`，并在注释里写明该几何是如何逼出目标支撑率的。构造不出来就走上一条路，不要硬凑。
- 验证标准：把 `0.5` 临时改成 `0.1` 与 `0.95`，新增的三个具名用例必须给出指向支撑率的失败信息（而不是只有 `placedCount` 数字不符）。两次改动均不提交。
- 提交：`test(packing): name the support-ratio threshold and warning contract`。

## 任务 P2-4：给 golden 重生成加门禁

- 根因：`scripts/update-packing-contracts.mjs` 全文 33 行，`:19-28` 直接 `calculatePacking → canonicalize → hash → writeFileSync`，无读取旧基线、无 diff、无回退拒绝、无 `--allow` 开关。对照 `scripts/frontendBenchmark.mjs:271-278` 为 timing 基线专门设了 `newBaselineRefusal` 拒绝路径，golden 无对等保护。`package.json` 已把它做成 `test:contracts:update`。
- 需要修正的一处认知：脚本 `:23` 有 `console.log` 打印每个 case 的新 `placedCount`，所以不是「不告诉你」，是「不比对、不拒绝」。
- 真实暴露面（对抗复核收窄后）：`supportedBy`、floor 语义、层号算术、装载顺序、`depthLayer` 都在 `packingInvariants.test.ts` 有独立不变量；只由 golden 兜底的是精确 `x/y/z`、`orientationKey`、`labelRotationDeg` 三类。
- 意图与边界：
  - 脚本读取现有 golden，逐 case 比较 `placedCount` 与箱数；出现下降时**拒绝写入并非零退出**，除非显式传 `--allow-regression` 并在输出里要求记录 decision。
  - 无论通过或拒绝，都打印新旧对照表（case、旧 placed/total、新 placed/total、差值、hash 是否变化）。
  - 不改变 golden 文件格式、不改 canonical 逻辑、不动 `packing-results.json` 现有内容。
- 验证标准：
  - 新增 `scripts/updatePackingContracts.test.mjs`：在临时目录构造一份 placed 数更高的假基线，运行脚本必须非零退出且不写入；传 `--allow-regression` 后写入成功。
  - 现状回归：在不改算法的前提下运行 `npm run test:contracts:update`，必须零退出且 `git diff test-data/baselines/packing-results.json` 为空（证明当前 golden 与当前算法一致，脚本没有引入漂移）。
- 提交：`test(contracts): refuse silent golden regressions`。

## 任务 P2-5：收紧已失效的 3D 首像素基线，清除误导性死数据

- 根因一（门禁事实失效）：`test-data/baselines/frontend-architecture.json` 的 `canvasFirstNonEmptyPixelsMs` 基线仍是修复前的 median/P95 = 206.625 / 238.125 ms（该文件 `generatedAt` 为 2026-07-28，早于 `decision.md` 记录的 WebGL context 保留修复），而当前实测约 47.9 / 57.9 ms。按 `scripts/frontendBenchmark.mjs:253` 的 `expected × 1.2` 判据，需要 median 超过 247.95 ms 才失败，即在当前水平上回退 5.2 倍。计划 `plans/2026-07-21-frontend-architecture-refactor.md:63` 的「回退超过 20% 失败」在这个指标上已不提供保护。
- 根因二（误导性死数据）：同文件的 5 个 `contractHashes` 与权威 golden 全部不一致，且 `scripts/frontendBenchmark.mjs:236` 用 `requireContractHashes: false` 使其既不比较也不校验格式。**注意**：对抗复核确认没有任何代码路径读取它，且下次 `benchmark:update` 会自动覆盖成正确值——所以它是误导性死数据，不是失效门禁，不要按「假门禁」的严重度处理。
- 意图与边界：
  - 在**受控空载**机器上重新采集并收紧首像素基线。不改采样方式、不改阈值系数、不改 case——审查已确认 47 vs 267 的差异来自两处真实代码修复，不是采样噪声，所以不需要「换更稳定的采样」。
  - **不要删除 `contractHashes` 字段**（架构师复核修正了先前的判断，理由见下）。
  - 不动 timing 之外的 bundle 基线；不借本任务放宽任何现有门槛。
- **为什么不删除该字段（先前计划要求删除，是错的）**：`scripts/frontendBenchmark.mjs:461` 无条件把 `contractHashes` 写进 `actual`，`:485` 又把整个 `actual` 写成新 baseline；而 `validateBenchmarkReport` 的 `requireContractHashes` 默认为 `true`（`:129`、`:147-148`），**强制** `actual` 必须带 5 个合法 SHA-256。所以：本任务为收紧基线必然要跑一次 `benchmark:update`，那次 update 会立刻把删掉的字段写回，「baseline 中不存在 hash 字段」的断言当场变红。要让删除生效就必须放宽 `actual` 侧的 hash 校验，而那会打掉 `scripts/frontendBenchmark.test.mjs` 中六处既有断言，与本任务「不放宽任何现有门槛」直接冲突。
- 改为锁定「baseline 侧的 hash 永不参与比较」：
  - 新增测试断言 `gateBenchmark` 与 `gateBenchmarkUpdate` 的比较项中不含 `contractHashes`（当前事实：`hardGateComparisonFailures` 只比 bundle 四项与 `totalJsGzipBytes`）。
  - 在 `frontend-architecture.json` 或脚本中加注释，写明该字段仅为 metadata、唯一权威是 `packing-results.json`。
  - `actual.contractHashes` 来自 `:382` 的 `verify()`（与 golden 不符即 throw），本身是可信的，不需要动。
- 验证标准：
  - 收紧后连续两次 `npm run benchmark`（空载）均零退出，且首像素 median/P95 与新基线的偏差在 20% 内；把两次实测值写入 `CHANGELOG.md`。
  - 新增或扩展 `scripts/frontendBenchmark.test.mjs` 用例：断言 gate 的比较项不含 `contractHashes`，且唯一权威 hash 来源是 `packing-results.json`。
  - `benchmark:update` 的静默放宽问题（`reportAcceptedTimingRegressions` 只 `console.warn`）在本任务中至少改为：放宽超过 20% 时要求显式 `--allow-timing-regression`，否则非零退出。
- 提交：`test(benchmark): tighten first-pixel baseline and remove dead hashes`。

## 任务 P2-6：修掉安慰剂 E2E 与存在性断言

- 根因一：`e2e/container-calc.spec.ts:346-365`「adds cargo and recalculates utilization」的全部结果断言是 `/Volume utilization: \d+\.\d%/`、`/Weight utilization: .../`、`Cargo types: 2`、`Layer view` 可见。`Cargo types` 来自 cargo 种类数而非装载结果，利用率只校验正则格式——0.1% 也通过。`:360` 的 `/Tall crate/` 还会同时匹配删除按钮的 aria-label（`src/components/PackingSidebar.tsx:567`），所以一个箱子都没装进去也全绿。同文件 `:1664-1667`（31 托）与 `:1700-1703`（0802）已经建立了正确范式：解析百分比数值再断言下界。
- 根因二：勾选的 ground-only 语义没有任何端到端验证。全 `e2e/` 目录里 `Ground only` 只出现在表单/列表文案断言（`:355`、`:357`、`:939`），没有一处断言 ground-only 箱体的 z 坐标或所在层。这正是 issues/0802 反馈的问题形态。
- 根因三：`src/components/containerScene/rendering.test.ts:242-277` 的相机测试只断言各轴 `> 0` 与四模式互不相同；`rendering.ts:420-432` 的取景系数（1.25 / 0.72·0.48·0.82 / 0.55）全无锁定，改成 12.5 或 0.125 四条测试仍绿。
- 意图与边界：
  - 把利用率断言改为解析数值后断言下界（参照 `:1664-1667` 的既有范式），并把 `/Tall crate/` 换成不会匹配删除按钮的定位方式。
  - 为 ground-only 增加一条端到端断言：勾选后计算，断言该货物在结果中全部位于第 1 层或 z 为 0（可通过明细表或分层视图的可见文本断言，不要求读 3D 内部状态）。
  - 相机测试补上距离/取景公式的数值锁定（用当前实现值作为期望，注释说明其来源）。
  - 不新增 E2E 用例文件、不改 `playwright.config.ts`、不动零跳过门禁。
- 验证标准：
  - 反向证明：临时让 `calculatePacking` 只放入 1 个箱子，「adds cargo and recalculates utilization」必须变红（改造前不会红）；恢复后转绿。过程记入 `decision.md`。
  - 相机系数任一项改动 10 倍，对应用例必须变红。
  - `npm run test:e2e` 保持零失败零跳过。
- 提交：`test(e2e): assert loaded quantities and ground-only placement`。

## 任务 P2-7：建立机器可读的轮次状态与文档一致性

- 根因：审查确认四处记账失真。`CHANGELOG.md` 存在「（已完成）」标题下仍有未勾选 `- [ ]` 且自述 BLOCKED 的条目（该项后已被修好但勾未回），这条陈旧记录**直接把本轮一个审查 agent 误导出错误结论**（把已修好的性能指标判为「无法成立」）。`decision.md:713-719`「不继续放宽门槛」被 `d037df0` 反向执行且未标 supersede。08-03 复审列的 8 项整改没有对应 `plans/` 文件。`src/data/releaseNotes.ts` 停在 r60，之后 5 个用户可见修复（含直接改变箱数的 `d037df0`、修生产 Excel 导入的 `abf53d6`）无发布说明。
- 意图与边界：
  - 新增一份机器可读的当前轮状态清单（建议 `plans/status.json` 或等价物）：任务 ID、计划文件、状态（`open` / `in-progress` / `verified` / `committed` / `deployed` / `superseded`）、关联 commit、验证命令与结果、被谁 supersede。
  - 历史 `CHANGELOG.md` / `decision.md` **只追加不重写**；给失真条目追加 supersede 指向，不删除原文。
  - 补齐 r61 起的 release notes，覆盖 `6f864a9`、`d037df0`、`abf53d6` 等用户可见改动。
  - 不引入新框架、不做 CI 集成（本项目无 CI），校验脚本以本地可跑为准。
- 验证标准：
  - 新增校验脚本：状态清单中每个 `committed` 条目的 commit 必须存在于 git 历史；每个 `verified` 条目必须有验证命令记录；发现 `CHANGELOG.md` 中「已完成」标题下存在未勾选项时非零退出。
  - 该脚本在当前仓库状态下运行，必须先**失败**（因为存在已知失真），修完文档后转为通过。先红后绿的两次输出都写入 `decision.md`。
- 提交：`docs: add machine-checkable round status and close accounting drift`。

---

## 执行顺序与提交纪律

1. P2-1（守恒 + 补回断言）——地基，必须第一个做。
2. P2-2（几何独立重算）、P2-3（支撑率具名）——可并行，都是补网。
3. P2-4（golden 门禁）——依赖 P2-1 的守恒断言存在。
4. P2-5（基线收紧）、P2-6（E2E 与相机）——可并行。
5. P2-7（状态与文档）——最后做，此时前六项的结果正好是它要记录的内容。

每个任务独立 commit。提交前 `git status --short`，只暂存本任务文件。工作区既有的 `.serena/project.yml` 与 `issues/0802/` 未跟踪素材一律不得提交。

每个任务完成后运行针对性测试，全部任务完成后运行 `npm run lint && npm test && npm run build` 与 `npm run test:e2e`。

## 本阶段禁止事项

- 禁止修改任何 `src/lib/packing.ts` / `blocks.ts` / `quickPlace.ts` 的算法行为。本阶段只加测试与门禁。
- 禁止修改业务夹具（`test-data/excel/`、`test-data/json/`）与 `packing-results.json` 的内容。
- 禁止为了让新断言通过而放宽任何既有断言。新断言若揭示既有缺陷，记入 `decision.md` 并留给第三阶段——**这正是本阶段的预期产出之一**。
- 所有反向证明（临时改坏代码验证测试会红）都必须还原，且不得提交。

## 完成标准

- 0629 的 groundOnly `unplaced` 契约已补回；数量守恒不变量覆盖全部五个夹具。
- `packingInvariants` 的几何断言不再依赖被测实现自报的 diagnostics。
- 50% 支撑率与 `support-check` warning 各有具名用例，改坏时失败信息指向原因。
- `test:contracts:update` 无法静默写入数量回退的 golden。
- 首像素基线已在空载下收紧；`frontend-architecture.json` 的 `contractHashes` 已在文件内注释为「metadata only, never compared」，并有测试锁定 gate 比较项不含它（**不删除该字段**，理由见 P2-5）。
- 「adds cargo and recalculates utilization」在只装 1 箱时会红；ground-only 有端到端断言。
- 存在一份机器可读轮次状态，且校验脚本从红转绿。
- 全套 `npm test` 与 `npm run test:e2e` 零失败零跳过；期间发现的所有既有缺陷已记入 `decision.md` 并纳入第三阶段范围。
