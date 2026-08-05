# 2026-08-04 第五轮全面审查：重构起点至今（只读）

- 审查范围：`5d15872`（2026-07-21 前端架构重构计划）→ `39134d8`，共 **122 提交 / 14 天 / 198 文件**。
- 审查方式：7 个维度并行深读 + 6 个维度对抗复核 + 综合，共 15 个 agent，约 137 万 token。
- **全程严格只读**：未执行任何 `npm` / `npx` / `vitest` / `playwright` / `build` / `benchmark` 命令，未改动任何代码，未改变 git 状态。
- 审查期间 Codex 并发提交了 `6c4576f`、`d442e7b`；本文结论基准为 `39134d8`，涉及被后续提交改变的前提已在文末「审查后的状态变化」标注。
- 本文是**发现记录**，不是实施计划。实施计划见 `plans/2026-08-04-*.md`。

---

## 证据分级说明

沿用 `issues/0802/analysis.md` 建立的分级方式（这套做法值得保留）：

- **CONFIRMED**：主审查给出证据、且经独立对抗复核逐行核对确认。
- **代码直接可证（未复核）**：行号与推理链在源码中可验证，但所属维度的对抗复核因网关错误未完成。
- **PLAUSIBLE / likely**：推理成立但关键环节需运行时确认。
- **REJECTED**：主审查提出但被对抗复核推翻，**不得据此修改代码**。

C 维度与 E 维度的对抗复核因 API 错误失败（分别为 connection closed 与 Cloudflare 524），因此这两个维度的发现**未经独立复核**。其中 E1、E3、E4 与 0629 断言删除一项，架构师已亲自读源码核对过行号与逻辑。

---

## Blocker

### B-1 生产环境种入公开已知口令账号 testuser/testuser123

- 证据：`server/db.mjs:262` `DEFAULT_TEST_PASSWORD = 'testuser123'`；`initTestUser` 唯一开关是 `if (process.env.SKIP_TESTUSER === '1') return`，**无 `NODE_ENV` 判断**；文件末尾无条件调用 `initTestUser()`。
- `CHANGELOG.md:1351` 记录的生产 env 只有 `NODE_ENV` / `AUTH_LIMIT_MAX` / `REGISTER_LIMIT_MAX`，无 `SKIP_TESTUSER`。全仓 grep `SKIP_TESTUSER` 仅 4 处，没有任何部署脚本或 env 模板设置它。
- `scripts/deploy.mjs` 每次部署 scp `server/*.mjs` 后 `systemctl restart`，即每次重启都重跑种入。
- **生产已存在的证据**（不需要探测生产）：`e2e/container-calc.spec.ts:216-217` 与 `e2e/manual-3d.spec.ts:10-11` 固定用 `testuser/testuser123` 登录，而 `CHANGELOG.md:1328/1351` 记录该套件在 `PLAYWRIGHT_BASE_URL=http://101.33.232.150/` 上通过。登录失败会导致全套用例红。
- 后果：凭据同时写在 `CLAUDE.md`、`decision.md` 与源码里。任何人可登录并写 `/api/history`、`/api/custom-cargo`、`/api/import-templates`、`/api/export-templates`、`/api/containers/custom`。rate limit 对已知口令的一次成功登录无效。
- verdict：**CONFIRMED**（G 维度主审查 + 对抗复核）

### B-2 quickPlace 建箱漏传 groundOnly，非法放置先被判为合法

- 证据：`src/lib/quickPlace.ts:95-110` `makeCandidateBox` 传了 `stackable`、`maxStackLayers`，**独缺 `groundOnly`**（架构师已亲自核对）。对比拖拽路径 `src/hooks/useManualPlacementSession.ts:355-359` 是完整的。
- 传导链：`src/lib/manualPlacement.ts:828` 写入 `undefined` → `src/lib/stackCapacity.ts:55` `if (current.groundOnly && currentLayer > 1)` 永不触发 → `quickPlace.ts:146` `validateDraft` 不报 ground-only 错误 → `:148` 返回 `ok: true`。
- 提交后 `src/lib/manualPlacementSession.ts:60` 把 `true` 写回，下一帧该箱变 error。
- `src/lib/quickPlace.test.ts` 中 `groundOnly` 出现 **0 次**。
- 后果：地面占满时对 `groundOnly` 型号点「快速放置」，系统主动把它放到高层、返回成功、撤销栈记一步，下一帧标红。这是 `AGENTS.md` 第 12 条禁止的「失败伪装成成功」。
- verdict：代码直接可证；架构师已核对，但 E 维度对抗复核未完成

---

## Major

### M-1 装箱策略根因未解决：`maxStackLayers=99` 与留空走相反策略

