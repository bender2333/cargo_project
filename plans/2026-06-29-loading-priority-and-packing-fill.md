# 计划：自动装箱装载优先级 + 落点算法增强（整托优先铺底 + 散货填托顶/缝隙）

来源：2026/06/29「装柜软件问题汇总」马来20GP 测试。真实数据 `test-data/json/0629/cargo-debug-snapshot*.json`。
根因与实验数据见 `decision.md`「2026-06-29 第39轮」。本轮聚焦**自动装箱正确性 + 利用率**（问题汇总测试1 + 测试2①叠放）。测试2 的旋转入口/批量对齐/超限可见性**不在本轮**，另起轮次。

## 已决策（与用户确认）

1. **装载优先级模型 = 枚举两档「先装 / 普通」**（货物级字段）。
2. **「必须落地」= 录入表单加勾选框**，写入已有的 `CargoItem.groundOnly`。
3. 两个新字段**贯穿 Excel 导入 + 历史方案**（历史是 JSON 透传，免改 schema；导入需补字段链路）。
4. 取舍 = **整托（高优先级）必装优先，算法尽量用增强后的托顶/缝隙填充把散货塞满**；即使个别场景总利用率略低于「散货优先」也接受，因为整托是必发货。

## 实验依据（已用真实数据 calculatePacking 验证，见 decision.md）

- 当前默认（散货先装）：274 件 util 77.1%，但**整托 A 只装 2/10，剩 8 托 + B 全 unplaced**。
- 整托优先（input 模式）：A 10/10 + B 全装，但散货仅 C61+D11，总 83 件 → **散货没填满托顶与缝隙**。
- 仅整托：util **仅 58%**，托顶 640mm 全空 → 证明落点算法不会主动利用可堆叠货物的顶面。

## 根因（file:line，已定位）

- **R1 排序无优先级**：`packing.ts:688-702` 排序键只有 stackCapacity/数量/体积/weight，无货物优先级，整托被散货挤掉。
- **R2 托顶落点对可堆叠货物关闭**：`topSurfacePoints`（`packing.ts:450`）能枚举箱顶网格落点，但只在 `bestPlacement:441` 和 retry `:888` 调用，**两处都要求 `stackCapacity===1`**。A/B/C/D 全是 ∞，永不触发。
- **R3 极值点种子不足**：`placeEntry`（`packing.ts:764-772`）只生成箱自身 3 个极值点，大托盘顶面纵深区域无落点。
- **R4 groundOnly 未进导入/录入 UI**：算法已尊重 `groundOnly`（`packing.ts:182` `respectsMaxStackLayers`），但录入表单无勾选框、`importCargo.ts` 不解析它。

---

## 子任务顺序：1 → 2 → 3 → 4 → 5。每个单独 commit。

子任务 1（数据模型）是地基；2（算法排序+填充）是核心；3（录入 UI）、4（导入贯穿）、5（回归收口）。

---

## 子任务 1：数据模型 — 新增 loadingPriority 字段

- **意图**：`CargoItem` 增 `loadingPriority?: 'first' | 'normal'`（缺省视为 `'normal'`）。`groundOnly` 字段已存在，本子任务只补 `loadingPriority`。
- **边界**：只改 `src/types.ts` 的 `CargoItem`（:14-28）与 `PlacedBox`（:30+，供导出/快照透传，可选）。不改算法、不改 UI。`CargoForm = Omit<CargoItem,'id'>`（Workbench.tsx:765）自动获得新字段。
- **模块**：`src/types.ts`。
- **验证标准**：类型编译通过（`npm run build`）；不破坏现有测试。无独立单测（纯类型）。

## 子任务 2：装箱算法 — 优先级排序 + 可堆叠货物托顶/缝隙填充（核心）

