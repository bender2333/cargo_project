# 2026-08-03 当前架构、项目组织、测试反馈与 loop/agent 复审

## 1. 结论

当前运行时代码的本地正确性门禁为 GREEN，但重构的架构目标和执行可审计性没有完全闭环，不能把本轮状态描述为“架构与流程全部完成”。

- **运行时回归：GREEN**：lint、unit/performance、build、local E2E、benchmark 和本轮聚焦合同测试均通过。
- **架构：CONDITIONAL**：`PackingResult` 终结器和 active result 方向已合理，但 `Workbench`、`ContainerScene`、大 props 接口和历史恢复事务仍未达到计划目标或仍有结构性风险。
- **项目/文档：BLOCKED（文档与审计层）**：`README.md` 仍把项目描述成纯前端/localStorage，与当前 server/API/认证/部署事实冲突；用户反馈素材没有索引和回归映射。
- **loop/agent：不可审计**：仓库内 `.agents/` 为空，没有可验证的任务状态机、agent 输出绑定、失败停止记录或保护夹具/baseline 的自动门禁。`CHANGELOG.md` 和 `decision.md` 是人工长日志，不足以证明每轮 agent 按要求执行。
- **生产状态声明：未重新证明**：本轮按计划未部署、未执行远程 E2E；`CHANGELOG.md` 中的远程部署/远程 E2E 仅作为历史记录，不作为本轮 fresh evidence。

当前工作树有一项既有用户改动，审查全程未触碰：`.serena/project.yml` 的 `languages:` → `language_servers:`。当前 HEAD 为 `c28a30b stage`。

## 2. Fresh verification

| 检查 | 当前结果 | 证据 |
| --- | --- | --- |
| `npm run lint` | GREEN | 退出码 0 |
| `npm test` | GREEN | ordinary **91 files / 789 tests**；packing performance **2 files / 6 tests** |
| `npm run build` | GREEN with warning | **320 modules transformed**；保留 Vite 大 chunk warning |
| `npm run test:e2e` | GREEN | **123 passed / 0 failed**；no-skipped reporter 生效；负向 API/动态 chunk 场景仍输出预期 console error |
| `npm run benchmark` | GREEN | 当前报告 `test-results/benchmark/frontend-architecture.json`，五个 packing hashes 存在且 gate 通过；`totalJsGzipBytes=694398`；3D 首像素 median/P95=`41.625/45.500 ms`；resize median/P95=`279.175/299.000 ms` |
| 聚焦合同命令 | GREEN | **12 files / 152 tests**，覆盖终结、历史、导入、诊断、朝向导出和 server parity |
| 真实俄罗斯 31 托 E2E | GREEN | `npx playwright test e2e/container-calc.spec.ts --grep "P2-6 full 31-pallet flow"`：**1 passed** |
| 手动历史恢复 E2E | GREEN | `npx playwright test e2e/manual-3d.spec.ts --grep "手动历史快照在当前货物切换后恢复货物 A 身份和数量"`：**1 passed** |
| `git diff --check` | GREEN | 无输出 |
| 远程部署/E2E | 未执行 | 本轮审查计划明确排除部署；不得引用历史日志代替 fresh remote evidence |

## 3. 架构合理性

### A-P1：架构收口验收目标仍未达成，状态容易被误读

**证据**

- `plans/2026-07-30-refactor-review-round-3-remediation.md:244-249` 明确要求：`Workbench.tsx ≤1500`、`ResultsPanel`/`VisualizationWorkspace` props 各 `≤25`、`ContainerScene.tsx ≤600`。
- 当前文件规模：`src/Workbench.tsx` **1929 行**，`src/components/ResultsPanel.tsx` **649 行**，`src/components/VisualizationWorkspace.tsx` **599 行**，`src/components/ContainerScene.tsx` **1350 行**。
- `ResultsPanelProps` 在 `src/components/ResultsPanel.tsx:166-229`，约 64 个字段；`VisualizationWorkspaceProps` 在 `src/components/VisualizationWorkspace.tsx:82-156`，约 74 个字段。
- `CHANGELOG.md:3-7` 把第四轮整改和发布门禁写成“已完成”，但并没有同步明确“架构目标仍未达成”。历史 `decision.md` 曾承认这些目标部分完成，但当前顶部状态没有把它作为当前开放项呈现。

**风险**

