# 计划：根治贪心碎片化 — 两阶段全局 best-fit 装箱引擎

来源：2026/06/30 深入探究。用户拍板「修好贪心模式碎片化 = 根本解决之道」。
承接 `plans/2026-06-29-loading-priority-and-packing-fill.md`（子任务1 类型已由 Codex 完成 `2e40f1f`；子任务2 首版 `15b1553` 有缺陷，本计划**取代**其算法部分）。
根因与受控实验见 `decision.md`「2026-06-30」。

## 已决策（与用户确认）

1. **根本解法层次 = 层次1+3**：让装箱走全局 best-fit-decreasing（复用现有 volume 循环机制），并叠加「大件铺底 + 小件全局填充」两阶段。**不做**层次2（重写最大空区/Guillotine 空间模型，留未来选项）。
2. **目标函数优先级 = 整托（first）必装 → 再最大化件数**（不是纯最大化体积）。

## 受控实验依据（真实 0629 数据，见 decision.md）

- quantity 逐类顺序贪心：A 只装 2/10（C 172 先装碎片化空间）。
- volume 全局 best-fit：A 装 7/10（证明全局择优能救大件）。
- 优先级 input（A 先放）：A 装 10/10（证明大件先占地是最强杠杆）。
- 2×2 受控：默认 quantity 掉 5.4% 纯由 0.8→0.5 阈值造成，且恰好=少一托 A；机制=0.5 让堆叠箱改变极值点、柜尾地面碎片化挤掉第二托 A。**阈值方向是模式相关的**（volume 下 0.5 反而 +1.1%）。

## 根因（file:line，已定位）

- **R-A 逐条顺序贪心**：非 volume 路径 `packing.ts:901-944` 按排序数组逐条 `bestPlacement`，先装的小件（C 172）污染极值点，大件（A）轮到时只剩碎片。这是碎片化主因。
- **R-B 排序把小件排前**：`packing.ts:695-699` quantity 模式 stackCapacity 打平后按数量降序 → C>D>A>B。
- **R-C C=0 bug**：`reserveTopPassengerStackSlot`（`packing.ts:917-921`「顶部乘客预留高度」）与优先级交互，quantity+优先级下把 C 全判 no-space（实测 C 172 全 unplaced）。
- **R-D 极值点碎片**：`placeEntry:818-826` 只派生 3 后继点，不追踪最大空区（层次2 才根治，本轮不动，靠两阶段+托顶点缓解）。

---

## 子任务顺序：1(引擎重构) → 2(阈值复测) → 3(录入UI) → 4(导入贯穿) → 5(回归收口)

子任务 3/4 与旧计划一致（Codex 已部分完成，见 `977988b`），本计划重点是子任务 1、2。

---

## 子任务 1：装箱引擎重构 — 两阶段全局 best-fit（核心）

- **根因**：R-A / R-B / R-C。
- **意图**：把非 volume 路径的「逐条顺序贪心」改造为「**按优先级分两阶段，每阶段用全局 best-fit-decreasing**」：
  1. **两阶段硬分割**：先放完所有 `loadingPriority==='first'` 的货物（整托），再放 `'normal'`（散货）。first 阶段结束后其占位固定，normal 阶段在剩余空间（含**整托顶面 + 缝隙**候选点）填充。缺省无优先级时全部视为同一阶段。
  2. **阶段内全局 best-fit**：复用 volume 路径（`packing.ts:830-886`）的「每步在所有剩余 entry × 朝向 × 候选点中择全局最优」机制，替代逐条顺序。大件在其阶段内公平竞争落点，不被同阶段小件提前碎片化。
  3. **目标函数 = 整托必装 → 最大化件数**：first 阶段用现有评分把整托紧凑铺底（聚拢以便顶面连成平台）；normal 阶段的择优应**偏好紧密填充、最大化可装小件数**（倾向：优先消耗零碎空间、避免大块空区被小件切碎；具体权重实现时调，以「用例2 件数」为准）。
  4. **候选点集**：normal 阶段候选点 = `extremePoints` ∪ `topSurfacePoints(placed, item)`（托顶网格）∪ 缝隙点。放开当前 `canUseTopSurfacePoints` 的 `!== 'first'` 限制歧义，明确为「normal 阶段所有可堆叠非 groundOnly 货物都可用托顶点」。
  5. **删除 C=0 bug**：移除或修正 `reserveTopPassengerStackSlot`/`minPendingTopPassengerHeights`「顶部乘客预留」逻辑（R-C）。两阶段模型下「给不可堆叠小件预留顶部」的原意应由 normal 阶段的择优自然实现，不需硬预留把 C 挡死。若确需保留某种顶部预留，须证明不再全挡 C（用例3 守门）。
- **边界**：
  - **不改** `canPlace` 的重叠/越界/`respectsMaxStackLayers` 判定本身、不改 `supportDetails`、`orientations()`、分层 `layers.ts`、`stackCapacity.ts`。
  - **不重写空间模型**（R-D 层次2 不做）；极值点+托顶点组合是本轮上限。
  - volume 模式**保持现状**（已是全局 best-fit）；本轮把 quantity（默认）改为两阶段全局 best-fit。weight/input 模式：**input 保留顺序语义**（用户手排），但仍应用两阶段优先级分割（first 先于 normal，组内按 input 顺序）；weight 决策实现时定（倾向保留重货优先 + 两阶段）。四模式行为在计划评审时逐一确认。
  - 优先级是排序/分阶段依据，**非硬过滤**：first 货物放不下仍 markUnplaced，不阻塞 normal。