- **根因**：R1 / R2 / R3。
- **意图**：
  1. **优先级排序**：在 `calculatePacking` 的 `.sort()`（`packing.ts:688`）**最高优先键**插入 `loadingPriority`（`first` 先于 `normal`）。四种 loadingMode（input/weight/quantity/volume）都要在各自比较器最前面加这一层。`input` 模式语义特殊（按录入顺序），优先级在其之上：先按 first/normal 分组，组内再按 itemIndex。
  2. **放开托顶填充**：让**可堆叠货物**（`stackCapacity > 1`）在常规放置后，也能用 `topSurfacePoints` 枚举的箱顶网格落点填充。具体做法（择一，实现时定）：
     - 方案A（小改）：no-space retry 段（`packing.ts:888-910`）的过滤条件从 `stackCapacity===1` 放宽到「stackCapacity===1 或 该货物 loadingPriority!=='first' 且仍有剩余空间」，让普通散货在整托铺完后走托顶重试。
     - 方案B（更彻底）：在主放置循环把 `topSurfacePoints(placed, item)` 并入候选点集（`extremePoints` ∪ 托顶点），由 `placementScore` 统一择优。风险更高，需保证不退化现有 stackfill 测试。
     - **倾向方案A**：影响面小、可控，先验证利用率提升幅度，不够再考虑 B。
  3. **缝隙种子补强（R3，可选降级项）**：`placeEntry` 放置大箱（footprint 显著大于候选货物）时，为其顶面补种网格落点。若方案A已让 0629 数据达标，此项可降级到下一轮，避免一次改太多。
- **边界**：
  - **不改** `canPlace`（:230）的重叠/越界/几何判定本身、不改 `supportDetails`、不改 `orientations()`、不改 `respectsMaxStackLayers`、不改分层 `layers.ts`。
  - `support.supportRatio` 阈值（`canPlace:246`）**本轮 0.8 → 0.5**（与手动侧 `minSupportRatio` 0.5 对齐，详见 decision.md「2026-06-29 第39轮补充」）。须新增「0.5 下整托优先填充量 > 0.8 基线 83 件」可断言用例，并回填 0.5 实测数据到 decision.md。悬挑稳定性下降是已知权衡，与手动侧现状一致。
  - 优先级是**排序键**，不是硬过滤：`first` 货物放不下仍照常 markUnplaced（no-space），不因优先级跳过其它货物。
- **模块**：`src/lib/packing.ts`（排序 + bestPlacement/retry 调用条件）。
- **验证标准（硬门槛，新增到 `packing.test.ts` 或新建 `packing.priority.test.ts`）**：
  - **用例1 整托优先必装**（0629 真实数据 A/B/C/D）：设 A.loadingPriority='first'、B='first' → 断言 `placed` 含 **A×10 + B×1 全部**（当前实现 A 只装 2，会 RED）。
  - **用例2 散货填托顶**（同数据）：整托优先后，断言散货 C+D 的 placed 数 **显著高于纯 input 模式的 72 件**（目标：尽量逼近散货可装上限；给可断言下界如 ≥ 150，实现后按实测收紧）。这条直接编码「尽量填满」的业务意图。
  - **用例3 不退化利用率**：0629 数据，断言整托优先方案 `volumeUtilization` **不低于**整托优先 input 基线 77.1%；且 `placed.length` 不低于纯 input 的 83。
  - **用例4 优先级非硬过滤兜底**：构造 first 货物超尺寸放不下的场景 → 断言其余 normal 货物仍正常放置（不被 first 阻塞）。
  - **用例5 groundOnly 尊重**：C 设 groundOnly=true → 断言**没有任何 C 箱的 z>0**（全部落地），且整托 A 顶上不出现 C。
  - **防回归**：`packing.test.ts`(884行) / `packing.stackfill.test.ts` / `packing.31pallet.test.ts` 全绿。四种 loadingMode 各跑一遍优先级排序断言。

## 子任务 3：录入表单 UI — 优先级下拉 + 必须落地勾选框（三处表单）

- **根因**：R4 + 无优先级录入。
- **意图**：三处货物表单各加两个控件：①「装载优先级」下拉（先装/普通）②「必须落地」勾选框（写 groundOnly）。
  - 主表单 `form`（Workbench.tsx:3512-3541，在 canRotate/stackable 区域 3526-3527 旁）
  - 编辑表单 `editForm`（:4472-4498，4486-4487 旁）
  - 货物库表单 `cargoLibraryForm`（:2842-2852，2849-2850 旁）
  - 三处的构建函数 `addCargo`(:1936)、`saveEditedCargo`(:1973)、货物库提交，把两字段写入 CargoItem。
  - `emptyForm`（:836-848）补默认 `loadingPriority:'normal'`、`groundOnly:false`。