这不是单纯行数问题：Workbench 仍同时协调导航、多个远程 catalog、导入事务、手动命令、导出命令、键盘作用域和视觉状态；两个大 props 接口使职责所有权依赖调用方记忆。后续 agent 可能把“发布门禁 GREEN”误读成“重构目标全部 GREEN”，继续在大组件上打旁路补丁。

**违反/偏离**

偏离计划任务 9 的显式验收标准；也削弱 `CLAUDE.md` 中“状态/命令下沉到 feature controller、UI 消费单一结果”的维护目标。

**最小后续动作**

不为凑行数大拆文件。先把 `ResultsPanel` 和 `VisualizationWorkspace` 的命令/状态按现有 feature controller 下沉，保留 `activeResult` 和 `planCompliance` 单一输入；每一刀增加 runtime component/E2E 回归，并在 `CHANGELOG.md` 将“发布 GREEN”和“架构目标 GREEN”分开记录。

### A-P2：历史恢复仍由两个 reducer/action 协调，不是单一业务事务

**证据**

- `src/Workbench.tsx:1377-1385` 调用 `restoreHistory(...)`，切换 packing session 的柜体、货物、模式、结果。
- 紧接着 `src/Workbench.tsx:1387-1402` 单独调用 `restoreHistoryDraft(...)`，切换 manual session 的 draft、mode、cargo plan 和默认堆叠层数。
- `src/hooks/usePackingSession.ts:81-99` 自己拥有一个 `historyRestored` reducer action；manual session 有独立恢复输入。
- 当前针对 cargo A/B 切换的 E2E 已通过，说明当前调用路径行为正确；问题是业务边界仍由 Workbench 维护调用顺序。

**风险**

未来新增恢复入口时，漏调其中一个 action、传入不同快照版本或在中间插入副作用，会重新产生“结果已恢复但草稿未恢复”的分裂状态。现有测试证明当前入口，不证明“历史恢复”在模型层是原子操作。

**最小后续动作**

增加一个只读的恢复协调器/事务命令，统一接收已校验 snapshot 并返回 packing/manual 两侧的同一 revision；至少增加“任意恢复入口必须同时更新 result 与 draft”的 reducer/集成行为测试。不要在 UI 再增加第三套状态。

### A-P2：前端与服务端历史 validator 仍是两套近重复实现

**证据**

- `src/lib/historySnapshot.ts`（586 行）和 `server/historySnapshot.mjs`（465 行）均独立实现 `record`、`array`、`validateContainer`、`validateCargoItems`、`validateManualDraft`、`validatePackingResult`、`assertValidHistoryPlanData`。
- 两边存在同一字段/枚举/支撑/pose/数量校验逻辑，但 TypeScript 类型和 JavaScript 实现分别维护。
- 当前 server parity 测试通过，说明当前输入边界一致；不等于以后修改会自动保持一致。

**风险**

新增字段、枚举或快照版本时容易只改一侧；历史 API 可能出现“前端可保存、服务端拒绝”或反向漏洞。此前 `decision.md` 和 `CHANGELOG.md:50` 已把长期 validator dedup 列为 follow-up，当前仍未关闭。

**最小后续动作**

优先抽取可被 Vite 与 Node 同时消费的无框架 schema/规则模块，保留前后端薄适配层；若运行环境限制不能共享实现，则把同一组边界 fixture 作为强制 parity contract，并在 CI 中运行两端。

## 4. 文件与项目合理性

### B-P1：README 与实际运行/部署架构冲突

**证据**

- `README.md:5` 写“暂不包含账号、多用户、权限”；`README.md:16` 写历史方案保存在浏览器 `localStorage`。
- `README.md:85-118` 写“纯前端静态站点、不依赖后端服务、没有后端 API”。
- 同一文件 `README.md:123-176` 又描述 `cargo-server`、SSH、远程备份和部署脚本。
- 当前源码和测试已有 `server/`、Express API、JWT、SQLite、`src/api/historyPlans.ts`、`playwright.config.ts:18-37` 的本地 API 服务；`CLAUDE.md:68-74,95-108` 也明确记录 server-backed history、认证和服务端限制。
- PRD `:20-21,55-57,539-549` 要求保留账号/管理员审计基础能力以及备份、迁移、健康检查和回滚说明。

**风险**

新 agent 或运维人员按 README 部署纯静态站点，会遗漏后端服务、数据库、认证、API 反向代理、备份和回滚，造成历史/用户数据不可用或错误上线。该冲突直接影响生产操作，不是文案小问题。

**最小后续动作**