- 证据：`src/lib/packing.ts:436` `const capacity = stackCapacity(item)`，`:465` `if (Number.isFinite(capacity))` 进入有限分支，`:477` 主排序项为 `(container.height - point.z) * ...`（**z 越高越优**），且 `:466-468` 除首箱外强罚地面；无限分支 `:495-497` 主排序项使 **z 越低越优**。
- `src/lib/stackCapacity.ts:23` 使 `99` 成为有限值。
- 后果：这是 `issues/0802` 里 860 / 858 / 873 / 877 四个数字互相打不通的机制来源。用户填 99 的语义是「不限制」，系统理解成「受约束」。任何未通过 `shouldUseBlockEngine` 的输入，只要 Excel 里填了大数而不是留空，实际装箱数就低于留空。
- `d037df0` 的 gate 修复只让 0802 这一份输入侧滑进块引擎，**没有触碰这个根因**。
- verdict：代码直接可证（E，未复核）

### M-2 gate 用整批最短箱算界，任一 SKU 填 ≤12 层即整批退回旧路径

- 证据：`src/lib/packing.ts:873-881`，`conservativeMaxPhysicalLayers = Math.ceil(container.height / Math.min(...fittingHeights))`。0802 fixture 全批最小 fitting height 为 **210mm**（`TP-B10-EV_v1.1`，350×260×210），有效柜高 2690 → 界为 **13**。全批 99 以 86 层余量通过。
- **界是整批共享的，约束是逐 SKU 检查的**：那个 210mm 矮箱把界抬到 13，于是某个只需 10 层就顶到柜顶的 SKU 填 12 也会让全批 28 个 SKU 一起掉回旧路径。
- 叠加 M-1 的评分翻转，结果直接回到 860/877。用户只要把任一行的最大层数从 99 改成 10（完全合理的实际堆码限制）就会再次反馈「均未把所有货物装完」，且界面没有任何提示说明「因某一行的设置，整批切换了算法」。
- 次生脆弱性：`src/lib/packing.ts:614-624` `minimumFittingHeight` 对超尺寸 SKU 返回 0，`:874` `if (fittingHeights.some((height) => height <= EPSILON)) return false` —— 一行录错尺寸就让整批退出块引擎。
- 数学上 gate 本身是可靠的保守界（通过 gate 的输入其有限约束物理上不可能被触发），问题在于**对输入的敏感度远高于用户能预期的程度**。
- verdict：代码直接可证（E，未复核）

### M-3 块路径 fallback 排除 groundOnly，未放完的直接判 no-space

- 证据：`src/lib/packing.ts:1142` `const nonGroundStates = cargoStates.filter((state) => !state.item.groundOnly)`，`:1177-1188` 剩余量直接 `markUnplaced`。
- phase-1 可在 `:1127` 因 `rejectionsSinceCommit >= MAX_BLOCK_REJECTIONS_PER_STEP`（`:73` 定义为 40）提前 break。
- 而 fallback 用的 `canPlace`（`:205` `if (item.groundOnly && support.physicalLayer > 1) return false`）本身已强制 groundOnly 只能落地，`:1154` `canUseTopSurfacePoints` 对 groundOnly 返回 false。
- 后果：**排除是纯防御性的** —— 合法性已由 `canPlace` 保证，所以这个改动只能少装货、不可能多保障合法性。旧的非块路径不存在这个不对称。用户看到「地面还有空位，只能落地的型号报装不下」。
- verdict：代码直接可证（E，未复核；架构师独立发现并核对）

### M-4 0629 groundOnly 的 no-space 断言被删除，三份文档均未披露

- 证据：`6f864a9` 时 `src/lib/packing.test.ts:586-596` 结尾为 `expect(result.unplaced).toContainEqual(expect.objectContaining({ label: 'C', reasonCode: UNPLACED_REASON_CODES.NO_SPACE }))`（业务意图见 `CHANGELOG.md:690`）。
- `d037df0` 删除该断言，用例改名，换成 `expect(result.placedCount).toBeGreaterThanOrEqual(quantity ? 188 : 156)`（架构师已亲自核对当前文件内容）。
- **行为并未改变**：0629 quantity 仍只装 188/283，label C 仍只有 84/172 落地，C 确实仍有 no-space。所以断言是被**无理由删除**的。
- `CHANGELOG.md:11` 写成「below the required 188」——把本轮观测值反写成既有要求。
- 现在没有任何测试断言「groundOnly 装不下时必须显式进 unplaced」；`expectValidLargePacking` 不校验 `unplaced`；全库没有 `placed + unplaced === total` 的守恒断言。
- 这是本轮最需要警惕的一条：**删断言取绿且未披露**的完整形态，违反 `AGENTS.md` 第 12 条与 `CLAUDE.md` 的「不为测试通过而修改测试用例」。
- verdict：**CONFIRMED**（F 维度主审查 + 对抗复核；架构师已核对）

### M-5 0.5 支撑率：自动引擎硬编码，与手动可配置 supportPolicy 不同源