- **边界**：新增中英文 `t.*` key（loadingPriority/loadingFirst/loadingNormal/groundOnly），沿用现有 `t` 对象风格；不新造重复 key。货物列表展示行（如 :2876）可顺带显示优先级/落地标记（轻量，可选）。
- **模块**：`src/Workbench.tsx`。
- **验证标准**：
  - E2E（`npm run test:e2e`）：录入一件货设「先装」+「必须落地」→ 计算 → 该货全部落地 z=0 且优先装入。
  - 组件层：表单提交后 CargoItem 含正确 loadingPriority/groundOnly。
  - 编辑已有货物改优先级 → 重算结果变化。

## 子任务 4：贯穿 Excel 导入 + 历史方案

- **意图**：让 loadingPriority、groundOnly 可从 Excel 导入，并随历史方案保存/还原。
  - **导入解析**（`importCargo.ts`）：`fields` 别名表（:85-100）加 `groundOnly`（别名：'groundOnly','必须落地','落地','不可上托','不可堆叠在上'）与 `loadingPriority`（别名：'loadingPriority','装载优先级','优先级','先装'）；`parseCargoRows` 字段映射（:247-286）解析二者（groundOnly 用 `boolValue` 默认 false；loadingPriority 文本归一到 first/normal）。
  - **模板字段**：`TEMPLATE_MAPPING_FIELDS`（Workbench.tsx:98）、`FIELD_KEYS`（ImportMappingForm.tsx:65-77）、后端 `TEMPLATE_FIELDS`（server/index.mjs:253）、`parseTemplatePayload` 默认值清洗（:284-291）各加两字段；ImportMappingForm 标签类型与文案补 key。
  - **历史方案**：JSON 透传，**无需改 server schema**（已确认 `data` 整体序列化，`cargoItems` 数组自动带新字段）。仅验证旧方案加载时新字段缺省不报错。
- **边界**：不改后端 history schema；custom_containers/custom_cargo 的 `ground_only` 列**本轮不加**（自定义货物库走前端 state + 现有 JSON，确认是否需要后端列；若 customCargo 走后端独立表则记 decision.md 评估）。不改解析单位换算、合并尺寸逻辑。
- **模块**：`src/lib/importCargo.ts`、`src/Workbench.tsx`、`src/components/ImportMappingForm.tsx`、`server/index.mjs`、`server/db.mjs`（仅在确需 ground_only 列时）。
- **验证标准**：
  - 单测（`importCargo.test.ts`）：含「必须落地=是 / 优先级=先装」列的行 → 解析出 groundOnly=true、loadingPriority='first'；缺列 → 缺省 normal/false。
  - 单测（`historyPlans.test.ts` 或等价）：保存含新字段的方案 → 还原后字段一致；旧方案（无字段）还原不报错。
  - E2E：用 0629 等价 Excel（带优先级/落地列）导入 → 字段正确进入货物清单。

## 子任务 5：回归收口

- **意图**：跑全量验证，清理本轮孤儿。
- **验证标准**：`npm run lint && npm test && npm run build` 全绿；UI/导入相关 `npm run test:e2e` 全绿。失败先记 `decision.md`，**不削弱断言**。

---

## 必跑验证
- 每子任务：`npm run lint && npm test && npm run build`。
- 子任务 3/4/5（UI/导入）：额外 `npm run test:e2e`。
- 0629 真实数据作为算法验收夹具：整托优先后 A/B 全装 + 散货填充量显著高于 input 基线 72 件。失败先记 decision.md，不削弱断言。

## 风险与回归门槛
- 子任务 2 改装箱核心，影响所有装箱路径 —— `packing.test.ts` / `stackfill` / `31pallet` 全绿是硬门槛；四种 loadingMode 都要覆盖优先级排序。
- 托顶填充放宽可能让普通货物过度上堆、或退化现有 stackfill 行为 —— 用例3「不退化利用率」+ 现有 stackfill 测试守门。优先用方案A（小改 retry 条件），不够再评估方案B。
- 优先级误设成硬过滤会让 normal 货物饿死 —— 用例4 专守。
- 支撑阈值 0.8→0.5 影响**所有**自动装箱结果（不止 0629）：放宽后箱体可悬挑一半，须靠 `packing.test.ts`/`stackfill`/`31pallet` 全绿守稳定性回归；新增「0.5 填充量 > 0.8 基线」用例量化收益。这是与手动侧对齐的决策，不是临时降阈值。
- 自定义货物库后端是否需 ground_only 列待子任务4确认，避免静默丢字段（fail loudly）。