把 README 的产品范围改为“前端工作台 + Express/SQLite 服务端”；明确本地 `npm run test:e2e` 的双服务、生产服务/路径、数据库备份/迁移/回滚和远程 E2E。保留“不做在线协作/复杂权限/许可证”的范围说明，不把基础认证误删。

### B-P1：仓库内没有可审计的 loop/agent 执行实现

**证据**

- `.agents/` 当前为空。
- `plans/README.md:3-12` 只有人工约定：每轮一个计划、讨论进 `decision.md`、执行进 `CHANGELOG.md`；没有状态 schema 或工具。
- `AGENTS.md:5-13,264-272` 要求每个子任务独立 commit、更新 CHANGELOG、失败先记 decision、跑门禁，但仓库中没有 pending/in-progress/verified/committed 状态文件、agent 输出绑定文件、失败停止记录或保护 baseline/fixture 的检查脚本。
- `scripts/` 目前有测试、benchmark、部署和 E2E reporter，但没有任务状态/agent handoff/提交边界校验器。

**风险**

只能相信 agent 或人工日志“做过了”；无法机器核对某个任务是否改过夹具、是否在失败后削弱断言、是否有独立提交、哪个验证对应哪个任务。外部 loop 即使存在，当前仓库也无法证明其行为。

**最小后续动作**

增加一份每轮机器可读的 task manifest（任务 ID、计划文件、目标文件、状态、负责人/agent、commit、验证命令/结果、阻塞和 artifact），并增加只读校验脚本：任务完成前检查状态、commit 范围、保护路径和验证记录。外部 agent 编排可继续使用，但必须把 handoff 结果落库。

### B-P2：用户反馈素材和 debug 快照没有 manifest/索引

**证据**

- `issues/0720/` 目前只有 `01.png`、4 个 MP4 和 3 个 `cargo-debug-snapshot*.json`，没有 README、问题编号映射、来源、复现步骤、期望结果、修复提交或回归测试链接。
- `test-data/json/` 存放多组 baseline/Vietnam/0629 快照和若干匿名快照，同样没有统一 manifest 将素材映射到 `decision.md`、`plans/*`、测试名称和当前状态。
- `src/lib/debugSnapshot.test.ts`、`e2e/manual-3d.spec.ts:486-519` 证明 debug 功能本身有覆盖，但不能证明 `issues/0720` 每个用户反馈文件都进入了回归链。

**风险**

素材会变成“可打开但不可验收”的附件：下一轮 agent 不知道哪个快照重现哪个反馈，也不知道修复后应运行什么测试。重复反馈和已关闭反馈无法区分。

**最小后续动作**

新增 manifest（不移动、不重命名现有素材），每个条目包含素材路径、反馈摘要、输入规模、复现命令、预期失败、根因/决策链接、修复 commit、回归测试和状态。把 31 托 Excel、越南 Excel、0629 快照和 0720 用户素材分成“业务验收/算法诊断/视觉反馈”三类。

### B-P2：frontend benchmark baseline 仍携带不再权威的重复 contract hashes

**证据**

- `test-data/baselines/frontend-architecture.json:16-21` 保留旧的五个 contract hash。
- 当前实际报告 `test-results/benchmark/frontend-architecture.json:16-21` 使用另一组 hash；本轮 `npm run benchmark` 通过是因为 `scripts/frontendBenchmark.mjs:234-245` 明确调用 `validateBenchmarkReport(..., { requireContractHashes: false })` 读取 baseline，不再比较 baseline hashes。
- `test-data/baselines/packing-results.json` 才是当前 packing contract 的权威 golden；`scripts/frontendBenchmark.mjs:126-149` 仍严格要求 actual report hashes 有效。

**风险**

基线文件看起来仍然声明业务合同，却实际上被 gate 忽略，容易再次造成 hash drift、误报或 agent 误改 baseline 的问题。

**最小后续动作**

在不改变 timing/bundle baseline 的独立维护任务中移除重复字段，或把字段重命名为明确的历史 metadata 并由 schema 禁止将其当作 gate 输入；增加测试确认唯一权威是 `packing-results.json`。

## 5. Debug、测试与反馈案例

### C-P2：架构边界测试主要是源码字符串断言，不是运行时行为证明

**证据**

`src/Workbench.sessionBoundary.test.ts:1-189` 多处 `readFileSync(...).toContain()`、`not.toContain()`、正则匹配源码，例如 `:152-171` 通过检查字符串证明 `runPlanExport` 存在，`:174-188` 通过检查字符串证明键盘守卫存在。