- 证据：`src/lib/packing.ts:345` `if (support.supportRatio < 0.5) return false` 是字面量，`CalculatePackingOptions`（`:36-39`）没有接收 `supportPolicy` 的通道；手动侧 `src/lib/manualPlacement.ts:591-601` 用 `supportPolicy.minSupportRatio`，`src/components/PackingSidebar.tsx:257-266` 提供 0-100 输入框。
- 后果：用户把最小支撑率调到 80%（现场作业要求）后跑自动装柜，切手动模式瞬间一批**系统自己算出来的**箱子变 blocking floating error，无法在不移动它们的情况下继续操作。属 `CLAUDE.md` 第 7 条点名的「两套规则同时生效」。
- 测试侧：`packing.test.ts` 中 `supportRatio` 零命中。对抗复核核算 golden 后指出：四个越南夹具的 partially-supported 箱体支撑率最小值分别为 **0.5205 / 0.5273 / 0.5345 / 0.5261**，全部紧贴 0.5，说明这条线是真正 binding 的；改动阈值会让 `packingInvariants.test.ts:313` 的精确 `placedCount` 断言变红。**所以不是开放的洞**，但失败时不会告诉你原因。
- verdict：**CONFIRMED**（D + E 两维度）

### M-6 放置合法性两套并行规则，其中一套喂的是被回放裁剪过的子集

- 证据：`src/components/ContainerScene.tsx:426-450` `computeInvalidByGeometry` 自实现越界（`:438` 自己补 Z 判定）/ 重叠 / 支撑率判定；`:683` `const invalid = sceneState.invalidOverride.has(boxId) || computeDragInvalid(...)`，`:687` 仅 `!invalid` 才调 `onManualMove`，`:698` 否则 `onManualOperationRejected` 并回弹 —— **是一道会拦下提交的硬闸**，但缺 ground-only 与 max-stack-layers 两条规则。
- 第二套在 `src/lib/manualPlacement.ts:555` `validateBox`（五类），由 `useManualPlacementSession.ts:321/364` 各判一次。
- **截断世界**：场景遍历的 `meshEntries` 来自 `VisualizationWorkspace.tsx:489` 的 `visibleManualBoxes`，而 `Workbench.tsx:773-776` 在 `activeResultTab === 'playback'` 时把它裁成子集。手工场景（受 `placementMode`/`workspaceView` 控制）与持有 `activeResultTab` 的 `ResultsPanel` 在 `Workbench` 同一次 render 并列输出（`:1668` / `:1740`），互不卸载。
- 后果：手工模式下把结果区切到「回放」并拖游标，可编辑场景就对着不完整世界判重叠。
- 反馈通道也不一致：场景侧驳回只落到 `manualNotice`（`Workbench.tsx:753-757` 五秒后清除、不写 issues），hook 侧进 `issues`/`blockingInvalidBoxIds` 可回溯 —— 用户无法回溯为什么那次拖拽没生效。
- verdict：**CONFIRMED**（B 维度主审查 + 对抗复核）

### M-7 阶段 4 未达成：Workbench 仍是上帝组件

- 证据：`src/Workbench.tsx` **1929 行**（`git diff HEAD -- src` 为空，非并发改动），`useState` **50** / `useEffect` 14 / `useMemo` 20 / `useCallback` **0**；JSX 从 `:1490` 才开始，前约 1250 行全是状态与编排；组件内仍有 `importExcel`(:1138)、`restorePlan`(:1357)、`saveCurrentPlan`(:1324) 等业务编排函数。
- props：`VisualizationWorkspaceProps` **68**、`ResultsPanelProps` **62**、`PackingSidebarProps` **48**（后者直接透传 `dispatchPackingSession` 与 10 个 `Dispatch<SetStateAction<...>>`）。
- 验收线：`plans/2026-07-30-refactor-review-round-3-remediation.md:244` 明文 `Workbench.tsx ≤1500`、`ResultsPanel`/`VisualizationWorkspace` props 各 `≤25`。
- 具体耦合样本：`activeResultTab`（`:292`）名义上是视觉 tab，实际同时驱动 `:813` 的 3D 重心 overlay 与 `:834` 的柜型对比计算，而这条耦合在两个区域组件的接口上完全不可见。
- **重要澄清**（对抗复核纠正）：状态并非「一条没搬」—— packing/manual session、history、templates、cargo library、playback 都真搬进了 hook + lib reducer，`Workbench.sessionBoundary.test.ts` 还锁住了 `setCargoItems` 不得回流。残留的多是 UI 开关与视觉派生。是「搬走了一半」。
- verdict：**CONFIRMED**（A + B 两维度）

### M-8 视图不消费 activeResult，2D/3D 层选中视觉已实际漂移

- 证据：唯一契约在 `src/hooks/useManualPlacementSession.ts:271`，但 3D/2D 收的是 `Workbench.tsx:769-776` 派生的 `visibleAutoBoxes` / `visibleManualBoxes`；`activeResult` 在 `VisualizationWorkspace` 里只用于四个汇总数字。
- **已实际漂移**：层+标签过滤在 `src/lib/boxVisualState.ts:8-32` 有三档不透明度（active=1 / 选中特定层时其余层 0.09 / general 0.22），3D 经 `rendering.applyBoxVisualState` 走 lib 版，而 `ContainerPlan2D.tsx:72-78` 自己写了两档（0.88 / 0.18），**缺「选中某层时其余层更淡」这一档**。同一个「选中第 2 层」操作在 2D 和 3D 里视觉强弱不一致。
- 附带（PLAUSIBLE）：模式判断有两个来源 —— `Workbench.tsx:482` 把自己的 `placementMode` 喂给 hook，而 `activeResult` 用 hook 内部的 `state.mode` 选。
- **澄清**：没有任何一处重算 `PackingResult`（`calculatePacking` 全仓仅 4 个调用点），这是视图层可见性过滤，不是第二份装箱结果。
- verdict：**CONFIRMED**（B），双来源那半条 PLAUSIBLE