- **模块**：`src/lib/packing.ts`（重构 `calculatePacking` 放置主体；抽出可复用的「全局 best-fit 单步选择」helper 供两阶段调用；删预留逻辑）。
- **验证标准（硬门槛，新增 `packing.priority.test.ts` 或扩充 `packing.test.ts`）**：
  - **用例1 整托必装**（0629：A/B 设 first）：断言 `placed` 含 A×10 + B×1 全部；`unplaced` 无 A/B。（当前 quantity 实现 A 只 2、且 C=0，会 RED）。
  - **用例2 最大化件数**（同上）：断言 first 阶段后 normal 散货 C+D 的 placed 数 **≥ 纯 input 基线 72 且显著高于当前 quantity 优先级实现（C=0）**。给可断言下界（如 C+D ≥ 150），实现后按实测收紧。这条编码「整托必装后尽量多塞小件」的核心业务意图。
  - **用例3 C=0 bug 根除**：0629 + A/B first + C/D normal，断言 **C 的 placed > 0**（理想 C+D 尽量满）；无 `reserve` 逻辑残留把 C 全挡。
  - **用例4 groundOnly 尊重**：C 设 groundOnly → 断言无 C 箱 z>0，A 顶不出现 C。
  - **用例5 无优先级不退化**：0629 全部 normal（无 first），断言 `placed.length` 与 `volumeUtilization` **不低于**改造前 quantity 基线（274 件 / 77.1%）。守「默认用户不设优先级也不变差」。
  - **用例6 优先级非硬过滤**：构造 first 超尺寸放不下 → normal 仍正常放置。
  - **防回归**：`packing.test.ts`(884行)/`packing.stackfill.test.ts`/`packing.31pallet.test.ts` 全绿。**若某些既有 quantity 断言因引擎升级而结果变化**，逐条判断是「合理改善」还是「破坏不变量」：前者更新断言并在 decision.md 记录，后者视为回归必须修。**不为通过而弱化断言**。

## 子任务 2：支撑阈值复测（0.8 vs 0.5，在新引擎下重新决策）

- **根因**：旧决策「全局改 0.5」基于旧贪心引擎的观测；受控实验已证 0.5 的副作用源于顺序贪心碎片化。新引擎（全局 best-fit）下 0.5 的影响需**重新测量**，不沿用旧结论。
- **意图**：在子任务1 新引擎落地后，用 0629 数据实测 0.8 vs 0.5（四模式）。若新引擎下 0.5 不再掉件数（碎片化已根治），则采纳 0.5 并与手动侧 0.5 对齐（消除自动/手动割裂）；若仍有副作用，保持 0.8 或按模式区分。**用数据定，不拍脑袋**。
- **边界**：只调 `canPlace:252` 阈值常量；不再动引擎。
- **验证标准**：新增「阈值对照」测试记录 0.8/0.5 在新引擎下的 placed/util；决策与实测数值写入 decision.md。采纳值须通过用例1/2/5。

## 子任务 3：录入表单 UI（优先级下拉 + 必须落地勾选框）

- 与旧计划 `2026-06-29` 子任务3 一致：三处表单（主 3512、编辑 4472、货物库 2842）加「装载优先级」下拉 + 「必须落地」勾选框，写入 `loadingPriority`/`groundOnly`；`emptyForm` 补默认。中英文 `t.*` key。
- **验证**：E2E 录入 first+必落地 → 计算后该货优先装入且全落地。

## 子任务 4：贯穿 Excel 导入 + 历史方案

- Codex 已部分完成（`977988b` carry loading priority and ground-only fields）。核对：`importCargo.ts` 别名/解析、`TEMPLATE_MAPPING_FIELDS`、`ImportMappingForm` FIELD_KEYS、后端 `TEMPLATE_FIELDS`/`parseTemplatePayload` 是否都含两字段；历史 JSON 透传（免改 schema）。
- **验证**：`importCargo.test.ts` 解析新字段；旧方案还原不报错。

## 子任务 5：回归收口

- `npm run lint && npm test && npm run build` 全绿；UI/导入 `npm run test:e2e` 全绿。失败先记 decision.md，不弱化断言。

---

## 必跑验证
- 每子任务：`npm run lint && npm test && npm run build`。
- 子任务 3/4/5：额外 `npm run test:e2e`。
- 0629 真实数据为算法验收夹具：整托全装 + 散货件数显著高于旧实现 + 无优先级不退化。

## 风险与回归门槛
- **子任务1 重构装箱主循环，是最高风险改动**，影响所有非 volume 装箱。`packing.test.ts`/`stackfill`/`31pallet` 全绿是硬门槛；四模式逐一验证；既有断言变化须逐条判定改善 vs 破坏。
- 抽「全局 best-fit 单步」helper 时须保证 volume 模式行为不变（volume 现有测试守门）。
- 删除 `reserveTopPassengerStackSlot` 可能影响「不可堆叠小件坐顶」场景 —— stackfill 测试 + 用例4 守门；若确有回归，改为两阶段内的择优实现而非硬预留。
- 目标函数「最大化件数」与 volume 的「最大化体积」不同，normal 阶段评分需专门验证（用例2）；避免退化成 volume 那样牺牲小件数。
- 阈值决策推迟到子任务2 按新引擎实测，不在子任务1 里混入阈值变量（保持可归因）。