**风险**

源码字符串测试可以在死代码、注释、未挂载分支或错误调用路径中通过，不能证明浏览器运行时真的使用了该边界。`CHANGELOG.md:50` 已明确把“local plan-export error boundary 的 runtime behavioral coverage”列为 follow-up，当前仍未补上。

**最小后续动作**

保留少量 source boundary 检查作为结构护栏，但新增真实行为测试：mock 一个导出操作 reject，触发按钮并断言用户可见错误/alert、没有成功下载；在 Workbench/浏览器环境触发键盘事件，断言不同导航、表单焦点和手动工作区的状态变化。

### C-P3：部分纯函数测试在前置结果缺失时静默结束

**证据**

`src/lib/cogVisual.test.ts:91-109` 在 `buildTruckGeometry(...)` 返回空值时直接 `return`，因此后续几何断言不会执行。该模式与仓库 `AGENTS.md` 的“失败必须显式暴露”原则冲突。

**风险**

实现退化为返回 `null` 时测试仍可能显示通过，失去几何案例的保护价值。

**最小后续动作**

将前置条件改为显式 `expect(geo).not.toBeNull()`，再使用非空值；若空值是合法输入，单独写“空输入返回空”的测试，不让同一个业务测试静默跳过。

### C-P2：测试案例覆盖很强，但反馈→回归映射仍不完整

**已确认强覆盖**

- `src/lib/packing.31pallet.test.ts:13-65` 使用真实俄罗斯 Excel，断言自定义柜体、31/31、硬约束和 contract hash。
- `e2e/container-calc.spec.ts:1595-1630` 覆盖真实 UI 导入、映射、自定义柜体、volume 模式和 31/31。
- `e2e/manual-3d.spec.ts:441-484` 覆盖当前货物切换后的手动历史恢复。
- `src/lib/importWorkbookBoundary.test.ts`、`src/lib/importWorkbookWorkerClient.test.ts`、`src/lib/importWorkflow.test.ts` 覆盖 Worker 上限、错误协议、确认边界。
- `src/lib/packingInvariants.test.ts`、`src/lib/finalizePackingResult.test.ts`、`src/lib/manualSteps.test.ts` 覆盖支撑、层级、work step 和自动/手动终结结果。
- `scripts/historySnapshot.server.test.mjs` 与 `src/lib/historySnapshot.test.ts` 覆盖前后端快照边界。
- `scripts/no-skipped-e2e-reporter.mjs:1-15` 能把运行时 skipped 转成失败，而不是静默通过。

**仍无法证明**

`issues/0720` 的每个用户素材是否有对应测试；当前 repo 只能证明有若干 debug snapshot/下载能力，不能把每个视频/快照与回归用例一一对应。远程日志 E2E 的历史证明存在于 `CHANGELOG.md:66-70,112-123`，本轮没有重新连接生产站点。

## 6. loop/agent 执行纪律

### D-P1：CHANGELOG 是人工 append-only 长日志，当前状态不可机器判定

**证据**

- `CHANGELOG.md` 当前 **1611 行**，`decision.md` 当前 **2091 行**，没有统一任务 ID/状态/commit/验证/artifact 字段。
- `CHANGELOG.md:33` 仍保留 `[ ] P2-7`，而 `:88`、`:98`、`:114-123` 后续条目又写 benchmark、本地 gate、部署和远程 E2E 已 GREEN。
- `CHANGELOG.md:64` 写历史快照 review 的 release/deployment 仍 BLOCKED，`:69` 写远程 debug-log 只完成单项，`:99` 写 deployment/remote E2E pending；这些后来有新段落覆盖，但没有统一状态索引或 superseded 关系。
- `CHANGELOG.md:24-25` 还把聚焦测试记录为“1 passed / 8 skipped”；这对 `-t` 聚焦命令可能是合理现象，但日志没有统一区分“选择性未执行”和“运行时 skip”。

**风险**

agent、reviewer 或下一轮执行者无法可靠回答“当前开放任务是什么、哪条 RED 已被哪条 GREEN 关闭、哪次验证属于哪个 commit”。这会导致重复修复、错误宣称完成或漏掉真实 blocker。

**最小后续动作**

保留历史 CHANGELOG，不重写历史；新增当前轮状态表，或机器可读 manifest，明确 `open/blocked/verified/committed/deployed`，每个状态必须链接 commit、验证 artifact 和 superseded 条目。所有新任务只能更新 manifest 和在 CHANGELOG 追加摘要。