### M-9 admin/admin123 在生产缺失 ADMIN_PASSWORD 时只打 warning

- 证据：`server/db.mjs:271` `process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD`；新库走「created with default password」warning，老库走 `:295-297` 的「may still be the default」warning，**两个分支都不阻断启动**。
- 对比 `server/middleware.mjs:8-12` 对 `JWT_SECRET` 缺失/过短/等于 dev 默认值是 `throw` fail-fast —— 同目录两套强度。
- 后果：运维遗漏即可用公开的 `admin123` 拿到管理员权限（读全部用户名与登录 IP、禁用/删号、读服务器日志）。
- 生产是否仍是 `admin123` 未验证（`CHANGELOG.md:1349` 建议过轮换，可能已换但未记录）。
- verdict：**CONFIRMED**（代码层面）

### M-10 POST /api/containers/custom 零数值校验，脏柜型直接进 calculatePacking

- 证据：`server/index.mjs:127-144` 只做 falsy 检查 `if (!name || !length || ...)`，之后原样绑定入库。
- 对比同文件另两个 CRUD 家族都有专门 parser：custom_cargo 走 `server/customCargo.mjs:1-10` 的 `positiveNumber`，import_templates 走 `index.mjs:260-308` 的 `parseTemplatePayload`（name slice、headerRow clamp、units 白名单）。**同一份代码里三套校验强度**。
- 后果：`length: -5000`、`'1e400'`（非空字符串是 truthy）、任意长度 name 可入库，经 GET 直接进前端柜型列表并喂给 `calculatePacking`。
- 附带配额缺口：`custom_containers` / `custom_cargo` / `import_templates` / `export_templates` 四张表**都没有每用户行数上限**，只有 `history_plans` 有（`historyRoutes.mjs:69` 保留 5 条）。与 B-1 叠乘才是可利用的磁盘增长路径。
- verdict：**CONFIRMED**（G 对抗复核补充发现）

### M-11 README.md 与实际架构冲突，按它部署会漏掉整个后端

- 证据：`README.md:5`「暂不包含账号、多用户、权限」、`:16` 与 `:118`「历史方案保存在浏览器 `localStorage`」「当前应用没有后端 API」、`:85`「纯前端静态站点，不依赖后端服务」、`:269` 仍列 `historyPlans.ts`（该文件已删除）。
- 实际 `server/index.mjs` 有 20 个路由 + JWT + SQLite。同一文件 `:123-176` 又描述 `cargo-server` 与远程部署，自相矛盾。
- `git log -- README.md` 最新为 `0bca842`（2026-05-27），**整个重构期未触碰**。`issues/2026-08-03-*.md` 已将其列为 B-P1 并排在整改顺序第 1 位，此后无人承接。
- 后果：只发 `dist/` 到 nginx，漏掉 Express、SQLite、认证、API 反代与数据库备份，生产上历史方案与用户数据不可用。这不是文案问题，直接影响生产操作。
- verdict：**CONFIRMED**（F 维度主审查 + 对抗复核）

### M-12 reducer 边界之外的三个原子性/契约破口

三条均来自 C 维度，**该维度对抗复核未完成**。

- **C1（confirmed）**：编辑当前选中的自定义柜型后，装箱仍用旧尺寸。`Workbench.tsx:1892-1895` 对话框关闭只 `fetchCustomContainers()` 刷新列表 state，不 dispatch `containerChanged`；`selectedContainer` 取自 `containerSnapshots`（`:399`）。侧边栏显示新尺寸，计算与导出仍是旧尺寸，无失效、无提示。
- **C2（likely）**：手动模式改过 label/color 后保存方案必抛错。`ManualCargoPlanItem`（`manualPlacementSession.ts:12-23`）不含 label/color，`syncBoxGeometry` 不同步；而 `historySnapshot.ts:203-210` 强制 `manualDraft` 与 `placed` 逐字段相等（含 label、color），placed 侧已被 cargo 覆盖（`manualSteps.ts` 的 `enrichPlacedBoxes`）。整套手工布局无法保存，错误文案指不到「改了标签」。
- **C3（confirmed）**：`manualPlacement.ts:840-844` `toPlacedBoxes` 用 `void invalidBoxIds` 显式弃用参数，越界/重叠箱体仍进 `placed` → `placedCount`、体积利用率、分层、明细全部把非法箱算进去。保存与导出被 `planCompliance` 拦住所以不落库，但屏幕上的「还能装多少」是错的。

---

## Minor / Info

| ID | 结论 | verdict |
|---|---|---|
| m1 | 历史恢复跨 packing/manual 非原子：`Workbench.tsx:1377` 与 `:1388/:1396` 分两次 dispatch。`useManualPlacementSession.ts:248-250` 的 reconcile 只能丢掉不存在的 cargoId，共享 cargoId 时陈旧坐标与 undo 栈存活 | CONFIRMED |
| m2 | `ContainerScene.tsx` **1350 行**（验收线 `plans/2026-07-27-*.md:146` ≤600）。三模块职责边界是真的、无环、无第二套 scene graph，但 `rendering.ts` 23 个 export 只有 9 个纯函数有测试，`interactions.ts` / `overlays.ts` **零测试 import** —— 拆分真正想隔离的有状态部分没有单测。项目已在 `7966204` 自我修正记为部分完成 | CONFIRMED |
| m3 | `src/lib/` → `src/components/` 反向依赖**两处**：`importWorkflow.ts:2` 与 `importWorkflow.test.ts:13` 取 `ImportMappingValue`（定义在 `ImportMappingForm.tsx:8`，实为导入解析契约）。type-only，修法是下移一层 | CONFIRMED |
| m4 | `rendering.ts:21` 反向 import `ContainerScene.tsx` 的 `SceneViewMode` 形成 type-only 环；`rendering.ts:23-25` 注释已标明这是迁移残留 | CONFIRMED |
| m5 | 数据获取两套模式：HistoryPage/CargoLibraryPage 走 hook 且失败态收敛在 hook；`UserManagement.tsx:2`、`CustomContainerDialog.tsx:7-8`、`DebugPanel.tsx:2` 直连 api，`Workbench.tsx:402-410` + `:299` 自己管请求与失败态 | CONFIRMED |
| m6 | **3D 首像素 20% timing 门禁事实失效**：baseline 仍是修复前的 206.625/238.125 ms（generatedAt 2026-07-28），当前实测 47.925/57.875 ms，需回退 **5.2 倍**才触发。叠加 `frontendBenchmark.mjs:470-486` 的 `--update` 路径只 `console.warn` 不 fail，一次负载机上的 update 就永久放宽窗口。正确动作是空载下收紧基线，**不是改采样方式** | CONFIRMED |
| m7 | `test-data/baselines/frontend-architecture.json:16-21` 的 5 个 contractHashes 与权威 golden 全部不一致，且 `:236` `requireContractHashes: false` 使其既不比较也不校验。**无代码读取，下次 `benchmark:update` 会自动覆盖为正确值** —— 属误导性死数据，不是失效门禁 | CONFIRMED（已降级） |
| m8 | golden 重生成零门禁：`scripts/update-packing-contracts.mjs` 33 行，无读旧基线、无 diff、无回退拒绝、无 `--allow`（对比 `frontendBenchmark.mjs:271-278` 为 timing 专设了拒绝路径）。它**会**打印新 placedCount 但不比对。真正只由 golden 兜底的是精确 x/y/z、orientationKey、labelRotationDeg —— supportedBy/depthLayer/层号/装载顺序都有独立不变量 | CONFIRMED（已降级） |
| m9 | `packingInvariants.test.ts:318-325` 是**循环自证**：只读 `diagnostics` 里 boundary-check / overlap-check 的 severity，而这两条正是 `calculatePacking` 自己在 `packing.ts:676/692` 算出来的。同文件在 supportedBy 上是独立预言机，几何这一维退回信任被测实现 | CONFIRMED |
| m10 | `packing.ts:700-707` 的 support-check warning 分支从未被断言（唯一断言是 `packing.test.ts:496` 的 `severity: 'info'`，夹具无部分支撑箱）。golden 显示四个越南夹具含 21/31/34/74 个 partially-supported 箱，该分支必然触发。现场唯一的「部分支撑」提示无回归保护 | CONFIRMED |
| m11 | E2E `adds cargo and recalculates utilization`（`container-calc.spec.ts:346-365`）只断言 `/Volume utilization: \d+\.\d%/` 与 `Cargo types: 2`（后者来自 cargoItems 而非装载结果）；`:360` 的 `/Tall crate/` 同时匹配删除按钮 aria-label。**一个箱子都没放进去也全绿**。勾选的 ground-only 语义无端到端验证 | CONFIRMED |
| m12 | `rendering.test.ts:242-277` 相机测试只断言各轴 >0 与四模式互不相同；`rendering.ts:420-432` 的距离系数全无锁定，改成 10 倍或 0.1 倍四条测试仍绿 | CONFIRMED |
| m13 | `quickPlace.ts:136-141` 把承诺朝向做成**硬主排序键**，而 `packing.ts:390-398` 与 `analysis.md` 都声明是「强惩罚而非硬过滤」；`quickPlace.test.ts:193` 已把更强语义固化。不会造成 no-space，但密集局面下会把箱子甩到奇怪位置 | 未复核 |
| m14 | `finalizePackingResult.ts:46-51` 把 z>0 无支撑箱标为 `physicalLayer 1`，`layers.ts:100-101` 会把它与地面箱混层并把该层 maxZ 撑到 2000+，作业指导书上表现为第一层装到 2 米。自动路径不产生此类箱，手动路径会 | 未复核（likely） |
| m15 | 文档记账失真四处：`CHANGELOG.md:30`「（已完成）」标题下 `:60` P2-7 仍未勾选且自述 BLOCKED（该项后已由 `42cbd69` 修好，勾未回）；`decision.md:713-719`「不继续放宽门槛」被 `d037df0` 反向执行且未 supersede；08-03 复审 8 项整改无对应 `plans/` 文件；`releaseNotes.ts` 停在 r60，之后 5 个用户可见修复（含直接改变箱数的 `d037df0`）无发布说明 | CONFIRMED |
| m16 | `test-data/json/0802/input.json` 的 provenance 指向 **untracked** 文件：`CHANGELOG.md:11` 与 `decision.md:2133` 都写源头是 `issues/0802/cargo-debug-snapshot(4)(3).json`，而 `git ls-files issues/0802/` 只有 `analysis.md`。「fixture 忠实复刻用户输入」在干净仓库里不可验证 | CONFIRMED |
| m17 | `package.json:21-42` 把 playwright / vitest / jsdom / @testing-library 放在 `dependencies`；`cookie-parser` 是死依赖（全仓 grep 无 import）；只有 jspdf 精确锁版本。`deploy.mjs` 不自动装依赖，风险取决于运维是否在 `/opt/cargo-server` 手工 `npm install` | CONFIRMED |
| m18 | 写操作失败绕过 `workbenchCopy` 用组件内三元 alert：`CargoLibraryPage.tsx:140/157`、`TemplateManagerPage.tsx` 六处、`CargoImportDialog.tsx:281`、`CustomContainerDialog.tsx:84/88`（**这两处只有中文，英文环境弹中文**）、`Workbench.tsx:1190/1353/1360` | CONFIRMED |
| m19 | `resultInvalidated` action 已定义并有单测（`packingSession.ts:44/229-230`），Workbench 14 处 dispatch 无一使用 —— 失效契约的逃生口是死代码，下一个人更可能像 C1 那样绕过状态机 | 未复核 |
| m20 | `debugLogLimiter`（`index.mjs:513-521`）排在 `authenticate` 之前，同 NAT 出口的未认证流量可耗尽管理员 30 次/分钟排障配额；窗口 60 秒自愈，顺序反了无任何安全收益 | CONFIRMED（info） |
| m21 | `HISTORY_JSON_BODY_LIMIT = 3MB` 被全局挂在唯一的 `express.json` 上（`index.mjs:28`），登录注册同样接受 3MB。命名与作用域不匹配，改历史上限会连带放宽登录端点 | CONFIRMED（info） |
| m22 | `Workbench.sessionBoundary.test.ts` 用 **112 处**源码文本断言锁边界，拦住了 `setCargoItems` 回流，但拦不住 props 从 40 涨到 68、场景内新增校验、视图换数据源；`:179-180` 连换行缩进都断言，正常重排会红 | CONFIRMED（info） |
| m23 | `vite.config.ts` manualChunks 只切 xlsx，three 随 Workbench 块下发；登录前首屏干净，登录后一次性拉大块。实际体积需 build 才知道 | PLAUSIBLE |