### D-P2：最新 `stage` 提交没有任务/验证元数据

**证据**

`git show --stat c28a30b` 显示提交标题仅为 `stage`，包含 `.codegraph/.gitignore` 和 `issues/0720/` 的 10 个大型素材文件，但不包含 `CHANGELOG.md`、计划文件、decision 或测试记录。

**风险**

这不符合 `AGENTS.md:10-13` 要求的“每子任务独立 commit + CHANGELOG + 失败/取舍记录”，也无法从提交本身判断这些素材属于哪个反馈任务、是否已经验证。

**最小后续动作**

不重写已有提交；在当前状态 manifest 中补录该提交的来源、范围、保护对象和验证状态。以后禁止使用无任务 ID 的 `stage` 提交作为任务交付提交。

### D-P2：夹具/baseline/断言保护目前主要靠文字规则，没有自动拒绝机制

**证据**

`AGENTS.md:7-13,264-272` 和 `plans/2026-07-30-refactor-review-round-3-remediation.md:7,48,271-280` 明确禁止修改业务夹具、baseline、阈值或削弱断言来取绿；仓库现有 scripts 没有针对任务提交范围、baseline hash、fixture checksum 或测试断言变化的通用检查器。

**风险**

遵守规则依赖 agent 自觉和人工 review。发生误改时，只有事后 diff 才能发现，不能在任务结束前 fail loudly。

**最小后续动作**

为 protected paths 建立只读 checksum/路径校验和提交前报告；任务 manifest 记录允许修改文件；若发现 baseline/fixture/test assertion 变化，要求显式 decision/人工确认，而不是静默阻断或自动覆盖。

## 7. 已确认合理项

- `PackingResult` 已有明确中心地位；自动路径 `src/lib/packing.ts:1302-1305` 和手动路径 `src/lib/manualSteps.ts:83-90` 都经过 `finalizePlacementGeometry`，当前聚焦合同测试和 31 托/历史恢复 E2E 通过。
- active plan compliance 已作为结果面板和导出/保存入口的共同输入；`ResultsPanel` 不再自行重建合规状态。
- Worker 导入边界、真实 31 托夹具、历史快照前后端 parity、no-skipped E2E reporter 和 benchmark gate 都是当前项目的有效质量资产。
- 失败记录总体上没有简单删除断言或修改 baseline；`decision.md` 保存了多个真实 RED、根因和后续 GREEN 证据，这是继续完善审计链的良好基础。
- 当前本地工作树的 `.serena/project.yml` 用户改动已被保留，没有被本轮审查覆盖。

## 8. 后续整改任务顺序

1. **P1 文档/运行事实统一**：修正 `README.md` 的 frontend-only/localStorage 描述，补齐 server/API/SQLite/认证/部署/备份/回滚/远程 E2E 说明；不改产品范围。
2. **P1 loop/agent 可审计状态**：建立当前轮 task manifest 和校验脚本，先覆盖任务状态、commit、验证 artifact、protected paths、blocked/superseded 关系。
3. **P1 架构目标重新定标**：以行为边界而非行数为先，拆 Workbench/Results/Visualization/ContainerScene 的状态所有权；每刀保持 `activeResult`/`planCompliance` 单一合同。
4. **P2 历史恢复事务 + validator parity**：统一恢复协调边界，随后抽取共享 validator 或强化双端 parity contract。
5. **P2 测试行为化**：补 plan-export reject 的真实 UI 测试，逐步降低 source-text 断言对业务完成度的代表性；修正 `cogVisual` 静默 return。
6. **P2 反馈/夹具 manifest**：为 `issues/0720`、`test-data/json`、Excel 夹具和 benchmark 建立素材→复现→测试→修复→状态映射。
7. **P2 baseline 清理**：在独立维护任务中移除/标记不再权威的 frontend contract hashes，并保留当前 timing/bundle baseline 不变。
8. 以上整改全部完成并 fresh 验证后，才另开部署计划执行 dry-run、生产部署、SHA-256、健康检查和远程 E2E；本轮不部署。

## 9. Overall decision

**Review result: CONDITIONAL / architecture-process remediation required.**

当前产品运行路径有可重复的本地 GREEN 证据，核心业务案例和测试安排总体合理；但架构计划的明确收口目标、README 运行事实、反馈素材索引和 loop/agent 任务审计仍未闭环。下一轮不能只追加更多旁路测试或继续把历史 CHANGELOG 标成完成，必须先补可审计状态和上述 P1 项。