---

## 被对抗复核推翻的初判（不得据此改代码）

记录这三条的误判形态，比记录结论本身更有价值。

### R-1 「SQLite 未开 PRAGMA foreign_keys，CASCADE 全部失效」— REJECTED

主审查称 `server/db.mjs` 从未执行 `db.pragma('foreign_keys = ON')`，故 schema 里五处 `ON DELETE CASCADE` 实际失效、删用户留永久孤儿数据。

代码事实正确，**但核心前提错了**：「SQLite 外键默认关闭」只适用于 vanilla SQLite / sqlite3 CLI。better-sqlite3 在 `deps/defines.gypi:14` 编译期定义了 `SQLITE_DEFAULT_FOREIGN_KEYS=1`，外键**默认开启**。CASCADE 是生效的，孤儿数据不存在。

若照此「修复」，会去清理一批本来不存在的孤儿数据。残余价值仅：加一行显式 pragma 是廉价防御，以防将来换驱动 —— 这是加固建议，不是缺陷。

### R-2 「性能门禁无法成立，指标波动 5 倍不可比」— REJECTED

主审查引 `decision.md:20`（totalJsGzip 806,152、超门禁 18.9%）与 3D 首像素 41.6ms vs 267ms 的差异，断言指标波动到无法比较。

引的是**已被后续记录取代的过期证据**。`decision.md:24-28` 已记录根因与修复（导入 worker 与主线程各自打包 SheetJS 重复 112,158 B；2D/3D 切换卸载重建 WebGL context 导致每样本 24 次冷 remount）。现存 `test-results/benchmark/frontend-architecture.json`（2026-08-04T07:21:59，非 `--update` 运行）全门禁通过。

**5 倍差异不是噪声，是两处真实修复的效果** —— 把可解释的性能改善当成噪声，方向正好倒过来。真正的问题是修好之后基线没跟着收紧（见 m6）。

### R-3 「baseline 那 5 个 hash 是假门禁，比没有门禁更危险」— 降级

架构师初判过重。对抗复核确认：没有任何代码路径读取 `baseline.contractHashes`，且 `gateBenchmarkUpdate` 会在下次 `--update` 时把它覆盖为来自真实 worker 的正确值。是误导性死数据，风险仅限于人或 agent 误读。

**共同教训**：R-2 的误判直接源于 `CHANGELOG` 里已被取代的 BLOCKED 记录（m15）。文档失真不只是让读者困惑，它会让下一个审查者产出错误结论并据此改错代码。

---

## 计划达成度

| 阶段 / 标准 | 状态 | 依据 |
|---|---|---|
| 阶段 0 基线 | 达成 | `CARGO_DB_PATH` + `:memory:`（`playwright.config.ts:18-30`）真隔离开发库；no-skip reporter 返回 `{status:'failed'}` 且写死在 config；e2e 四 spec 零 skip；golden 在单测与 benchmark worker 双重校验。timing 子项见 m6 |
| 阶段 1 应用壳 + API 层 | 达成 | `main.tsx`→`App.tsx` 只管认证；Workbench 内 token 操作为零；`src/lib/historyPlans.ts` 已删除；`componentNetworkBoundary.test.ts` 禁组件裸 HTTP |
| 阶段 2 装箱会话状态机 | 达成 | 9 条输入 action 无一漏失效；`calculationCompleted` 双重 guard 且自愈；reducer 纯函数。跨 manual 恢复非原子见 m1 |
| 阶段 3 功能页面 | 部分达成 | 页面抽出且自持远程/表单状态，但数据获取两套模式（m5） |
| 阶段 4 工作台区域 | **未达成** | 1929 行 / 50 useState / props 68·62·48，验收线 ≤1500 与 ≤25（M-7） |
| 阶段 5 ContainerScene | 部分达成 | 三模块职责边界真实、无环；1350 行 > 600；有状态部分零单测（m2）。项目已自我修正 |
| 阶段 6 按需加载 | 达成 | `App.tsx:16` 真懒加载 + ErrorBoundary + 重试；XLSX 五处调用点全按需；管理页按导航加载且各带 LoadFailed |
| 标准 2 历史恢复原子语义 | 部分达成 | packingSession 内原子，跨 manual 侧靠调用方顺序（m1） |
| 标准 3 唯一 activeResult 驱动全部视图 | 部分达成 | activeResult 存在且无重算，但 3D/2D 不消费它，2D 视觉已漂移（M-8） |
| 标准 4 全套单测/E2E 零失败零跳过 | 达成 | `npm test` = `test:unit` + `test:packing-performance`，被 `--exclude` 的两个文件由后者串行执行，四个 vietnam golden 断言无缺口；全库 `it.skip`/`describe.skip`/`it.todo`/`xit` 零命中 |
| 标准 6 关键交互性能不回退 | 达成 | 现存 benchmark 报告全门禁通过。但门禁强度见 m6 |

---

## 做对了的地方（下轮不要动）

- **装箱契约收敛**：`calculatePacking` 全仓 4 个调用点（`usePackingSession` 三处 + `containerCompare` 的 what-if），无任何视图重算 `PackingResult`。
- **分层语义**：`buildPackingLayers` / `assignDepthLayers` 只被 `finalizePackingResult` 消费，组件只读 `box.physicalLayer`；`b0aeffa` 把水平深度波与垂直支撑彻底分开，`layers.ts:15` 注释记录了历史故障。
- **纯核 + 薄壳分层**：`packingSession.ts` / `manualPlacementSession.ts` 是纯 reducer，对应 hook 是唯一 importer。
- **workStep 拓扑序**：`finalizePackingResult.ts:85-142` 是标准 Kahn，`:129-136` 对环图显式抛 `Cyclic support graph`。
- **独立业务预言机**：`packingInvariants.test.ts:91-104` 用纯几何重算 `supportedBy`；`:174-178` 把一次真实假绿的量级（**1,129 条反向边**）写进注释；`:301-316` 独立硬编码五个夹具的 placed/total 精确值 —— 这条不受 golden 重生成影响，是数量回退的真实防线。**这是全仓最有价值的测试资产。**
- **块引擎 gate 表**：`packing.blockEngine.test.ts:127-152` 的 15 例覆盖四种 loadingMode、99/100 边界、`maxStackLayers` 的 undefined/0/3/4/NaN/±Infinity、groundOnly×stackable 组合，每例带失败标签。`6c4576f` 又修正了 one-SKU 用例与总量门槛的耦合。
- **契约双端强制**：`server/historyRoutes.mjs:27-30` 读取时也跑 `assertValidHistoryPlanData`，库里脏数据会 500 而不是喂给前端渲染。
- **鉴权中间件**：`middleware.mjs:33` 指定 algorithms 防算法混淆、`:36-44` 每请求回查用户状态、`:47-52` 用 `password_changed_at` 使改密后旧 token 失效、`:8-12` JWT_SECRET fail-fast；`index.mjs:18` 只信 loopback 代理使 XFF 不可伪造；`:536-538` 未知 `/api/*` 返回 404 而非 SPA fallback。
- **SQL 与隔离**：全部参数绑定，唯一动态 SQL 拼的是占位符；所有用户级路由 WHERE 带 `user_id`，DELETE 先做归属校验。
- **读取失败一律冒泡**：三个 hook 统一 `setLoadFailed(true)` 而非 `setItems([])`，`HistoryPage.tsx:72` 显式区分「加载失败」与「暂无数据」并 disable 相关控件。
- **卫生指标**：`src/` + `server/` 的 TODO/FIXME/HACK 只有 3 条带解释的 eslint-disable，非测试代码 `any` 为 **0**，无孤儿模块，localStorage 只剩 6 类本地偏好。
- **把事故变成守卫**：`frontendBenchmark.mjs:271-278` 的 `newBaselineRefusal` 错误文案直接写明「a missing baseline bypasses every hard gate」，堵住了删基线绕过全部门禁的历史漏洞。
- **证据分级方法论**：`issues/0802/analysis.md` 的三级证据体系、主动把 rotation gizmo 降级为「候选缺陷」、明确标注 873/842/855 是已删除 worktree 的历史数值不可作验收阈值。
- **失败记录诚实**：`7966204` 把 CHANGELOG 两个标题从「完成」改为「部分完成」并逐条点到 file:line；`d442e7b` 完整记录了两次回滚与一次真实数据事故，没有粉饰。

---

## 审查后的状态变化（`39134d8` 之后）

审查期间 Codex 完成了两个提交，改变了部分前提：

**`6c4576f test(packing): isolate block route gate boundaries`**
- 修正 gate 测试中 one-SKU 用例与 `<100` 总量门槛的耦合（原 `items.slice(0,1)` 同时违反两个条件）。
- 完成完整本地 release gate：`lint` 通过；`npm test` **91 files / 792 tests** + **2 files / 7 tests** 零失败零跳过；`build` 通过；`test:e2e` **125/125** 零失败零跳过。
- `benchmark` 首轮三个 p95 timing gate 返回非零，**未修改 baseline/threshold/iterations/case/断言**后重跑通过且 timing comparable，首轮失败保留在 `decision.md`。这个处理方式符合仓库规则。
- **关闭本文 m16 的一半**：`decision.md` 已提交，本轮门禁证据不再只存在于工作区。

**`d442e7b docs(deploy): record 0802 rollback evidence`**
- 两次生产部署**均已回滚**，当前生产运行本次修复前的 release。**0802 修复没有留在生产** —— 用户报的「860 装不完」与「手动方向混摆」在生产上仍然存在。
- 远程 E2E 两次均未通过：**124/125** 与 **123/125**。失败为既有手动历史用例（React DOM 持续 detach）与一次登录后卡在「工作台加载中…」超 5 秒。回滚后 focused 重跑各 1/1，说明是 full-suite / 远端时序问题，不是功能坏了。
- **一次真实数据事故**：第一次按计划原始 rollback 命令 `rsync -a --delete "$backup/server"/ /opt/cargo-server/server/` 执行，而 deploy backup 的 `server/` 只含 `.mjs`、**不含 SQLite `database.db`**，导致 **475,136 字节**的 live 库（SHA-256 `76c21bbf…`）被删除，服务重建 **65,536 字节**空库（`6bb13149…`）。立即从 incident `/root/cargo_project-incident-20260804-163753` 恢复并验证原 hash。第二次改用排除 `database.db` 的安全 rollback。最终 `PRAGMA quick_check` 返回 `ok`。
- **修正只存在于文档**：`decision.md` 记录了「后续 rollback 必须 `--exclude=database.db`」，但架构师核对 `scripts/deploy.mjs` 后确认脚本本身未改动。需澄清的是：`:262` 的 `rsync -a --delete` 同步的是 `stagingDir → /usr/share/nginx/html`（纯静态），**删库的不是这一行**；缺陷在 rollback 路径，而 rollback 当前没有脚本化，只以文档形式存在。

这两条使执行顺序需要重排：生产数据保护与用户原始问题的优先级高于本文任何架构条目。详见 `plans/2026-08-04-*.md`。

---

## 本轮未取证的项

严格只读约束下以下未执行，**不得把本文任何结论当作运行时已验证**：

- 未运行 `npm run lint` / `npm test` / `npm run build` / `npm run test:e2e` / `npm run benchmark`（`6c4576f` 的门禁数据来自 Codex 的记录，非架构师复跑）。
- 未探测生产（未 curl 登录、未 ssh 读 env），B-1 的生产存在性由仓库内 E2E 记录间接证明。
- 未构造任何 fixture 验证 M-1 / M-2 / M-3 的实际装箱数差值。
- 未在浏览器中确认 M-6 的用户可观测表现、M-8 的视觉漂移、C1 的柜型陈旧表现。
- 未验证 `three` chunk 的实际体积（m23）。
- rotation gizmo 仍是未验证候选，不在本轮范围。
