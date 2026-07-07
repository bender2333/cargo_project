# Decision Log

## 2026-07-07 EMS 子任务构建门禁：暂不修复既有 `loadingPriority` 类型缺口

- 背景：子任务 2（EMS 空间模型）完成后运行 `npm run build`，TypeScript 在 `src/components/ImportMappingForm.tsx`、`src/lib/importCargo.ts`、`src/lib/packing.ts`、`src/Workbench.tsx` 等处报错：`loadingPriority` 不存在于 `CargoItem` / `PlacedBox` / `ImportTemplateDefaults`。
- 选项：A. 在本轮恢复 `src/types.ts` 的 `loadingPriority` 类型；B. 遵守块构建计划提醒，本轮不碰 `loadingPriority` 残留，只记录门禁状态。
- 决策：选择 B。当前 `src/types.ts` 的 `loadingPriority` 删除是进入本轮前已有的未提交改动，且任务说明明确要求本轮不要动该字段，避免混入两套 churn。
- 影响：`npm run lint` 与 `npm test` 已通过，但 `npm run build` 在既有类型不一致处失败；EMS 子任务本身的 focused test 通过。
- 后续：后续轮次需要先恢复或统一清理 `loadingPriority` 类型契约，再重新跑完整 `lint && test && build`。


## 2026-07-07（下午）算法调研 + 方向修订：主引擎改用「块构建（block-building）+ EMS 最合身放置 + FB 树搜索」

> 状态：文献调研 + 根因再定位（用真实 debug snapshot 坐实）+ 方向决策（与用户拍板）。计划见 `plans/2026-07-07-block-building-engine.md`。**取代**同日上午的「纯 EMS 重写空间模型」定向（`plans/2026-07-07-ems-space-model.md` 作废/降级为底座）。

### 根因再定位（用真实 snapshot 坐实，推翻上午的两次误判）
- 数据来源：用户界面导出 `cargo-debug-snapshot (15).json`（**20GP 柜 5758×2352×2385**，quantity 模式，placed=443/864）。
- 体素分析（V=50mm）逐格判定：
  - **内部被困缝（上方压箱）仅 0.1%**——箱子横向挤得很实，无夹心缝。上午「R-D 内部夹心缝」判断**错误**。
  - **左右/前后被两列夹住的竖缝仅 2.9%**——缝不在两列正中间。
  - **各高度层占用率从 z=0 到 z=2150 稳定在 87%（均匀缺 13%）**，只有 z>2200 才因天花板留白骤降。→ 缝是**从柜底贯穿到柜顶的竖直空隙**，位置固定，正是用户目视看到的「塔柱间沟槽」。
- 地面俯视图坐实（真·根因）：**多 SKU 尺寸拼不齐 + 逐箱贪心顺序铺 → 层内二维排布留下固定位置的空洞 → 该图案层层复制叠成贯穿竖缝**。
  - 柜宽 2352 除各 SKU 排宽都有余料：305×7=2135 剩217；365×6=2190 剩162；400×5=2000 剩352。不同 SKU 排宽不一，交界处凑出锯齿空洞（典型：y=700~1150、x≈2900~3900 一大片空）。
  - 地面空格率 12.7%，与体素「每层缺 13%」吻合。

### 算法调研结论（谱系与选型，见本条末 Sources）
- **单件放置**（极值点/角点、EMS 最大空区）：一次放一个箱，util 80~85%。**无法根治列错位**——错位是逐箱贪心的必然产物。EMS 只解决「候选位置可见」，不换「一次一个箱」策略。
- **墙/层构建**（wall/layer-building）：util 85~88%。
- **块构建（block-building，Eley 2002；FB 树搜索 Fanslau-Bortfeldt 2010）**：先把**相同箱拼成规整长方体「块」**（块内零缝、支撑100%），再以块为单位摆放 / 树搜索选块。标准 BR 测试集 util **90~95%**，是公开确定性方法的最高水平。
- **元启发（GA/TS/ACO）**：88~93% 但随机、慢、难解释。
- **深度强化学习 RL**：近年热，但几乎都针对**在线**装箱与机器人码垛；本项目是**离线**（全货已知），RL 不稳定、难解释、难保证支撑约束——**用错工具，不采用**。
- **关键匹配**：本数据每个 SKU 都有大量完全相同的箱（TB-C10×126、TB-C13×131、TF-A01×68…），正是块构建被发明来解决的场景。块尺寸是箱尺寸整数倍→更易对齐拼接，把散落锯齿边料集中化，从机制上断掉「每 SKU 独立成列→交界锯齿→贯穿缝」因果链。

### 方向决策（与用户两轮确认）
1. **主引擎 = 块构建 + EMS 最合身放置 + FB 树搜索前瞻**（用户选「激进」档）。EMS 空间模型不废弃，降级为块放置的**底座**（追踪空区、供块做 best-fit）。
2. **允许小件填块间边料**（用户选）：块之间不可避免的边料，允许用小件（如 B10 350×260、D 类奶嘴）插入填充——引入**局部混堆**。用户接受「同片区可非单一 SKU」以换利用率。卸货分拣代价用户已知晓。
3. **上午的纯 EMS 计划降级**：`plans/2026-07-07-ems-space-model.md` 的「EMS 作为唯一候选源、单件放置」定位作废；其 EMS 几何模块（`emsSpace.ts` 单测）仍有效，并入新计划作为块放置底座。

### 必须原样保留（契约，新引擎不可动）
- 几何门控 `canPlace`（`packing.ts:246-252`）：越界/重叠/支撑率≥0.5/`respectsMaxStackLayers`/`groundOnly` 落地。块摆放后每个箱仍须满足。
- 数据契约 `PackingResult` 全字段、`physicalLayer`、支撑链——下游 2D/3D/分层/明细/导出共享，不重算。
- `orientations` 朝向枚举、标签贯穿。

### 影响 / 风险
- 改动最大的一轮：主循环从「逐箱极值点贪心」重写为「组块→树搜索选块→EMS 放置→小件填缝」。churn 大。
- fixture 硬坐标断言几乎必然大面积变动——沿用「先冻结基线→逐条 diff→架构师裁决」纪律，不为过测试弱化断言。
- 树搜索深度/宽度需限，864 箱性能要实测（给上界，超则降级为贪心块放置）。
- 混堆填缝需在分层/明细/卸货视图如实呈现「该区非单一 SKU」，避免 fail-silently。

### 验收标准（20GP + snapshot 数据 / 40HQ + 越南十一批）
- 20GP 同数据：**装载包络内填充率显著 > 82.4% 基线**（下界 88%）；地面空格率 < 8%（基线 12.7%）；贯穿竖缝目视消除。
- 无重叠/越界/支撑违规（几何断言全绿）。
- fixture 差异逐条报告，无未经确认的断言弱化。

### Sources（调研）
- Bortfeldt & Wäscher, "Constraints in container loading – A state-of-the-art review"（CLP 综述）。
- Fanslau & Bortfeldt (2010), "A Tree Search Algorithm for Solving the Container Loading Problem", INFORMS J. Computing — https://pubsonline.informs.org/doi/pdf/10.1287/ijoc.1090.0338
- "The six elements to block-building approaches for the single container loading problem", Applied Intelligence 2013 — https://link.springer.com/doi/10.1007/s10489-012-0337-0
- Crainic et al. (2008), "Extreme Point-Based Heuristics for 3D Bin Packing" — https://www.researchgate.net/publication/220668799
- "Dynamic feedback algorithm based on spatial corner fitness for 3D MBSBPP", Complex & Intelligent Systems 2024 — https://link.springer.com/article/10.1007/s40747-024-01368-5
- 参考实现（layers + superitems）：https://github.com/Wadaboa/3d-bpp

---

## 2026-07-07（上午）纯散货列间缝隙根因 + 定向：重写空间模型（EMS 最大空长方体）

> 状态：**已被同日下午条目取代/降级**（根因经真实 snapshot 修正，主引擎改块构建）。保留作演进记录。计划见 `plans/2026-07-07-ems-space-model.md`。这是 06-30 计划里被推迟的「层次2（重写空间模型）」。

### 触发问题
用户用 `test-data/excel/越南第十一批6.2海运.xlsx` 测试，3D 视图列间仍有明显缝隙。

### 数据集事实（架构师实测，40HQ 柜，quantity 模式）
- **纯散货、24 个 SKU、864 箱**，无整托。箱高高度离散共 9 种：210/250/310/320/360/380/385/435/510mm。
- 尺寸样例：530×305×310(×176)、530×305×360(×131)、580×365×435(×247,多个奶嘴SKU)、600×400×385(×158)、475×475×380(×30) 等。
- 实测：placed=825/864、util=76.5%、地面覆盖 84.1%、堆到 26 层、**装载包络内填充率仅 77.5%**（包络 22.5% 是空气）、各列顶面高度 min250/中位1500/max2690（极不齐）、朝向混排已基本消除（仅 1 SKU）。

### 根因（坐实，file:line）
- **R-D（极值点模型不追踪最大空区）**：`packing.ts:718,818` 用极值点（角点）作候选。`placeEntry` 放箱后只派生 3 个角点（`:821-823`），**不记录列顶台阶空间与列间窄缝**这些真实空区。
- 机制：不同高度 SKU 各堆成竖列 → 列顶参差（250~2690）→ 列间/列顶缝隙无候选点去填 → 包络内 22.5% 纯空气。
- 这与 06-29/06-30 计划针对的「整托 vs 散货优先级冲突」**是不同问题**——本数据无整托，双模式/全局 best-fit 对此不对症。朝向混排（06-12 计划）也已基本解决，非本轮病灶。

### 定向决策（与用户两轮确认）
1. **走「重写空间模型」根治**（用户否决「仅缝隙点缓解」）：采用 **EMS（Empty Maximal Space，空的最大长方体 / 差分空间法）**——维护柜内所有最大空长方体列表，放箱后切分相交 EMS、剔除被包含者；候选点 = 每个 EMS 的角。天然追踪列顶台阶 + 列间缝。
2. **彻底替换极值点模型**（用户选「替换」而非「并集」）：`extremePoints` / `topSurfacePoints` 候选生成整体换成 EMS 角点。追求更干净模型 + 更快单步。
3. **fixture 差异先报告再决定**（用户选）：重写会改变现有摆放，`packing.test.ts`/`31pallet`/`stackfill` 的硬坐标断言可能大面积破。**Codex 必须先冻结基线快照（重写前各 fixture 的件数/利用率/关键坐标），重写后逐条 diff 报给架构师**，由架构师判定改善 vs 破坏，再决定改断言。**不得为过测试而弱化断言或改测试用例**（CLAUDE.md 铁律）。

### 必须原样保留（新引擎不可动的契约）
- 几何门控 `canPlace`（`:246-252`）：越界/重叠/支撑率≥0.5/`respectsMaxStackLayers`/`groundOnly` 落地。
- 评分启发式 `placementScore`（`:281-405`）：防倾倒、同货同朝向承诺、标签朝门、贴边/贴邻 snap、同标签聚拢、同高堆叠。EMS 只换「候选点从哪来」，不换「怎么打分/能不能放」。
- 数据契约 `PackingResult` 全字段、`physicalLayer`、支撑链（下游 2D/3D/分层/明细/导出共享，不重算）。

### 影响 / 风险
- 改动集中在 `packing.ts` 候选点生成与主循环；`canPlace`/`placementScore` 尽量不动。
- 两条模式路径（volume 全局 best-fit / quantity 顺序贪心）都要切到 EMS 候选，保持各自排序语义。
- 性能：864 箱当前顺序贪心已需 ~1.8s（O(n²) canPlace 扫全部 placed）。EMS 候选点应显著少于全极值点集，需实测不劣化；必要时加空间索引，但不作为本轮硬门槛。
- loadingPriority 字段残留（63 处，`types.ts` 已手工删一半但未提交）与本轮解耦：**先不动**，避免混入两套 churn；本轮聚焦空间模型。若必要另起轮次清理。

### 验收标准（40HQ + 越南十一批数据）
- **装载包络内填充率显著 > 77.5%**（下界给 85%，实测收紧）；同一数据 util 不低于 76.5% 基线。
- 无重叠 / 无越界 / 支撑合规（几何断言全绿）。
- 现有 packing fixture 差异逐条报告，无未经架构师确认的断言弱化。

---

## 2026-06-30 方向修订：改用「双模式」，废弃 loadingPriority 字段

> 状态：定向+计划。计划见 `plans/2026-06-30-dual-mode-packing.md`（取代 06-29、06-30-greedy 两份计划的算法/优先级部分）。

### 背景
沿「装载优先级」方向推进后，用户与架构师意识到本质：**件数与容量是冲突的优化目标**，单一排序无法同时最优（实测：小件先=274件/77.1%但整托只1-2托；大件先=86件/78.6%但整托全装、散货只75/272）。用户遂改变方向：**用双模式让用户选目标**，而非用每件货的优先级标记。

### 决策（与用户多轮确认）
1. **双模式 = 复用现有 `loadingMode`**：数量优先(quantity)=小件先=最大化件数；体积优先(volume)=大件先=最大化利用率+整托自然全装。
2. **废弃 `loadingPriority` 字段**：与双模式是两套表达意图的机制，并存冲突（CLAUDE.md「暴露冲突别平均」）。回退 Codex `2e40f1f`（类型）/`977988b`（导入携带）中该字段部分。
3. **不引入「必装」硬约束**：靠选模式表达意图。用户明确接受「数量优先模式下整托不会优先装」——要整托全装就选体积优先。
4. **保留 `groundOnly`（必须落地）**：与优先级无关的独立约束（玻璃 C 不可上托），继续贯穿录入/导入。

### 影响
- 回退 Codex 已提交的 loadingPriority 相关工作（须保留 groundOnly）。
- 体积优先模式需从「全局 best-fit 只装7托」改为「大件优先保证整托全装」。
- 数量优先阈值回退 0.5→0.8（修受控实验证明的 5.4% 回归）。
- 散货填充增强（托顶/缝隙点）仍需要——决定体积优先能否整托全装后再多塞散货。
- 阈值 0.8/0.5 最终值推迟到填充增强后按模式实测。

### 废弃说明
- `plans/2026-06-29-loading-priority-and-packing-fill.md`、`plans/2026-06-30-greedy-defrag-global-bestfit.md` 的算法/优先级设计**作废**；`groundOnly` 与导入/UI 贯穿部分仍有效，并入新计划。

---

## 2026-06-30 深入探究：贪心碎片化根因 + 根本解法定向（两阶段全局 best-fit）

> 状态：仅探究+定向+计划。计划见 `plans/2026-06-30-greedy-defrag-global-bestfit.md`。用真实 0629 数据做了 2×2 受控实验（临时文件已清理，未入库）。

### 触发问题
用户问：阈值 0.8→0.5 后默认 quantity 模式利用率为何**不升反降**（77.1%→71.7%）。

### 2×2 受控实验（隔离「阈值」与「填充逻辑」两变量，同一 0629 数据）
- 方法：取子任务2前基线版本(`fab5227`)与当前版本 packing.ts，各做 0.8/0.5 阈值变体，跑同数据。
- quantity 模式：旧逻辑+0.8=77.1%(A2)、旧+0.5=71.7%(A1)、新+0.8=77.1%(A2)、新+0.5=71.7%(A1)。
- volume 模式：0.8=79.6% / 0.5=80.7%（0.5 反而更好）。
- **结论1**：默认模式下降 100% 由阈值 0.8→0.5 造成，与 Codex 新填充逻辑无关（同列新旧结果完全相同 → 填充逻辑在无优先级时未生效）。
- **结论2**：下降量 5.4% = 精确少装一托 A（A 单托占柜 5.38%），C/D 数量两阈值下不变。
- **结论3（机制）**：地面箱支撑恒 100%，阈值只影响堆叠箱 → 0.5 改变堆叠选择 → 派生不同极值点 → 柜尾地面被 D 碎片化（0.8 规整网格 x=3600/3875/4135/4410 留干净矩形放两托 A；0.5 碎成 x=3600/3800/3925/4125/4250 只塞进一托旋转 A）。
- **结论4**：阈值方向**模式相关**——quantity −5.4%、volume +1.1%。全局一刀切 0.5 非干净收益。

### 根因（贪心碎片化，file:line）
- R-A 非 volume 路径 `packing.ts:901-944` 逐条顺序贪心，先装小件污染极值点。
- R-B 排序 `:695-699` quantity 按数量降序把 C(172) 排在 A 前。
- R-C `reserveTopPassengerStackSlot`（:917-921）与优先级交互 → quantity+优先级下 C 172 全 unplaced（实测）。
- R-D 极值点 `placeEntry:818-826` 不追踪最大空区（层次2 才根治）。

### 定向决策（与用户确认）
- **根本解法 = 层次1+3**：装箱走全局 best-fit-decreasing（复用 volume 循环）+ 「大件铺底/小件全局填充」两阶段。不做层次2（重写空间模型）。
- **目标函数 = 整托(first)必装 → 再最大化件数**（非纯最大化体积）。
- **阈值决策推迟**：0.8 vs 0.5 在新引擎落地后重新实测再定（见新计划子任务2）。旧「全局改 0.5」结论**暂缓**，因其副作用源于将被根治的顺序贪心碎片化。
- 附带修复：子任务2 首版(`15b1553`)的 C=0 bug 由新引擎一并根除。

---

## 2026-06-29 第39轮补充：支撑阈值 0.8→0.5 决策 + 测试2 剩余项待办

### 决策：自动装箱支撑阈值 0.8 → 0.5

- 背景：用户要求把自动装箱的底面支撑阈值从 0.8 改 0.5，以增强托顶/缝隙填充。
- 根因/现状（已读码定位）：
  - 自动装箱阈值**硬编码**在 `packing.ts:246` `return support.supportRatio >= 0.8 && ...`，且 `packing.ts` **完全不读 `supportPolicy`/`placementSettings`**（grep 无 `supportPolicy` 引用）。
  - 手动侧用 `placementSettings.ts:33` `minSupportRatio: 0.5` 与 `manualPlacement.ts:75` `MIN_SUPPORT_OVERLAP_RATIO = 0.5`。
  - **即存在两套不一致阈值**：自动 0.8、手动 0.5。会出现"自动摆得下手动判违规"或反之的割裂（CLAUDE.md「暴露冲突，别平均」）。
- 决策：自动装箱 `canPlace` 阈值 **0.8 → 0.5**，与手动侧对齐。
- 取舍：
  - 收益：散货可骑整托边缘/两箱接缝，托顶与缝隙填充增强（直接服务本轮"尽量填满"目标）；自动/手动判定一致。
  - 风险：50% 支撑允许箱体悬挑一半，物理稳定性下降、3D 视觉出现明显悬空。属真实权衡，但与手动侧现状一致，不新增割裂。
- 量化基线（0.8，0629 真实数据实测）：整托优先 input 模式 = placed 83 / util 77.1%（A10+B1+C61+D11）；仅整托 util 58%。**0.5 的实测提升幅度未测**——因 Codex 正并发改 `packing.ts`，架构师不临时改算法测量，留作子任务由执行者在其分支实测并回填本条。
- 执行实测补充（2026-06-30）：按本决策改为 0.5 后，配合 loadingPriority 与普通货小体积优先填缝，0629 priority/quantity 结果为 placed 111 / util 76.19%，A10+B1+D100，散货 100 件；相比整托优先 input 基线的散货 72 件显著提升，但未达到计划草案里的 C+D ≥150。临时把 D 数量放大到 150 的上界探针也只到 D108（util 77.6%），说明 ≥150 需要更强二维铺排/回溯或更改业务约束，不作为本轮硬门槛。
- 影响面：改动影响**所有**自动装箱结果（不止 0629）。`packing.test.ts`/`stackfill`/`31pallet` 须全绿；新增"0.5 阈值下整托优先填充量 > 0.8 基线"的可断言用例。
- 并入：`plans/2026-06-29-loading-priority-and-packing-fill.md` 子任务2（原计划"0.8 本轮不动"的边界**作废**，改为本轮一并调 0.5）。

### 待办：测试2 剩余项（第一轮算法落地后另起轮次）

本轮（优先级+填充+阈值）聚焦自动装箱正确性。测试2 的手动交互问题留待后续：

1. **手动旋转入口缺失**：3D 仅能双击调 gizmo 再点箭头（`ContainerScene.tsx:1154/1120`），无旋转快捷键；2D 视图（`ManualPlacement2D.tsx`）完全无旋转入口。→ 补 2D 旋转按钮 + 3D 旋转快捷键（逻辑层 `rotateBox` 全套已就绪）。
2. **跨箱规批量对齐**：吸附 `snapEdges.ts`/`manualPlacementSnap.ts` 只对被拖单箱生效（`ContainerScene.tsx:1278`），无整体对齐。→ 新增跨箱规对齐能力。
3. **超限可见性兜底（fail loudly）**：`handleContinueManually`（`Workbench.tsx:1551`）转手动不重验证；`validateDraft` 只标红不剔除超限箱（`manualToPlacedBoxes` 全渲染）。切更小柜型后超限箱静默保留。→ 转手动/切柜型后明确提示并阻止导出，或提供自动归位。当前 0629 数据未触发，优先级最低。

---

## 2026-06-29 第39轮 Review：装柜排版"缝隙"与"超限"问题定位（基于真实 snapshot）

> 状态：仅根因定位，未实现。数据来自 `test-data/json/0629/`（4 个 cargo-debug-snapshot，对应"装柜软件问题汇总 6.29"马来20GP测试）。

### 数据集事实（4 个 snapshot 几何校验结果）

- 容器：20GP effective = 5900×2350×2380（gap 全 0）。
- 货物 4 类：A=1230×830×1740 ×10（料号 12308301740，整托）、B=1230×830×1350 ×1（12308301350，整托）、C=600×400×385 ×172（玻璃奶瓶礼盒，文档注明**不可上托**）、D=535×325×345 ×100（奶嘴，轻货可上托）。
- **关键：4 类货物全部 `stackable:true`、均未设 `maxStackLayers`、均未设 `groundOnly`**。即数据层没有表达"C 不可上托/玻璃只能码 N 层"。
- 几何校验（脚本断言）：**所有 snapshot 的最终提交状态 out-of-bounds=0、overlaps=0**。自动 274 箱 util 77.1%；手动 snapshot issues=[]、invalidBoxIds=[]。

### 测试1 根因：自动装箱"优先放散货"（已坐实）

- 自动结果（snapshot 2/3/4 一致）：placed = **C×172 + D×100 + A×2**；**A 剩 8 托 + B 1 托全部 unplaced（no-space）**。
- `physicalLayer` 分布显示 C/D 散货被堆到 **10–12 层**（385×6≈2310，顶满 2380），把柜内高度吃光，仅剩两托 A 挤在 x=4670 角落。
- 根因：`src/lib/packing.ts:695-699` `quantity` 模式排序首键 `stackCapacity` 降序；4 类货 maxStackLayers 全空 → `stackCapacity`=∞（`stackCapacity.ts:21-24`）全部相等 → 退到次键"数量降序"：C(172)>D(100)>A(10)>B(1)，**散货因数量多排在整托前先装**。算法**没有"整托/托盘优先铺底"的概念**。
- 决策方向（已与用户确认）：**增加可配置的装载优先级**（用户对每类货物设优先级/先装，而非系统猜）。

### 测试2 四个子问题根因

1. **叠放显示**：源于测试1。C（玻璃，应不可上托）数据里 `stackable:true` 且无 groundOnly，自动算法把 C/D 叠到 10+ 层，转手动后即视觉叠放。根因＝数据/约束层无法表达"C 不可上托"，且自动算法无整托优先。
2. **无法手动旋转**：3D 旋转**仅**能双击箱子调出 gizmo 再点箭头（`ContainerScene.tsx:1154 onDoubleClick`→`:1120`），键盘只有方向键移动/PageUp-Down 调高（`:1501-1518`），**无旋转快捷键**；2D 视图（`ManualPlacement2D.tsx`）**完全无旋转入口**。用户在 2D 或未发现双击时即"无法旋转"。
3. **超限/无限摆到边缘**：**复现数据的最终状态并无超限**（OOB=0）。拖拽路径有门控（`handleManualMoveBox` Workbench.tsx:1426 钳制 + `validateBox`；3D `computeInvalidByGeometry` ContainerScene.tsx:1071）。判断：用户看到的"超出箱体"是**拖拽过程中的瞬态预览**（ghost 跟随光标可超出柜壁），松手时被门控拒绝/钳回，但过程视觉上像"无限摆到边缘"。`handleContinueManually`（Workbench.tsx:1551）转手动时直接搬自动坐标、不重验证——若后续切换更小柜型，超限箱会被 `validateDraft` 标红但**仍保留在 draft 渲染**（`manualToPlacedBoxes` 不剔除 invalid）。这是 fail-loudly 隐患，但当前数据未触发。
4. **不同箱规无法对齐 + 边界交叉**：吸附 `snapEdges.ts`/`manualPlacementSnap.ts` **只对被拖的单个箱生效**（ContainerScene.tsx:1278），**无跨箱规批量对齐**。"边界交叉"同 #3，复现数据未出现真实交叉。

### 缝隙根因（用户强调的"排版缝隙"）

- snapshot 2 自动结果中 **label C 出现 WLH×162 + LWH×10 两种朝向混排**；D 在手动中 LWH/WLH/WHL 三种混排。
- 这正是 `plans/2026-06-12-template-and-packing-gap.md` 子任务1"同货物同朝向"想消除的行距交替留缝问题——说明该轮修复对本数据集**未完全生效**（仍有 10 箱 C 用了异朝向）。地面覆盖仅 86.2%，顶部余 70mm。

### 手动模式佐证用户期望

- snapshot 3/4 手动结果：用户**自己先把 10 个 A 整托规整铺在 z=0**（x=0,830,1660,2490…），再在托顶 z=1740 叠散货。即用户期望"先铺整托、再叠散货"——正是自动算法做不到、需要"装载优先级"解决的。

### 下一步（待拍板后起独立计划文件）

1. 装载优先级（已定方向）：CargoItem 增优先级/先装字段 → 改 packing 排序使整托先铺底；UI 录入。
2. 货物约束补全：支持"不可上托/最大码放层数"（C 玻璃场景），数据层 + 自动算法 + 手动验证贯通。
3. 同货物同朝向缝隙：复查 06-12 方案为何对本数据集留 10 箱异朝向。
4. 旋转入口：2D 旋转按钮 + 3D 旋转快捷键。
5. 批量对齐：跨箱规吸附对齐。

---

## 2026-06-18 第三十七轮 Review：导入弹窗选中模板即直接导入

> 状态：已实现并通过本地全量验证（lint clean、`npm test` 53 文件 / 329 测试、build 通过、全量 `npm run test:e2e` 93 passed / 1 skipped；模板相关 E2E 10/10）。部署与远程 E2E 结果见 CHANGELOG 同日条目。

- 背景：用户澄清模板本质不是“帮我预填后再确认”，而是完整解析规则（列映射 + 表头行/起始行/单位/合并尺寸/拆分顺序/默认值）。因此导入弹窗选择某个模板时，应直接按该模板解析导入；默认不应再自动套用上次模板或裸配置。
- 决策：本轮以“显式选择”为准，**取代**上一条“保存模板＝下次自动套用”的过渡决策。`importExcel` 打开手动映射弹窗时仅做当前文件列名启发式预选，模板下拉保持「无」；用户选中保存模板后立即解析并导入，成功时关闭弹窗并进入报告/导入日志。
- state 时序：新增 `buildTemplateImportConfig(template)` 纯函数，直接从模板对象生成 `parseCargoRowsWithTemplate` 配置；`importWithTemplate(template)` 解析时使用该对象配置，不依赖 `applyImportTemplate` 的异步 React state 更新。
- 列缺失展示：若模板映射的列名不在当前文件表头中，仍照常解析并把逐行错误写入 importLog；同时传 `missingColumns` 给 `ImportMappingForm`，让对应输入框 `data-invalid="true"` + 红框 + “Column not found in file / 列在文件中未找到”。有缺列时弹窗保持打开，用户可现场修正。
- 既有能力边界：模板管理页的新增/编辑已通过同一个 `ImportMappingForm` 保存这些参数，满足“模板 = 映射 + 列表信息”的设计意图；本轮不改后端 schema、不改解析规则、不改导出模板。
- 影响：`loadLastImportConfig` 仍保留数据层和测试，但导入弹窗不再自动读取它；`saveLastImportConfig` 仍记录用户确认过的裸映射，后续若需要可显式恢复。旧 E2E 中“自动套用保存模板 / 自动预填裸配置”的断言改为“默认无模板 + 手动路径仍可确认 + 选择模板立即导入”。
## 2026-06-18 第三十六轮 Review：保存模板＝记住它（下次导入自动套用）

> 状态：已实现并验证（lint clean、`npm test` 52 文件 324 测试、build 通过、headless Chromium 真机复现前后对比、新增 E2E 先 RED 后 GREEN、全量 `npm run test:e2e` 92 passed / 1 skipped）。来源：用户复核——「在导入 Excel 中选择各个映射后点击保存模板应可直接保存，下次再次使用模板就不用手动再选择映射」。

- 背景：用户在导入弹窗里配好列映射、点「保存模板」，期望下次导入该模板已自动套用、不必再手动选映射。实测：保存后若不在同一弹窗里确认导入（取消，或本次保存、下次会话才导入），下次上传弹窗仍空白，必须手动从下拉里重选模板。
- 根因（读码 + 真机复现定位）：`src/Workbench.tsx` `handleSaveImportTemplate` 保存命名模板时只 `setSelectedImportTemplateId(saved.id)`，**从不写 `lastUsedTemplateId`**（`cargo_last_used_template_id`）。只有 `confirmMappingImport`（:2001-2006）在确认导入时才持久化 last-used。于是「保存但未确认」这条链路 last-used 仍为空 → 下次 `importExcel` 的 `lastUsedExists` 为 false → 不调用 `applyImportTemplate` → 弹窗空白。注意：从下拉手选模板时 `applyImportTemplate` 一直能正确还原全部映射（已真机验证），缺口纯粹是「保存」没把模板标记为 last-used。
- 选项：A 保存成功后即把该模板写为 last-used（镜像 confirm 路径）；B 改 `importExcel` 自动套用逻辑，无 last-used 时退而取「最近保存的模板」；C 上传时按表头指纹自动匹配模板。
- 决策：**A**。最小、最贴合用户心智——「点了保存＝我要复用它」，所以保存即记住，下次自动套用。`handleSaveImportTemplate` 在 `if (!saved) return` 后加 `localStorage.setItem(LAST_USED_TEMPLATE_KEY, saved.id)` + `setLastUsedTemplateId(saved.id)`。不动 confirm 路径、不动导航页模板管理、不动 parse 规则。B 行为不可预期（最近保存 ≠ 用户想用的）、C 是此前已否决的自动匹配方向（decision 2026-06-11「模板=用户配置规则，不自动探测」）。
- 影响：唯一行为变化＝保存后该模板成为 last-used；下次上传弹窗自动套用（下拉选中 + 全部映射回填 + 确认可用）。若该模板后被删除，`importExcel`(:2504) 的 `importTemplates.some(id===lastUsedTemplateId)` 兜底回退到裸配置/空白，不会卡死。多次保存以最后一次为准；同弹窗内若改选别的模板再确认导入，confirm 仍以实际导入的模板覆盖 last-used，二者一致。
- 测试（编码意图，非凑绿）：新增 E2E `auto-applies a saved import template on the next import without re-selecting`——保存→取消→重传→断言下拉选中该模板且 `map-select-*` 已回填→直接确认导入 1 行。临时摘除修复跑出 RED（下拉解析为「No template」），还原后 GREEN，确保业务逻辑回退时测试会红。
- 后续：按 CLAUDE.md 生产部署 + 远程 E2E 回归，结果记入 CHANGELOG 同日条目。

## 2026-06-17 第三十五轮 Review：箱子倒放（朝向渲染）+ 同货物缝隙（装箱朝向一致）

> 状态：已实现并本地验证（lint clean、`npm test` 52 文件 324 测试、build 通过、隔离 WebGL 渲染 + 435 箱整柜渲染目检）。来源：用户复核 `cargo-debug-snapshot (14).json` + 倒放.png/缝隙.png。已用真实快照精确复现（PLACED 454、LWH197/WLH253/HWL4）后再动手。

### 点 1 · 箱子倒放 = 3D 渲染 bug（非装箱数据错误）

- 背景：倒放.png 中紫色 `TP`(`WLH`) 箱标签上下颠倒（显示成 "dl"），缝隙.png 中部红/蓝箱顶面无标签（露出无标签的 `-Y` 底面）。快照中 `WLH` 共 253 箱，远多于真正倒置的 4 个 `HWL`，说明不是 4 个倒箱，而是整类 `WLH` 渲染翻转。
- 根因：自动装箱输出 canonical 全正 `orientationAxes`（`WLH`={W+,L+,H+}）。`WLH/LHW/HWL` 这三个是左手（improper）排列，`orientationRenderingBasisVectors`（`src/lib/orientationTransform.ts`）为恢复正交旋转一律翻转 **height**；而 `WLH` 的 height 本就朝上，翻 height 把整箱倒过来 → 顶面变底面、标签颠倒。
- 选项：A 在渲染基向量函数里按「height 已朝上时改翻水平轴(width)」分流；B 让装箱输出 proper 的有符号 axes（改 `canonicalAxesForOrientation` 给一个水平负号）；C 3D 标签改逐面纠正旋转。
- 决策：**A**。最小、最稳。仅当基底 improper 且 `basis.height.z>0`（height 朝上，唯一命中 canonical `WLH`）时翻 `width`，否则保持原 height 翻转（不破坏 `normalizes left-handed snapshot axes` 那条锁定 height 翻转的快照用例 —— 其 height 为水平 `hz=0`，不进新分支）。tilt 方向(`LHW/HWL`，height 水平)维持原行为。
- 影响：`renderedFootprint` 对单轴变号不敏感（AABB 取 ±半轴 max-min），手动重叠/越界判定不变；2D 用 `orientationAxesOf`（未改）不受影响。新增单测断言 canonical `WLH` 渲染基底 height 保持 (0,0,1) 且 det=1。隔离渲染 LWH/WLH/HWL 三箱与整柜 435 箱目检：标签全部正立。

### 点 2 · 同货物缝隙 = 装箱朝向不一致（执行 2026-06-12 已决策但未落地的子任务 1）

- 背景：2026-06-12 已拍板「缝隙＝同货物同朝向」（decision.md 同日条目 + `plans/2026-06-12-template-and-packing-gap.md` 子任务 1），但当时只落地了模板 UI（子任务 2/3/4），装箱朝向约束一直没做。本轮补上。
- 根因：`placementScore` 只用极弱的 `labelFacingPenalty=(L-W)*0.01` 偏好 LWH，压不过位置项，同一货物被拆成 LWH/WLH 混排（快照 7 个品类混排），地面行距 530/305 交替留缝。
- 决策：每个 cargo 由其**首个直立放置**确定承诺朝向（`committedOrientations: Map<cargoId,OrientationKey>`，`placeEntry` 写入）；后续同 cargo 直立候选若朝向不同则加 `orientationCommitmentPenalty = 0.5×柜体积`。**强惩罚非硬过滤**：承诺朝向放不下时仍换朝向放置（快照混排 7→1，那 1 个正是兜底换朝向，箱体仍被放置而非 unplaced），覆盖 `bestPlacement` 与 `volume` 两条路径。penalty 取 0.5×体积：盖过本地位置项（单行位移约 0.09×体积，dominance≈5×），又低于 `tiltPenalty`(1×体积) 以保证「直立兜底优于躺倒」。
- 量级取舍（sweep 实测）：penalty∈[0.15,0.5] 均得混排=1、无 tilt；=1.0 会让直立兜底与 tilt 同分而重新混入 `WHL/HLW`，故取 0.5。
- 影响 / 与旧决策冲突：与 2026-05-23「6 朝向 tilt 提利用率」存在张力——但本轮用户正是抱怨 tilt/倒放，方向以**当前用户反馈**为准（AGENTS 规则 7/11：取更新更贴合用户的取向）。快照结果：LWH282/WLH153、**HWL 消失**、混排 7→1、地面侧悬 11→7。利用率权衡：本超载夹具(864 货 ~50% 可装)placed 454→435（−19，−4.2%）；sweep 证明任何 ≥0.05 的 penalty 都会触发该降幅且到 0.5 持平，是「同货物同朝向」决策接受的一致性 vs 密度固有代价，非量级失误。正常装载（全部可装）一致性零成本。
- 测试取舍（非削弱凑绿）：`places 80×400×500×600` 旧断言 `maxLayer≥5` 实际奖励的是混排 LWH/WLH 的**不平整阶梯堆叠**（17/20/20/20/3），即用户抱怨的缝隙来源；修复后为干净 4 层均匀堆叠（20×4）且 **80 箱全装（利用率不降）**。故把断言改为 `placedCount===80 + maxLayer≥4`，并改标题/注释（原「via tilting」实际无 tilt）。证据：OCP=0 与 0.5 均放 80 箱，仅堆叠结构由阶梯变均匀。
- 后续：按 CLAUDE.md 生产部署 + 远程 E2E 回归，结果记入 CHANGELOG。`test:e2e` 若覆盖 3D 标签/装箱布局相关用例需重点观察。

## 2026-06-16 第三十三轮 Review 范围拍板（模板统一 / 导出模板 / 合并填充 / 帮助气泡）

> 状态：已拍板，按 REVIEW.md「第三十三轮」推荐方案执行。基线（lint+test 305+build+模板相关 E2E 6 项）已全绿。

- 点 1（最大）范围＝**解读 A+B 同做**（REVIEW.md:31-41）。理由：本轮目标标题即含「模板管理统一 / 导出模板」，二者均在范围内，不缩范围。
  - B（前置）：抽 `src/components/ImportMappingForm.tsx` 单一列映射组件（表头/起始行、尺寸模式、合并列+拆分顺序、必填高亮、选填区、列下拉、必填校验），导入弹窗与顶层模板管理页共用，删模板管理页自由文本 `<input>` 分支。
  - 组件下拉来源 = `availableColumns: string[]`。导入弹窗＝上传文件表头；顶层模板页无上传文件 → 页内新增「加载样本表头」文件选择器提供候选（命中 REVIEW「来源=样本表头」）。已存模板编辑沿用其样本表头或上次表头。
  - A：新增 `src/lib/exportTemplates.ts` 数据层 + 后端 `export_templates` 表（幂等迁移，仿 import_templates）。模型＝导出列集合 + 顺序 + 表头名 + 单位。`exportExcel` 改为按所选导出模板产列；新增「导出模板管理」入口复用同一管理外壳。
- 点 2：持久化「上次原始导入配置」(mapping/units/headerRow/startRow/dimensionMode/combinedColumn/dimensionOrder/defaults) 到 localStorage，按用户隔离 key（仿 `placementSettingsKey`），不依赖命名保存；开弹窗预填（命名模板优先，裸配置兜底）。
- 点 3：合并模式（`templateDimensionMode==='combined'`）下字段循环隐藏 length/width/height 独立选择器及其单位；分列模式保持。纯渲染条件，不改 parse / 必填校验。并入点 1 共享组件，单独验收。
- 点 4：`HelpTooltip` 改 React portal + `position:fixed` + 视口夹紧，规避 `overflow-y-auto` 容器横向裁切。E2E 断言气泡 `getBoundingClientRect()` 完整落在视口内。
- 既有 E2E（模板管理页用自由文本 `template-manager-new-map-*`.fill）随重构改为下拉 `.selectOption`；非削弱断言，是随计划演进行为。
- 执行顺序：4 → 3 → 2 → 1(B→A)。每点单独 commit。
- ✅ 完成（2026-06-16）：4 点全部实现，各自单独 commit（portal tooltip / combined 隐藏 L/W/H / 裸配置预填 / 抽 ImportMappingForm / 统一模板管理页 / 导出模板端到端）。本地 lint clean、`npm test` 52 文件 320 测试通过、build 通过、全量 E2E（container-calc 43 + 其余 47 通过 / 1 skip）。导出模板模型最终落地＝「有序列集合 {field, header, unit?}」，cm 单位仅作用于 6 个尺寸字段（original/actual L/W/H），单位换算 mm/10；默认（未选模板）保持原 17 列 detailRows 不变。后端 export_templates 走 scp server/*.mjs + service restart 部署，migration v7 远端重启时执行。

## 2026-06-12 三计划执行完成（吸附/渲染朝向/手动性能）

> 状态：代码已全部实现，lint+test+build 通过。E2E 受 API 服务器端口不匹配影响未完全通过。

- 计划来源：`plans/2026-06-11-snap-feedback.md`、`plans/2026-06-11-manual-render-and-metrics.md`、`plans/2026-06-11-manual-perf.md`
- 成果：10 commits，291 单元测试通过，build 通过。
- Plan3-Snap：吸附容差 30→80mm，3D 落定边吸附修复，snapGuides 共享逻辑（3D/2D 渲染后续）。
- Plan2-Render：handleContinueManually 朝向元数据一致性修复（makeManualBox），移动钳制到柜边界，旋转能力 UI 可见化（gizmo 隐藏+E2E 属性），体积 CBM 展示，导入空结果引导。
- Plan1-Perf：validateBox 增量校验 O(n³)→O(n²)，supportingStackLimitViolation 节点图预构建复用，拖动节流跳过。
- E2E 状态：服务器默认端口 3000 与 vite proxy 默认 3010 不匹配，需 `PORT=3010 node server/index.mjs` 前置启动。已记录为环境配置问题。
- 远程部署：`npm run build` 产出 `dist/` 完整，待推送。
- 通知：CHANGELOG.md 已更新完整条目，decision.md 已追加本记录。

记录 PRD 未明确、需要取舍或会影响后续架构的决策。

## 2026-06-09 已决策：反馈轮次 2（尺规样式 / PDF 位置与视角 / 手动模式步骤 / 模板帮助）

> 状态：**已拍板**。定稿计划写入 `plans/2026-06-09-feedback-round2.md`，交 Codex 执行。

用户对上轮 Codex 实现的三个功能提出四点改进反馈：

### A · 尺规改为 AutoCAD 测距线样式 + 可见按钮 + 键盘帮助

- 背景：当前余量标注用 512×160 canvas 画大白底圆角矩形 + 52px 粗体数字（`ContainerScene.tsx:652`），遮挡视角。名称也不该叫"余量"——应沿用"尺规"。
- 决策：
  - 数字改为**小字号、无背景**的 AutoCAD 测距线风格（extension lines + 紧凑数字）。
  - 保留已有的可见切换按钮（`data-testid="toggle-clearance"`），保留 `m` 快捷键。
  - **自动模式** 3D 视图补一个键盘帮助按钮（列出 M 等快捷键）；手动模式帮助补上 M 条目。
- 影响：重写 `createClearanceLabelSprite` + `syncClearanceAnnotations` 中端点渲染；新增 auto-mode 帮助 UI。

### B · PDF 导出移入「装柜步骤」tab + 改 3D 轴测视角

- 背景：PDF 按钮放在顶部工具栏语义不对；每步图是 2D 俯视，用户期望 3D 轴测。
- 决策：
  - 按钮移入 `LoadingStepsPanel` 组件内。
  - 新建离屏正交等轴渲染器（`offscreenIsoRenderer.ts`），替换 `drawBoxPlan` 2D 俯视。
- 影响：新增 Three.js offscreen renderer 模块；修改 `exportLoadingSheet.ts`；修改 `LoadingStepsPanel` props。

### C · 装柜步骤/作业回放支持手动模式

- 背景：手动模式下 `buildLoadingTaskGroups` 和 `buildPlaybackSequence` 接收 `null` → 步骤/回放不可用。
- 决策：
  - 新增 `manualSteps.ts`：对手动盒子跑 `assignDepthLayers` 推导真实层级，再按「层→z↑→y↑」推导 workSteps，组装一个最小 `PackingResult`。
  - 手动模式步骤/回放消费该 result，与自动模式共享后续管线。
  - **手动装柜顺序 = 按支撑层 + 从下到上**（用户选择）。
- 影响：新增纯逻辑模块 + Workbench 接线；不改 `buildLoadingTaskGroups` 本身。

### D · 模板管理添加帮助引导（问号 tooltip）

- 背景：映射 modal 无任何字段级说明，用户不知道如何配置。
- 决策：关键字段旁加小圆问号 tooltip（表头行、数据起始行、尺寸模式、合并尺寸列、标签列），hover/click 弹出简短说明。用极简自有组件，不引入第三方库。
- 影响：新增 `HelpTooltip` 组件 + i18n 帮助文案。

## 2026-06-09 已决策：三议题（作业分解图导出 / Excel 导入模板系统 / 3D 余量自动标注）

> 状态：**已拍板**。三份定稿计划分别写入 `plans/2026-06-09-loading-sheet-pdf.md`、`plans/2026-06-09-import-template-system.md`、`plans/2026-06-09-clearance-annotation-3d.md`，交 Codex 分别执行。

调研由三个并行子代理完成，根因均已定位到 file:line（见下方各条）。用户逐条决策如下。

### 议题 1 · 装柜步骤 → 作业分解图导出（多页 PDF）

- 背景：用户希望「装柜步骤」能导出成纸质作业分解图（参考 `test-data/越南40尺装柜分解图2026.6.2.pdf`：首页物料清单图例 + 后续多页编号步骤卡片网格，每卡片=一次作业累加快照，标注标签+件数+俯视示意）。
- 现状（基础已具备）：
  - `src/lib/loadingTaskGroups.ts:106` `buildLoadingTaskGroups()` 已把逐箱步骤合并成「作业批次」`LoadingTaskGroup`（带件数、bounds、支撑、标签）——对应 PDF 一张卡片。
  - `src/lib/playback.ts:41` `visibleBoxesAt(cursor)` 现成支持「已装+本步新增」累加快照。
  - `src/components/ContainerPlan2D.tsx:47` 纯 SVG 俯/正/侧视图，入参 `boxes[]`，可传子集、可高亮——直接当每格视图。
  - 缺口：`package.json` 无任何 PDF 库（无 jsPDF/html2canvas）；当前导出全是纯前端 download。
- 用户决策：
  - **输出格式**：单一**多页 PDF**，引入 **jsPDF**（不走打印 HTML、不走图片打包）。
  - **每格视图**：**俯视图 + 累加快照**（深色=已装、高亮=本步新增），不画侧视图、不只画本步新增。
  - **首页**：要一页**物料清单图例**（描述/件数/长宽高/重量/标签色），照搬 PDF 形态。
  - **步骤粒度**：用现有 `LoadingTaskGroup` 作为一步（不另设粒度）。
- 影响：新增前端依赖 jsPDF（+ SVG→canvas/image 栅格化）；新增组织层 `src/lib/loadingSheet.ts`（复用 loadingTaskGroups + playback，不重算装箱）；`Workbench` 加导出按钮。
- 后续：尺寸单位、A4 每页格数、双语标注等版式细节在计划文件内定默认值，必要时复核。

### 议题 2 · Excel 导入模板系统（适配异形客户表）

- 背景：客户 Excel 五花八门，现有解析无法稳定支持。参考 `test-data/excel/越南第十一批6.2海运.xlsx`：**第 1 行合并标题、真表头在第 2 行**；长宽高挤在同一格 `530*305*310`（mm）；数量有 `预计发货数量`(总件)/`箱数`(真正装箱数)/`箱规` 三列陷阱；无独立标签列只有 SKU(`TB-C10-EV_v1.1`)；末行 `汇总` 合计行；含换行备注列。
- 现状失败点（致命）：
  - `Workbench.tsx:2100` `sheet_to_json` 用电子表格第 1 行做列名 → 合并标题导致列名变 `__EMPTY` 垃圾 → `canAutoMap`(`:2059`) 自动导入失效。
  - `ImportTemplateConfig.headerRow`(`importCargo.ts:46`) 声明了但**全程未被使用**（`parseCargoRowsWithTemplate:270` 只用 `startRow` 切片）→ 手动映射也救不回表头。
  - 合并尺寸 `530*305*310` → `positiveNumber`(`importCargo.ts:89`) 期望独立列 → `Number()`=NaN → 每行 `INVALID_DIMENSIONS`(`:138`)。无按 `*×x` 拆分能力。
  - 数量别名 `fields.quantity`(`importCargo.ts:63`) 命中 `预计发货数量` 而非 `箱数`。
  - 标签 `slice(0,2)`(`importCargo.ts:201`) 把所有 `TB-xxx` SKU 塌成 `"TB"`，破坏核心业务字段。
  - 合计行未剔除 → 噪声错误。
- 用户决策：
  - **走「模板系统」路线**（不要求客户按标准模板填）：设计能适配某一类客户 Excel 的解析模板（表头行 + 合并尺寸列拆分 + 列→字段映射 + 单位 + 标签列），存下来后**同类 Excel 后续直接套用对应模板导入**。
  - **模板匹配方式**：**导入时用户手动从下拉选模板**（不做按表头指纹自动匹配）。
  - **标签来源**：**导入时让用户指定哪一列**作标签（不默认整列 SKU、不默认 SKU 前缀分组、不再 `slice(0,2)`）。
- 影响：`importCargo.ts` 需让 `headerRow` 真正生效（用 `header:1` 矩阵按指定行重建列名）、新增合并尺寸列拆分、剔除合计/空行、数量列别名优先级修正；`Workbench` 导入流程改为「选模板→预览→确认」，映射 UI 需暴露表头行、合并尺寸列、标签列指定。本轮**重新设计一轮**导入，不是小修。
- 后续遗留歧义（计划内给默认值，必要时复核）：合并尺寸分隔符集合与顺序约定、合计/备注行处理细节、模板与现有 `importTemplates`(`src/lib/importTemplates.ts` + 服务端 `/api/import-templates`) 持久化结构如何扩展。

#### 2026-06-09 执行补充：越南夹具行数按当前文件事实验收

- 背景：`plans/2026-06-09-import-template-system.md` 的验收描述提到越南样例约 25 条 SKU，但当前 `test-data/excel/越南第十一批6.2海运.xlsx` 实测为 27 行：第 1 行标题、第 2 行表头、第 3-26 行 24 条 SKU、第 27 行 `汇总`。
- 决策：E2E 和导入日志按当前夹具事实验收：`Import success: 24`，`Skipped non-data rows: 1`。不为了贴合计划文字伪造第 25 条 SKU，也不把 `汇总` 计入业务货物。
- 影响：模板系统的业务语义更明确：汇总行必须跳过，完整 SKU 标签必须原样流入货物列表、装箱结果、明细和导出链路。

### 议题 3 · 3D 余量自动标注（拆除手动尺规）

- 背景：现有两点尺规「不正确」，用户想直接在 3D 看边缘空隙尺寸。
- 现状根因：
  - `Workbench.tsx:1478` 写死 `axis:'spatial'` → `measurement.ts:80` 永远算 3D 斜边而非轴向间隙 → 手点两点几乎不在同一轴线 → 系统性偏大（主因）。
  - 空中取点退化到地板平面(`ContainerScene.tsx:1099`)、兜底取相机距离处一点(`:1093`)无几何意义；吸附只认边中点 + 默认 80mm 阈值导致跳变。
  - 关键发现：所有盒子精确 AABB（`PlacedBox.x/y/z+length/width/height`，`types.ts:30`）与容器内壁全已知；`measurement.ts:112` `measureBoxClearance()` 已能算六向余量+最近邻间距、**有单测但零调用方，是死代码**。
- 用户决策：
  - **方案 C 为主**：**选中盒子 → 在 3D 自动用带数值标注线显示可用方向的余量**；某向若与相邻盒/内壁**直接接触（余量≈0）则该向不显示**；整个功能用**快捷键开关**。
  - **拆除现有手动两点尺规**（不保留、不修轴向版本）。
- 影响：接线 `measureBoxClearance`（消除死代码）；`ContainerScene` 新增带数值的 3D 标注线渲染（替换 `syncMeasurementLines` 的两点连线）；`Workbench` 移除 ruler 两点状态/UI，新增快捷键 + 复用 `selectedBoxId`(`Workbench.tsx:1002`)；接触阈值（余量近 0 不显示）需定一个 epsilon。
- 后续：`decision.md` 已记 `measureBoxClearance` 由死代码转为正式启用；正交视图(方案 D)本轮不做。

## 2026-06-08 已决策：cap=1 货优先做「顶层乘客」以逼近装载理论上限 + 合规诊断提示

> 状态：**已拍板**。定稿写入 `plans/2026-06-08-stack-fill-optimization.md` 交 Codex。

- 用户决策：
  - 目标：**优化算法逼近装载理论上限**（样本(12) 现 109，理论约 124），不维持现状。
  - 方向：采用**方向 1**——cap=1（不可堆叠/maxStackLayers=1）的货放置时**优先寻找已有堆栈的顶面落位，没有合适顶面才占地面**，避免抢占可被压高的地面格。
  - 诊断提示：把「装载受 cap=1 货型限制、已接近物理上限」的提示放进**合规与诊断**（`buildDiagnostics`，复核清单的 `diagnostic` 源），不做单独弹窗。
- 根因（详见上方讨论条目）：cap=1 货约 150/218，能当顶层乘客的可堆列仅约 22；现 low-x 逐位放置让 cap=1 货过早占地面、焊死整列在 1 层 → 只装 109。
- 落点：`packing.ts` 候选打分/顺序（`placementScore` + 候选生成）让 cap=1 货偏好顶面；`buildDiagnostics`（`:407`）新增容量受限诊断项。
- 验收门槛：① 样本(12) 类夹具放置数从 ~109 提升、明显逼近理论上限（目标方向，不强求精确 124，但须显著 >109 且不退化其他样本）；② 现有 packing/manualPlacement 测试全绿；③ 合规诊断出现「容量受限」提示且文案准确。
- 实施结果（2026-06-08）：已按「不改约束、只改候选/时机」落地。quantity 模式为后续 cap=1 货预留一层有限堆叠容量槽，cap=1 货优先尝试高位顶面乘客候选，失败后才进入地面兜底；volume 模式也先尝试高位顶面候选但保留原地面回退。真实 `cargo-debug-snapshot (12).json` 回放从 109/218 提升到 **118/218**，cap=1 顶层乘客从 8 提升到 **22**，cap=1 地面锁死从 33 降到 **28**，支撑链容量违例 **0**。该结果显著高于 109，但低于计划里“如 ≥120”的初始建议阈值；当前记录为本启发式的实测收益，后续若要继续逼近 124，应单独评估两阶段放置或更强的 top-surface 拼版搜索。

## 2026-06-08 讨论中（未定稿）：stackCapacity 装载率仍偏低——cap=1 货抢占地面，未优先做「顶层乘客」

> 状态：**已被上方「2026-06-08 已决策」取代**，保留作讨论与根因记录。

- 样本事实（已用脚本核对 automatic.placedBoxes）：
  - 柜 20'（5758×2352×2385），货全同尺寸 400×500×600。21 种货 218 件，已放 **109**。
  - 容量分布：A 无限、B/C/D=3、E/F=4、**G/H/I=1、J…U 不可堆叠(=1)** → cap=1 的货共约 **150 件**，可堆货（cap≥3）仅 **68 件**。
  - 地面 56 格（14×4）已铺满；列高分布：**height-1 列 39 个、height-3 列 22 个、height-4 列 1 个**。
  - 关键：**所有 39 个 height-1 列，地面那箱都是 cap=1 的货**——它们落了地就把整列锁死在 1 层；可堆货（A-F）则正确沉底并堆到 3 层。
  - 重量 2508 / 28200，**远非重量约束**；高度 2385 最多 3 层（4 层需转成 400 高）。
- 根因（不是约束错，是放置顺序/策略）：
  - stackCapacity 重构已让「可堆的沉底、cap=1 的后放」，A-F 确实堆满 3 层。但 cap=1 的货有 150 件，而能接纳 cap=1「顶层乘客」的可堆列只有约 22 个（每列顶多收 1 个 cap=1，cap=1 之间不能互叠）。
  - 现有放置仍是 low-x 优先**逐位铺开**：cap=1 的货在「可堆列尚未建满」时就被放到了空地面格，**抢占了本可被压更高的地面位**，自己却把那一列焊死在 1 层。
  - 结果：地面被 cap=1 货大量占据 → 整体只能 109。理论上限粗算约 **124**（68 可堆 + 23 顶层乘客 + 33 地面 cap=1），还有十几件可捞，但**这个货型组合本身就受限**（150/218 不可被压，56 地面格），不可能装满。
- 待讨论的优化方向（请你选/拍板）：
  - **方向 1：cap=1 货优先做「顶层乘客」而非占地面。** 放置时让 cap=1 的货优先寻找「已有可堆栈的顶面」落位，只有没有合适顶面时才占地面。等价于：先把可堆货建成尽量高的列，再把 cap=1 货往这些列顶上贴，最后剩余 cap=1 才铺地面。
  - **方向 2：两阶段放置。** 阶段 A 只放可堆货（按现策略堆高）；阶段 B 放 cap=1 货，优先顶面、后地面。实现清晰、可单测，但改动比纯排序大。
  - **方向 3：维持现状，仅承认这是货型本身的物理上限。** 给出「最优也只能装约 124」的诊断提示，不强行优化（避免为十几件做复杂启发式）。
- 我的倾向：**方向 1**（在候选打分里给 cap=1 货的「顶面候选」加权，使其优先上架、不抢地面），改动相对集中在 `placementScore`/候选生成，可单测；若方向 1 收益不达预期，再考虑方向 2 的两阶段。但需先和你确认：**这个样本你期望装到多少？是要逼近理论 124，还是只要肉眼可见地把 DGH 那些列堆更高即可？**
- 待确认问题：
  - Q1 优化目标：逼近理论上限（~124）还是「明显改善、不追极致」即可？
  - Q2 接受哪个方向（1/2/3）？
  - Q3 是否接受为「明显受限的货型」增加一个诊断提示（告诉用户为何装不满，是 cap=1 太多而非算法没尽力）？
- 后续：拍板后把定稿写成 `plans/` 下新计划文件交 Codex；本条目讨论结束后标记已决策或归档。

## 2026-06-07 已决策：把堆叠规则统一为「堆叠容量」标量 + 彻底合并约束（大重构）

> 状态：**已拍板**（U-1/U-2/U-4/U-5 确认）。定稿已写入 review.md 作为执行计划（升级原 T3）。

- 用户决策：
  - U-1 不可堆叠采用**含义 A**（不能被压、但自己可做顶层乘客；KLM 能堆到 EF 之上）——本期落地语义。
  - U-2 **保留含义 B**（仅地面/不能上架）：在数据与约束层加字段支持（如 `groundOnly`），但**本期 UI 不暴露该参数**，默认关闭；为将来留口。
  - U-4 **彻底统一**：合并约束，删除 `supportOverlap`/`hasStackingViolation` 等处的 `stackable` 布尔特判，收敛到单一支撑链容量判断。这是一次大重构。
  - U-5 volume 模式也按 stackCapacity 优先。
  - 单测：必须用「同尺寸、混合堆叠规则」的数据夹具（参照样本(11)：无限/有限/不可堆叠混合）做回归保证。
- 归一定义：
  - `stackCapacity(item) = item.stackable===false ? 1 : (effectiveMaxStackLayers(item) ?? ∞)`（∞ 用 `Number.POSITIVE_INFINITY`，序列化仍存 `maxStackLayers=undefined` / `stackable`）。
  - 含义 B 单独表达：`groundOnly`（true=只能落地，不能被放到任何箱之上）。与 stackCapacity 正交：stackCapacity 管「我上面能压几层」，groundOnly 管「我自己能不能上架」。
- 约束统一（支撑链）：箱 X 放在第 N 层非法，当且仅当其支撑链（含自身）中某箱 Y 的 `stackCapacity < (N - layerOf(Y) + 1)`；额外，若 X.groundOnly 且 N>1 → 非法。`stackable=false` 自动等价容量1（其正上方那层即违例 → 没人能压它），**删除所有 `!stackable` 特判**。
- 影响面：`packing.ts`（排序 `:459-470`、`supportOverlap :129`、`respectsMaxStackLayers :169`、`hasStackingViolation :318-321`）、`manualPlacement.ts`（`validateDraft` 堆叠/支撑校验）、`types.ts`（`CargoItem.groundOnly?`、`PlacedBox` 透传）、抽 `src/lib/stackCapacity.ts` 共用纯函数。
- 风险与回归门槛：动装箱核心约束属高风险。验收双门槛——① 样本(11)类夹具装载数较旧实现**明显提升**且不可堆叠货全部落在各摞顶层；② 现有 `packing.test.ts`/`packing.31pallet.test.ts`/`manualPlacement.test.ts` 全绿。任一不达标先记本文件再决定是否降级为「仅统一排序、保留约束特判」。
- 实施结果（2026-06-07）：已按统一堆叠容量模型落地并保留垂直支撑关系字段，避免 `assignDepthLayers()` 将 `supportedBy` 改写为装柜深度推入关系后影响容量校验。真实 `cargo-debug-snapshot (11).json` 回放从旧快照 102/268 提升到 182/268，K/L/M/N 不可堆叠货实际装入 14 件，全部位于顶层且支撑链容量/groundOnly 违例数为 0；同轮单元门槛 `packing.test.ts` / `packing.31pallet.test.ts` / `manualPlacement.test.ts` 已通过。

## 2026-06-07 讨论中（未定稿）：把「不可堆叠」统一为「堆叠容量」标量的装箱模型

> 状态：**已被上方「2026-06-07 已决策」条目取代**，保留作为讨论记录与根因分析。

- 背景：用户在样本 `cargo-debug-snapshot (11).json`（26 个货物尺寸全相同 400×500×600，仅堆叠规则不同：A/B/C 无限、D-F=5、G-J=2、K/L/M/N 不可堆叠、O-Z=3；268 件只装 102 件）提出想法——能否把所有货物看成相同的箱子，差别只是堆叠限制，从而把「不可堆叠」统一进同一算法：能堆的放下边、不能堆的放最上边。用户明确「KLM 应可堆在 EF 之上」。
- 核心发现（已读代码确认）：
  - 「不可堆叠」现实有两义：**含义 A**「不能被压、但自己可做顶层乘客」（必须在某摞最顶层）；**含义 B**「只能贴地、不能上架」（必须第 1 层）。用户诉求「KLM 能上 EF」属**含义 A**。
  - 当前代码的不可堆叠**恰好已是含义 A**：`packing.ts:129 supportOverlap` 中 `if (!candidate.stackable) return 0` = 不可堆叠箱提供 0 支撑、没人能压它，但它自己仍可被放到别人顶上。**所以约束方向本就正确，KLM 本就允许放到 EF 上。**
  - 样本只装 102/268 的真正根因是**放置顺序**，不是约束：`calculatePacking` expanded 排序（`packing.ts:459-470`）quantity 模式只按「数量→体积」，完全不看堆叠容量；不可堆叠的 KLM 可能先放、落底层占地却谁也压不上去，堵死可堆高的列。
- 提议模型：归一标量 `stackCapacity(item) = item.stackable===false ? 1 : (effectiveMaxStackLayers(item) ?? ∞)`。排序键改 `stackCapacity desc → 数量 → 体积`（容量大的先放沉底、容量1的不可堆叠货最后放浮顶）。可选：把 `respectsMaxStackLayers`（`:169`）与 `supportOverlap` 的 stackable 特判（`:129`）合并成单一支撑链容量判断——`stackable=false` 自动等价容量1，删并行分支、逻辑收敛。
- 待用户拍板（U-1～U-5）：
  - U-1 不可堆叠确认为含义 A（倾向：是，与诉求一致、代码现状一致）。
  - U-2 是否单独做含义 B「仅地面」开关（倾向：暂不做，真有需求再加独立字段，不混进 stackCapacity）。
  - U-3 ∞ 表示（倾向：`Number.POSITIVE_INFINITY` 排序用，序列化仍存 `maxStackLayers=undefined`）。
  - U-4 是否合并约束、删 `supportOverlap` 的 stackable 特判（倾向：是，但属中-高风险，需「样本(11)装载数提升」+「packing.test/31pallet.test 全绿」双重回归；降级方案：只统一排序、不动约束）。
  - U-5 volume 模式是否也按 stackCapacity 优先（倾向：是）。
- 与现有计划关系：若认可，本模型**取代并加强**「2026-06-07 开发计划」中的 T3（T3 仅让 maxStackLayers 参与排序；本方案进一步把 stackable=false 归一进同一标量并可选合并约束）。其余 T1/T2/T4/T5/T6 不变。
- 后续：等 U-1～U-5 确认 → 把定稿写入 review.md 升级 T3 → 交 Codex；本条目讨论结束后标记为已决策或归档。

## 2026-06-07 全向标签、堆叠排序与性能证据边界

- 背景：用户复测后明确要求 3D 标签不要再按角度选面，顶面/侧面/任意角度都能看到标签；同时 quantity 优先场景中有限堆叠货不应先占底层，手动大体量卡顿的首要热点是相机移动触发全箱材质重算。
- 选项：
  - 保留 camera-facing 选面：贴图数量少，但相机角度变化会导致某些面无标签，也会继续需要 OrbitControls change 后逐箱更新材质。
  - 改为固定外露面全集：行为更稳定，顶面和侧面都能看到标签；底面 `-Y` 仍省略，因为贴地不可见且会增加无业务价值的材质面。
  - 仅 quantity 模式按 stackCapacity 排序：最贴近样本，但 volume 模式仍可能把受限货垫底。
  - quantity 和 volume 模式都先按 stackCapacity 降序：自动模式统一“能多堆的先落底”，weight/input 保留各自语义。
- 决策：3D 标签采用固定外露面 `+X,-X,+Y,+Z,-Z`，删除 camera-facing 选面逻辑和相机 change 材质刷新监听。面贴图用 `faceLabelLayout()` 固定分区，保证名称、徽标、重量尺寸和图标不重叠。quantity 和 volume 模式排序都先比较有效 `maxStackLayers`，无限视为最高；weight/input 不改。T6 收尾不再增加 RAF 节流：`displayCargoItems`、`manualPool`、`manualIssues`、`manualInvalidBoxIds`、`manualPlacedBoxes`、`manualCapacity` 已经由 `useMemo` 派生，且最大热点已随相机 change 材质刷新监听删除。
- 影响：相机旋转不再触发全箱材质重分配，标签可见性稳定；材质缓存 key 不再包含相机选面维度。volume 模式放置顺序可能因堆叠能力优先而变化，属于业务导优取舍，现有 packing 回归已通过。分层查看时非当前层更透明，空尺规提示不再占画布。
- 性能证据边界：`cargo-debug-snapshot (10).json` 通过历史恢复会按当前算法重算为 210 个已渲染箱体，不是原始快照里的 167 个自动 placed boxes，因此本轮性能记录只能作为当前代码 210 箱压力场景。近俯视相机命令前后 `data-label-faces-sample` 保持 `+X,-X,+Y,+Z,-Z`，采样到的标签面变化数为 0；headless Chromium 的 rAF 间隔仍偏高，不作为流畅 FPS 结论。若未来要声称帧率提升，需要在同一机器、同一浏览器下对旧提交和新提交做 A/B。
- 后续：完成本轮全量本地验证、部署和远程 E2E 后关闭 2026-06-07 整体计划；若用户继续反馈 210+ 箱拖拽卡顿，再单独针对 Three.js instance 化、纹理贴图数量或手动校验节流建新计划。

## 2026-06-06 第二十三轮：一键放置、模板管理与 3D 尺规取舍

- 背景：第二十三轮 review 要求同时处理 3D 手柄遮挡、面标业务信息、一键放置、货物库、模板管理和 3D 尺规。其中一键放置、模板管理编辑范围、面标信息密度和 3D 尺规与选箱/拖拽的事件优先级都存在多种合理实现。
- 选项：
  - 一键放置复用全量 `calculatePacking()` 重排：空间利用率可能更高，但会改变用户已有手动摆放结果，不符合“从池中取 1 件增量塞入”。
  - 一键放置新增增量候选搜索，并把候选草稿交给 `validateDraft()`：策略简单，但不会和全量装箱一样做复杂优化。
  - 模板管理复刻完整导入弹窗：字段下拉体验完整，但历史页没有源文件列集合，容易形成第二套映射 UI。
  - 模板管理提供名称、行设置和字段映射文本编辑：足够维护已保存 payload，详细预览仍留在导入弹窗。
  - 3D 尺规点击与选箱/拖拽并行：容易互吞事件。
  - rulerEnabled 时 3D 点击优先测量，关闭尺规后恢复选箱/拖拽/手柄。
- 决策：一键放置采用 `quickPlaceCargo()` 增量候选搜索，优先地面扫描再尝试兼容顶部堆叠，所有候选都通过既有 `validateDraft()` 判定，不复制碰撞/支撑规则。历史页模板管理支持列出、重命名、删除、header/start 和字段映射文本编辑，导入弹窗继续负责带源文件列的完整映射/预览。3D 尺规在 `rulerEnabled` 时优先处理 canvas 点击，吸附到箱角、箱边或柜壁；2D 尺规保留。3D 面标只在 full label 纹理中加入全名、尺寸/重量、旋转和堆叠图标，compact 模式保持简化。
- 影响：一键放置结果是确定性“下一件合法位置”，不是全局最优重排；用户已有手动摆放不会被重排。模板管理可以维护已保存映射，但创建新映射仍建议从导入弹窗带文件上下文完成。3D 尺规开启时点击不再选择/拖动货物，避免事件语义冲突。面标信息增加但仍受 full/compact 分级控制。
- 后续：如果业务要求一键放置按 `loadingMode` 做更高质量紧致度优化，需新增独立评分策略和快照回归；如果模板管理需要完整下拉映射，应抽出可同时接收“源文件列集合”的共享组件；如果 3D 尺规需要边上任意点吸附而非边中点，需扩展 `measureSnap.ts` 的候选模型。

## 2026-06-06 俯视标签与一键放置方向取舍

- 背景：本轮 review 要求俯视 3D 标签在缩放/平移后保持稳定、一键放置从柜内向柜门推进并与作业回放顺序一致，同时用户确认自动和手动前提条件可能不同。
- 选项：
  - 俯视/front/side 继续逐箱按相机方向选面：iso 表现好，但正交视角会因相机微小偏移导致同一视角下不同箱体贴不同面。
  - 正交视角按 viewMode 固定贴可见面，iso 继续逐箱朝相机：行为稳定，且保留自由视角优势。
  - 一键放置完全复用自动装箱候选和合法性：排序一致，但手动场景已有用户摆放、支撑策略和校验前提不同。
  - 一键放置只复用自动装箱 `placementScore` 排序，候选生成和合法性仍走手动 draft + `validateDraft()`：排序语义一致，同时保留手动前提。
- 决策：正交 3D 视角固定标签面，top/front/side 分别贴 `+Y`/`+Z`/`+X`，iso 保留 camera-facing。手动一键放置抽用自动装箱的 `placementScore`，但不复用自动装箱的候选生成和支撑前提；quickPlace 只生成手动极点候选并通过 `validateDraft()` 判定合法，同时尝试 `canRotate` 多朝向。
- 影响：俯视上层箱体标签不再因相机微小偏移抖动；一键放置落点从柜内深处开始并与作业回放低 x 优先语义一致。手动调整后的特殊状态仍由手动校验负责，不会被自动装箱前提误判。
- 后续：如果需要让一键放置按 `loadingMode` 细分落点，可在 `placementScore` 上增加模式参数并补回归；若需要更复杂候选，应先证明不会破坏手动支撑策略。

## 2026-06-05 手动旋转从 HTML 浮层改为场景内 3D 弧形手柄

- 背景：上一轮 `ManualRotateOverlay` 已把旋转、删除、朝向图和 XYZ 精调集中到选中箱体旁，但它仍是屏幕空间 HTML 面板。用户明确要求参考 EasyCargo，把旋转入口做成 Three.js 场景内弧形手柄，环绕货物本体，而不是把按钮贴到画布上。
- 选项：
  - 保留 HTML 浮层并只调整样式：改动小，但仍然不是场景内交互，透视、遮挡和相机跟随都不成立。
  - 删除 HTML 浮层，改为由 `ContainerScene` 生成 TubeGeometry 弧线和 ConeGeometry 箭头，作为独立 pickable 先于箱体命中。
- 决策：采用第二种。新增 `src/lib/rotationGizmo.ts` 负责手柄半径、弧形箭头、hover 材质和 dispose；`ContainerScene` 在选中箱体后双击切换手柄显示，手柄固定对应世界轴 left/right/up/down，命中后走既有 `onManualRotate(boxId, direction)`。旋转后的业务数据立即更新，渲染 mesh/edges 用约 200ms quaternion slerp 做视觉补间。
- 影响：`ManualRotateOverlay.tsx`、选中箱体屏幕投影回调、对齐按钮和 XYZ 精确输入面板被移除；精确移动改由既有快捷键承担（方向键 10mm、Ctrl/Cmd+方向键 1mm、PageUp/PageDown z 轴、Delete、Esc）。3D 手柄没有 DOM 节点，E2E 改为通过 `container-scene` 根上的 `data-gizmo-visible`、`data-gizmo-handle-count`、`data-selected-orientation` 和 `data-selected-axes` 验证状态。
- 验证：新增 `src/lib/rotationGizmo.test.ts` 覆盖半径、四方向 pickables、yaw/pitch 平面和 hover 材质；targeted 本地验证 `npx tsc -b`、`npx vitest run src/lib/rotationGizmo.test.ts`、`npx playwright test e2e/manual-3d.spec.ts --grep "弧形手柄|R 与 Shift|选中前"` 已通过。

## 2026-06-05 手动模式贴地旋转改为落地语义

- 背景：手动模式长期存在 `R` 后 `Shift+R` 期望到 `WHL`、实际停在 `WLH` 的 E2E 缺口。复核后确认根因不是朝向 reducer 不会生成 `WHL`，而是贴地箱体高度变化时沿用纯几何中心旋转会把箱体抬到 `z>0`，随后 `validateDraft` 以悬空问题阻断提交，用户看到的结果就是“旋转没反应”。
- 选项：
  - 继续沿用第二十九轮纯几何中心语义：数学一致，但贴地箱高度变化时容易悬空并被静默拒绝。
  - 只在水平面保持中心补偿，贴地箱旋转后重新落到 `z=0`；堆叠箱仍保留垂直中心补偿，避免被错误吸回地面。
- 决策：采用第二种。`applyOrientation()` 对 `box.z <= EPSILON` 的贴地箱使用 `z=0`，x/y 仍按尺寸差的一半保持中心补偿；非贴地箱继续按原有 z 中心补偿。同步补全世界轴四向旋转：左/右 yaw、上/下 pitch，`dryRunRotation()` 覆盖四个方向。
- 影响：关闭 2026-05-29 第二十九轮记录的手动旋转 `WHL` vs `WLH` 待裁定缺口；贴地箱不再因高度变化旋转被判定悬空。贴角旋转仍可能因 x/y 越界被显式阻断，语义不变。后续 UI 浮层可以直接暴露四向旋转按钮。
- 验证：新增 `src/lib/manualPlacement.test.ts` 覆盖贴地箱高度变化后 `z=0`、`R` 后 `Shift+R` 可到 `WHL`、left/right 与 up/down 互为逆旋转，以及四方向 dry-run。`npx vitest run src/lib/manualPlacement.test.ts` 通过 40 项。

## 2026-06-05 手动模式 3D 选中箱浮层替代旧工具栏

- 背景：手动模式原工具栏和右侧精调面板把旋转、删除、朝向图和 XYZ 输入分散在画布外，用户需要先理解键盘或侧栏才能调整选中箱体。PRD/Review 本轮目标要求选中货物后在其旁边浮现可操作图标，并移除旧工具栏和精调面板。
- 选项：
  - 保留旧工具栏和侧栏，同时增加浮层：短期兼容性高，但会形成两套入口，用户无法判断哪个是主路径。
  - 移除旧工具栏和侧栏，保留键盘快捷键，把旋转、删除、朝向显示和 XYZ 精调集中到 3D 选中箱浮层。
- 决策：采用第二种。`ContainerScene` 每帧投影选中箱体顶点并向 `Workbench` 回传屏幕坐标；`ManualRotateOverlay` 在 3D 画布内显示四向世界轴旋转、删除、朝向示意和可展开精调。旧手动工具栏、`manual-rotate-hint` 和 `ManualPrecisePanel` 删除；键盘帮助入口移到画布角落，所有原快捷键继续保留。
- 影响：手动 3D 的主操作入口从画布外侧栏变为选中箱旁浮层；最大化工作区时仍保留 pool 与测量列表，精调能力只在选中箱体后出现。E2E 断言从旧的空精调面板/旋转提示迁移到新浮层、帮助入口和 `manual-orientation-diagram` 数据载体。
- 验证：`npx tsc -b` 通过；targeted E2E `npx playwright test e2e/manual-3d.spec.ts --grep "R 与 Shift|浮层|键盘帮助|旋转提示|最大化保留|选中前不显示"` 通过 6 项，覆盖长期 `WHL` 朝向断言、新浮层出现/点击旋转、选中前隐藏和最大化保留关键工具。

## 2026-06-04 第三十二轮：全局堆叠层数兜底与 3D 朝向面标签

- 背景：第三十二轮 review 复核 `cargo-debug-snapshot (8).json` 后确认，顶层躺倒箱并非碰撞算法重叠，而是这批手动货物没有携带 `maxStackLayers`；同时 3D 同一标签在不同层显示 full/compact，造成上下大小不一致。
- 选项：
  - 继续只依赖货物级或导入模板默认 `maxStackLayers`：实现已存在，但手动录入批次不可达，用户仍会误以为“设了层数但没生效”。
  - 在装载规则层增加全局默认层数，并在 `calculatePacking` 入口对未自带值的货物兜底：货物自带值优先，缺省才用全局值，旧方案无全局值时保持不限制。
  - 3D 继续沿用 `buildBoxLabelModes()` compact 避让：遮挡减少，但同标签在不同箱体上字号不一致。
  - 3D 改为按相机方向选择 1-2 个可见面绘制统一 full 标签，其余面只保留色块：标签字号一致，背向面不再重复画字。
- 决策：采用全局默认层数兜底 + 3D 朝向面标签。`PlacementSettings.defaultMaxStackLayers` 按用户/浏览器持久化；`calculatePacking(..., { defaultMaxStackLayers })` 在扩展货物条目时填充缺省 `maxStackLayers`。3D `ContainerScene` 根据当前相机到箱体中心的本地方向选择标签面，OrbitControls change 时刷新材质分配；2D 仍保留现有 compact 避让。
- 影响：手动添加、导入、历史恢复、项目导出/导入、柜型对比、调试快照和 Excel 明细都能看到同一个全局层数规则；设置全局 2 层时未自带层数的货物不会继续码到第三层或顶层躺倒填充。3D 同一标签在可见面上保持 full 大小，未朝向相机的面不再绘制文字。
- 验证：新增 `src/lib/packing.test.ts` 覆盖全局默认限制与货物自带覆盖，并用 20GP + 400×500×600 密集货物回归确认无限制时会出现 `LHW` 顶层补装、全局 2 层时该补装消失；新增 `src/lib/cameraFacingLabels.test.ts` 覆盖相机方向到本地面的选择；新增 E2E `applies global max stack layers to cargo without per-item limits` 覆盖 UI 设置、明细表已装/未装和层数结果；新增 E2E `moves 3D labels to camera-facing faces across camera views` 覆盖 3D iso/front/side/top 朝向面切换。聚焦 Vitest、`npx tsc -b`、`npm run lint`、`npm test`、`npm run build` 和两项 targeted E2E 已通过；完整本地 `npm run test:e2e` 为 76 passed / 1 skipped / 1 failed，唯一失败仍是既有 `e2e/manual-3d.spec.ts:170` 手动旋转语义待裁定事项，与本轮无关。2026-06-05 部署到 `http://101.33.232.150/` 后，远程 targeted E2E `global max stack|moves 3D labels` 通过 2 项；远程 full E2E 为 76 passed / 1 skipped / 1 failed，唯一失败仍是同一手动旋转语义待裁定事项。

## 2026-06-04 第三十一轮：快照 5/6 显示问题不改变装箱几何

- 背景：`cargo-debug-snapshot (5).json` 中 A/Q 看起来交叉，但三维包围盒复核没有实体重叠；`cargo-debug-snapshot (6).json` 中 T 货物在特定旋转态视觉消失，数据仍存在且手动校验没有报错。
- 选项：
  - 修改装箱碰撞或支撑算法：可能掩盖显示问题，并影响已验证的深度优先作业顺序和支撑关系。
  - 在显示层处理标签歧义和非法渲染 basis：保留当前几何结果，只修用户看到的复核视图。
- 决策：选择显示层修复。快照 5 类同柱位多层标签在全层/全标签视图中使用 `buildBoxLabelModes()` 降级被上层覆盖的标签；选中、高亮、指定层或指定标签时仍显示完整标签。快照 6 类 determinant `-1` 的 signed axes 使用 `orientationRenderingBasisVectors()` 归一化为右手系 basis 后再生成 Three.js quaternion。
- 影响：2D 与 3D 视图会减少全层堆叠标签互相覆盖造成的“实体交叉”误读；3D 不再把反射矩阵直接交给 `setFromRotationMatrix()`。装箱坐标、碰撞检测、支撑校验、导出和历史数据不变。
- 验证：新增 `src/lib/orientationTransform.test.ts` 覆盖 `{ x:'L-', y:'H-', z:'W+' }` 从 determinant `-1` 到 rendering determinant `+1`；新增 `src/lib/labelDeconfliction.test.ts` 和 `src/components/ContainerPlan2D.test.tsx` 覆盖同投影堆叠标签降级；新增 E2E `downgrades covered all-layer 2D labels while keeping top labels readable` 覆盖真实 UI。远程 targeted E2E 通过 7 项；远程 full E2E 为 74 passed / 1 skipped / 1 failed，唯一失败仍是既有 `WHL` expected vs `WLH` actual 手动旋转语义待裁定事项。

## 2026-06-04 第三十一轮：最大堆叠层数按垂直支撑链解释

- 背景：第三十一轮 review 要求在“允许堆叠”后增加最大堆叠层数，并贯穿自动装箱、手动校验、导入导出和历史方案。PRD 未定义该层数是按同 SKU、同标签还是所有支撑链计数。
- 选项：
  - 按同 SKU / 同标签计数：贴近部分包装规则，但需要额外业务字段定义“同类”和混合支撑时的归属。
  - 按垂直支撑链计数：地面箱体为第 1 层，上方每层 +1，和当前支撑/悬空校验可直接衔接。
- 决策：第一版采用**垂直支撑链层数**。`maxStackLayers` 为可选字段；缺省或小于等于 0 表示沿用旧行为、不限制层数。不可堆叠仍由 `stackable=false` 独立阻断。
- 影响：自动装箱在候选点校验时拒绝超过当前货物 `maxStackLayers` 的放置；手动排布超过层数时产生 blocking issue `max-stack-layers`。导入模板、Excel/CSV 导入、导出明细、历史方案和通知栏均保留该字段。
- 已知 E2E 状态：本轮新增的最大化隐藏统计条、手动容量卡隐藏、最大堆叠层数表单、导入导出字段和吸附单元测试通过。完整本地 `npm run test:e2e` 结果为 73 passed / 1 skipped / 1 failed；失败仍是既有 `e2e/manual-3d.spec.ts:170` 中 `R` 后 `Shift+R` 期望 `WHL`、实际 `WLH` 的手动旋转语义待裁定事项，与本轮工作区/吸附/堆叠参数实现无关。远程完整 E2E 结果为 72 passed / 1 skipped / 2 failed；除同一个手动旋转失败外，另一个 `shows failure reason in the detail table for unplaced cargo` 是 `page.goto('/')` 超时，该用例随后针对同一远程地址单独重跑通过。
- 后续：如业务需要按同 SKU、同标签或支撑货物承载强度细分，需要新增明确字段和测试，本轮不混入。

## 2026-06-02 第三十轮：装柜步骤图第一版采用阶段合并

- 背景：用户提出新增类似 EasyCargo 的「任务分解图」。经讨论确认，这不是项目管理任务拆解，而是面向现场装柜执行的分步装柜说明，应命名为「装柜步骤图」/ `Loading Steps`。
- 选项：
  - 每箱一步：实现直接，但真实业务可能产生上百个步骤，打印和现场执行成本过高。
  - 阶段合并：按连续 `workStep` 把同层、相邻区域、同标签或兼容标签的箱体合并成可执行阶段，仍允许回钻到箱体明细。
- 决策：第一版采用**阶段合并**。阶段生成必须以 `PackingResult.workSteps` 和 `PlacedBox.workStep` 为唯一顺序来源，继承第二十九轮已经确认的深度优先装柜语义；不重新计算装柜顺序，也不改变几何摆放算法。
- 影响：新增的步骤图应展示阶段列表、标签统计、数量、层级、空间范围和当前阶段高亮；阶段必须保留 `boxIds`、`stepStart/stepEnd`，确保不丢失任何已装箱体。跨 `physicalLayer`、明显深度段或支撑状态变化明显时应拆分阶段，不能为了减少阶段数损害现场理解。
- 验证：新增 `src/lib/loadingTaskGroups.test.ts` 覆盖同层合并、跨层拆分、深度段拆分、支撑状态拆分和不丢箱；目标 E2E `装柜步骤按阶段合并显示并高亮当前阶段` 通过。完整本地 E2E 仍保留既有手动旋转 `WHL` vs `WLH` 失败，与本轮自动装柜步骤图无关。
- 后续：先新增可单测的纯业务模块生成 `LoadingTaskGroup[]`，再接结果区「装柜步骤」Tab；打印/导出步骤图作为后续小步任务单独实现。

## 2026-05-30 第二十九轮：自动装箱作业顺序按最终深度优先重排

- 背景：用户提供 `C:\Users\BA_H3C_Pad\Downloads\cargo-debug-snapshot (4).json`，指出当前算法应从集装箱里边往外装，但快照中最内侧顶部补装箱被安排到很晚才装。
- 证据：快照中 210 个自动排布箱体没有几何越界/重叠；但 `physicalLayer=1` 的 `workStep` 跨到 `1..171`，其中 `x=0,z=1800` 的顶部补装箱为 `169..171`，而第一个外侧深度 `x=400` 已在 `workStep=13`。
- 决策：本轮不改变极点贪心几何摆放，只在 `assignDepthLayers(placed)` 后按最终坐标重排 `workStep`，排序键为 `x -> y -> z`，使回放、作业清单和分层查看共享「从内向外」的深度优先语义。
- 影响：`workStep` 不再等同于贪心插入顺序，而是最终装柜作业顺序；几何摆放坐标、支撑校验、装载率和标签统计不变。`loadingMode=input/weight/quantity/volume` 仍决定候选货物的优先级和最终空间结果，但最终回放会按物理深度顺序展示。
- 验证：新增 `src/lib/packing.test.ts` 回归测试，修复前失败 `expected 171 to be less than 13`，修复后通过。`npm test`、`npm run lint`、`npm run build` 通过；相关 E2E `作业回放面板按 workSteps 顺序逐步显示箱体` 通过。
- 已知 E2E 状态：完整 `npm run test:e2e` 首次失败是因为 Vite 代理请求 `127.0.0.1:3010` 时本地后端未运行；启动 `PORT=3010 npm run start:server` 后重跑，自动排布/回放相关用例通过，剩余 1 个失败仍是既有的手动模式 `R` 后 `Shift+R` 方向图断言 `WHL` vs 实际 `WLH`，与本轮自动装箱 `workStep` 重排无关，延续 2026-05-29 的手动旋转语义待裁定事项。

## 2026-05-29 第二十九轮：手动旋转改为绕箱体几何中心

- 背景：用户连按 R 的四个调试快照（`cargo-debug-snapshot*.json`）显示，旋转时 `x/y` 不变、`length/width` 互换，导致几何中心在 `(1800,1900)` 与 `(1850,1850)` 间来回跳。用户明确要求「旋转应该按照中心来旋转」。
- 选项：
  - 纯几何中心：补偿 `x/y/z` 使旋转前后 `(cx,cy,cz)` 完全不动；Shift+R 改变高度时箱体可能下穿地面/上穿柜顶，由现有校验提示越界。
  - XY 绕中心 + 保持落地：只补偿水平面，z 方向保持贴地不下沉。
- 决策：采用**纯几何中心**（用户确认）。在 `applyOrientation` 内按尺寸差的一半补偿 `x/y/z`，因此 `rotateBoxRight90`、`rotateBoxDown90`、`setManualBoxOrientation`（六向 picker）共用同一中心轴心规则。
- 影响：
  - 贴柜角（如 `x:0 y:0`）的箱体旋转后可能越界——这是几何中心旋转的既定代价，由 `validateDraft` 的 boundary 校验显式提示，不静默纠正。
  - 调整了 `dryRunRotation` 的「fits」夹具改为带余量的居中放置，并新增「贴角旋转触发 boundary」用例锁定该取舍；新增 `rotateBox` 绕中心不变的单测复现快照场景。
- 后续：如果业务希望旋转后自动夹回容器内（而非提示越界），需在 reducer 后追加一个 clamp 步骤；当前不做，保持「失败显式提示」语义。
- 已知 E2E 缺口（非本轮回归）：`e2e/manual-3d.spec.ts:160`「手动模式 R 与 Shift+R 更新朝向示意图」断言 `R` 后再 `Shift+R` 得到 `orientationKey='WHL'`，但 reducer 实际产出 `WLH`（单测 `keeps the current vertical axis fixed when R is pressed after a downward rotation` 锁定的就是该序列）。用 `git stash` 暂存本轮改动后该用例在干净 HEAD 同样失败，证明与本轮「绕中心」位置补偿无关——本轮只改 `x/y/z`，未触碰 `orientationAxes/orientationKey/yaw/pitch`。按规则不弱化断言来强行通过，先记录：该 E2E 期望值与 reducer 的组合旋转语义不一致，需在下一轮单独裁定（修 E2E 期望为 `WLH`，或按产品意图调整组合旋转 reducer），不在本轮位置修复范围内。

## 2026-05-29 第二十八轮：真实 3D 旋转作为标签朝向来源

- 背景：第二十五到第二十七轮连续修复标签旋转，但实现仍把 3D 箱体保持轴对齐，只在每个面贴不同旋转角的 canvas 标签。用户指出应该按旋转轴角度思考，不能继续用逐面角度表模拟。
- 选项：
  - 继续维护 `labelRotationForManualFace` 这类逐面角度表，短期改动小，但复合旋转会继续遗漏。
  - 改为 signed axes → 真实旋转矩阵，3D 用原始 L/W/H 几何体整体旋转，2D 只从同一 signed axes 推投影面角。
- 决策：采用真实 3D 旋转模型。新增 `orientationTransform` 作为朝向数学唯一来源；`ContainerScene` 按原始尺寸建 geometry 并给 mesh/edges 应用 quaternion；2D 手动/自动视图从 `faceLabelRotation(orientationAxesOf(box), view)` 取角度。自动装箱结果不改 `packing.ts`，消费端从 `orientationKey` 推 canonical axes。
- 影响：3D 标签方向由物理 mesh 旋转决定，贴图内部保持正立；拾取、hover、ghost 和拖拽仍以放置后的包围盒中心和尺寸做业务校验，不改变碰撞/支撑算法。
- 后续：如果未来自动装箱也要表达 180/270 的 signed pose，需要让 `packing.ts` 直接产出 `orientationAxes`，否则 canonical axes 只能表达同一 `orientationKey` 下的一种默认姿态。

## 2026-05-25 第十九轮：浮动最大化 / 中键平移 / Admin 主导航

- 决策：
  - **最大化保留 pool 与 precise panel**：用户进入手动模式就是为了拖货物，最大化时若隐藏 pool 等于「能看不能动」。仅隐藏 site header / 主 sidebar / report panel。按钮浮动右上角不挤工具栏。
  - **中键 PAN 优先级**：手动模式 LEFT=null(drag) / MIDDLE=PAN / RIGHT=ROTATE / WHEEL=zoom。自动模式仍然 LEFT=ROTATE / MIDDLE=DOLLY / RIGHT=PAN（与 3D 浏览习惯一致）。
  - **Admin 主导航三入口**：在 nav 数组里追加，受 `currentUser.role === 'admin'` 条件控制。原右上角 user pill 紫色按钮保留作为冗余入口。
  - **release notes 自维护**：每轮提交时手动在 `src/data/releaseNotes.ts` 首位追加；不从 CHANGELOG 自动抽取。

## 2026-05-25 第十八轮：最大化 / 边缘吸附 / 车型联动 / 站内通知

- 背景：用户希望 3D 工作区更大、吸附更智能、Balance 与具体车型联动，并在站内推送新版本说明。
- 决策：
  - **最大化用 CSS `hidden` 类**：不 unmount sidebar / report 等组件，避免 ContainerScene Three.js 场景被销毁重建。Esc + 按钮双入口退出。
  - **边缘吸附阈值 30 mm，优先级 wall > 邻箱边 > center**：吸附应用顺序 surface-snap → edge-snap → grid-snap，让最靠物理含义的对齐胜出。Toggle 默认开启。
  - **4 个车型 profile 阈值经验值**：semi-trailer 严格 X±10%/Y±5%，flatbed 放宽 X 但严格 Z 上限，box-truck 整体更宽容，container-only 不绘制拖挂。这些阈值不是行业标准，仅作初版默认；后续可由 PM 调整。
  - **站内通知按用户隔离**：localStorage key 含 `userId`，避免多账号共用浏览器互相影响。匿名用户用 `anonymous` 作为后缀。
  - **release notes 版本字串可字典序排**：用 `2026-05-25-r18` 这种 ISO 日期 + 轮次后缀。手动维护数组，新版本插到首位；不自动从 CHANGELOG 抽取（CHANGELOG 是开发视角，release notes 是用户视角）。
- 影响：
  - 最大化模式下 Esc 全局键盘事件可能与其它快捷键冲突；当前限定在 `manualMaximized=true` 时才挂载 listener。
  - 边缘吸附 + 网格吸附同时开启时，边缘吸附胜出（因为更精确），用户应能感知到「贴墙优于网格」。
- 后续：
  - 用户偏好持久化（默认柜型 / 默认车型）下一轮做。
  - release notes 自动从 commit 抽取需要 CI 配合，留作未来。

## 2026-05-24 第十七轮：drop 保留 z + ghost 红绿守门

- 背景：第十六轮的 pool ghost 看起来工作正常，但 drop handler 仍只用 ground plane 投影 → 任何上层落点都被悄悄改回地面。Ghost 颜色固定绿色，越界/重叠/悬空无视觉反馈。
- 决策：
  - **drop signature 扩展为可选 z**：保留旧 callers（2D drop）的 (x, y) 调用，避免破坏；3D 路径始终带 z。`makeManualBox` 同样可选 z。Workbench 内部用 `typeof dropZ === 'number'` 区分 3D 路径（顶端坐标直接落地）和 2D 路径（仍是 cursor centre）。
  - **`computeInvalidByGeometry` 通用化**：把 entry-based 校验抽成「直接接收 boxId+尺寸」的版本。dragover 和真实 box drag 都消费它，复用同一份「越界/重叠/支撑」规则。Pool ghost 没有真实 boxId，传 null，校验函数把 null 当成「没有自己要排除」。
  - **drop 守门**：red ghost 时 onDrop 直接 return，不调 handler。决策考量：让 commit-time 校验做安全网（validateDraft 还在），但 user-facing 体验上「红色 → 松手 → 没放下」更可预期。
  - **data attribute 暴露**：`data-pool-ghost-invalid` 直接通过 setAttribute 写到 mount root，避免每次 dragover 都 setState 触发 React 重渲染（dragover 60fps）。
- 影响：
  - 用户能从 pool 拖货物贴附到任何已放置箱顶 → 一手势完成上层放置，不再「看到 ghost 上去松手又落地」。
  - red ghost 时 drop 拒绝，需要用户调整位置；不会出现「点 commit 失败提示后再调」的二段流程。
- 后续：
  - dragover 旁的浮动文字提示（具体原因：越界/重叠/悬空）下一轮做。
  - box drag 也可以加同样的 data-attribute 暴露。

## 2026-05-24 第十六轮：Pool ghost / Snap 50% / Precise panel / Fill cap

- 背景：第十五轮上线后，用户报 (a) pool 拖 cargo 进 3D 必须松手才显示；(b) 把箱子从底层往上叠 ghost 贴附 OK 但松手又回原位；(c) 一键补装直接卡死浏览器。
- 决策：
  - **Pool drag ghost**：dragstart 时 Workbench 把货物 size+color 推给 ContainerScene 的 `poolDragInfo` prop；dragover 在 ContainerScene 内 raycast + 渲染 ghost；dragleave / dragend / drop 清理。这是 dataTransfer 在 dragover 期间不可读的标准 work-around。
  - **Surface snap 50% guard**：放进 `resolveDropTarget`，与 `MIN_SUPPORT_OVERLAP_RATIO=0.5` 保持一致。两层尝试：先 cursor-centred，不够再 surface-centred，再不够直接 fall through 到地面。这避免了「ghost 跳上去 → commit 失败 → box 跳回」的视觉跳动。
  - **Precise panel 默认显示位置**：右侧 72-rem 宽。即使没有选中，也显示「点选箱体微调」提示，这样用户能马上看见有此功能而不是要先选中才发现按钮存在。
  - **Fill 每次 50 件上限**：固定常量 `STANDARD_BOX_MAX_PER_CLICK = 50`。比起把数字做成 setting，硬编码 50 + UI 文案明确告知「重复点击」更直接。卡死的根因是 packing algorithm 对大数 cargo 的 O(n²) 行为，本轮不重写算法；50 件经验值是「点完不卡顿且能看到效果」的阈值。
- 影响：
  - 用户拖 pool 货物期间 ghost 始终可见，落点直观。
  - 大箱叠在小箱上不再「跳上去又跳回」，直接保持地面（用户能再次拖动到合适位置）。
  - 一键补装不再卡死，但需要用户重复点击 N 次才能装满。
  - Precise panel 显示后让手动模式工具栏从「全靠键盘+快捷键」变为「显式可见的输入框 + 对齐按钮」。
- 后续：
  - 拖拽 invalid 文字提示（ghost 旁浮动「✗ overlaps box B」之类）延后到下一轮做；现在仍靠 ghost 红色 + manualIssues 面板。
  - Packing algorithm 性能优化（让数千 cargo item 不卡死）需要单独立项；本轮只截断上限。

## 2026-05-24 第十五轮：贴附拖拽 / 旋转预检 / 补装建议 / 重心 3D 化

- 背景：用户反映「把 A 放到 B 上面」目前必须先 XY 然后 Shift+Z 两段操作；旋转失败没有原因说明；重心 tab 只有数字没有空间感。
- 决策：
  - **贴附拖拽 (Surface snap)**：drag 时先 raycast 其它箱顶面，命中则把被拖箱贴上去；未命中回落地面。Shift+drag 仍是「精细 Z 模式」。最近距离命中的箱子优先；若贴附后会超过柜顶高度则跳过该候选。
  - **旋转预检**：`dryRunRotation` 在不改 draft 的前提下校验，把 issue 翻译为人类语言（差 X mm / 与 B 重叠 / 支撑不足）。点旋转无效时不改 state，只显示 `rotation-notice` banner，可关闭。
  - **剩余容量**：体积 / 重量 / 占地三维度；其中「占地」只统计 z≈0 的箱，避免堆叠多计。MaxWeight=0 时 weightRatio=0（除零防御）。
  - **补装建议候选**：先内置 4 个 preset（Small / Medium / Large / Pallet）。`maxCount = min(volumeCap, weightCap)`；这是上限值，文案明确告知「实际能否装下需重新计算」。未来如需更多 preset 可扩 `src/data/standardBoxes.ts`。
  - **重心安全范围阈值**：X ±10% / Y ±5% / Z 在容器高度的 10%-70%。与第十四轮的 COMFORT 5% / CRITICAL 10% 一致。拖挂示意图按常见 HGV 比例硬编码（cab 长 2.5 m，前轴 600 mm，后轴在拖挂尾部 1.5 m）；不追求 CAD 精度，仅作示意。
  - **CoG overlay 仅自动模式生效**：手动 draft 没有 packing result 的 cog 概念（用户自己拖动，不需要 overlay 干扰）。切到手动模式或切 placementMode 自动 dispose。
- 影响：
  - 拖动选中箱体时若鼠标 hover 在其它箱上方，会自动「贴」上去；用户必须明白这是 feature 而非 bug。文案 hint 「manualRotateHint」已经提示右键旋转，但贴附行为还需要时间观察用户反馈是否需要 toggle 关闭。
  - 剩余容量面板始终显示（手动模式下），即使用户没放任何箱也会显示 100% 剩余。这是预期行为。
- 后续：
  - 拖拽 hover 浮动文案「合法 / 不合法（具体原因）」尚未做，下一轮加。
  - Fill suggestion 「Add to cargo」按钮已实现 push 货物，但 E2E 端到端验证「重新计算后 placedCount 增加」延后做。
  - 重心 overlay 默认关闭；若产品希望默认开启，调 `useState(false)` 即可。

## 2026-05-23 安全加固（审计 + 修复）

- 背景：第十四轮远程部署后用户发现 `http://101.33.232.150/%EF%BC%89%EF%BC%9A**52` 返回 200。借此机会做完整安全审计。两份并行 audit（后端 + 前端）+ `npm audit` 列出 30+ 问题。
- 决策：
  - **JWT_SECRET**：生产强制 ≥32 字符且不等于默认 dev secret；缺失则 fail-fast。本地/dev 仍可用默认值。
  - **JWT algorithm pinning**：sign / verify 显式 `HS256`，并校验 token 的 `iat` 不早于 `password_changed_at`，密码修改后旧 token 失效。
  - **默认密码**：保留 `admin / admin123` 与 `testuser / testuser123` 作为种子，但 `ADMIN_PASSWORD` env 可幂等轮换；生产没设 `ADMIN_PASSWORD` 时 warning。E2E 依赖 testuser，保留；`SKIP_TESTUSER=1` 可禁。
  - **rate limit**：login + change-password 生产 30/15min，开发/CI 300/15min；register 生产 10/h，开发 100/h；通过 env `AUTH_LIMIT_MAX` / `REGISTER_LIMIT_MAX` 配置。E2E 远程跑 50 用例需要 500 上限。
  - **body size**：2 MB（API），nginx 3 MB（兜底）。
  - **错误消息**：统一 `Internal server error`；细节只入服务器日志。
  - **`/api/*` 未知路径**：返回 JSON 404，不进入 SPA fallback；nginx 静态 SPA fallback 保留（合理行为）。
  - **xlsx@0.18.5 漏洞**：知道有 prototype pollution + ReDoS，npm 上无修复版本。本轮选择「缓解」：5 MB 文件大小限制 + try/catch 不暴露错误。完整迁移到 maintained 分支留作 follow-up。
  - **CSP**：允许 `'unsafe-inline'` 仅 style（Tailwind 内联样式刚需）；script 严格 `'self'`，无 `unsafe-eval`、无 `unsafe-inline`。
  - **`server/database.db` 进入历史**：本轮 `git rm --cached` 并 .gitignore；现有历史仍含 bcrypt hash，记入 follow-up（建议生产环境用 ADMIN_PASSWORD 轮换 admin 密码后通知所有用户改密码）。
- 影响：
  - 旧 token 在生产升级后即失效，所有客户端需要重新登录。
  - `xlsx` 漏洞缓解而非彻底修复；如果将来出现 PoC 攻击，需要切到 maintained 分支。
  - rate limit env 变量未配置时 prod 用 30/15min，可能影响压力测试 — 文档已写明 `AUTH_LIMIT_MAX` 调整方式。
- 后续：
  - 切 xlsx 到 `@e965/xlsx` fork 或迁移到 exceljs。
  - 接入 HTTPS（需要域名 + Let's Encrypt），打开 HSTS preload。
  - 考虑把 JWT 从 localStorage 改为 HttpOnly + SameSite=Strict cookie，需要前端 + nginx 配合改。
  - 在 git history 中 purge `server/database.db`（`git filter-repo`）并强制所有现有用户改密码。

## 2026-05-23 第十四轮：去除 viewLocked / 重心阈值 / 多柜对比推荐 / Balance 命名

- 背景：第十三轮的 viewLocked toggle 被用户实测为「无差异」；自动模式默认相机锁定违反直觉；同时需要在结果区加入运输安全 + 采购决策两个 PM 维度。
- 决策：
  - **去除视角锁定**：自动 + 手动模式都允许旋转视角（手动右键旋、自动左键旋）。提供 `reset-view` 按钮回 iso。`data-interaction-mode` 简化为 `auto` / `manual`。
  - **重心阈值**：COMFORT 5%（绿色 balanced）、CRITICAL 10%（红色 warning）、之间黄色 cautious。比例按各轴 |offset| / 对应柜尺寸计算。
  - **多柜对比推荐**：优先选「fit=full 且体积最小」的柜型；若没有 full，按 placedCount desc → volume asc 排序。
  - **英文 Balance 命名**：原 `Load center` 与左下角 `Load` 按钮冲突 Playwright strict-mode，改为 `Balance`（中文仍为「装载重心」）。
- 影响：
  - 所有旧的 `toggle-view-lock` / `manual-locked` E2E 断言全部重写为 `data-interaction-mode=auto|manual` + `reset-view`。
  - PlaybackPanel 的 `PlaybackSpeed` 类型从 hook 单源 import；后续添加更多 hook 时统一从 `src/hooks/` 导出。
- 后续：拆 Workbench 子组件（>2400 行）下一轮做；多柜对比可加柱状图可视化。

## 2026-05-23 第十三轮：视角语义统一 / 建造游戏化 / 作业回放

- 背景：第十二轮上线后，用户发现「自由视角」按钮与拖拽行为互斥；3D 编辑器缺少现代建造工具的实时反馈；自动排布结果缺少面向装卸工的「按顺序操作」入口。
- 决策：
  - **视角语义**：移除「自由视角」按钮所代表的互斥模式。统一为「锁定视角 / 解锁视角」toggle。自动模式默认锁定（相机不动），解锁后才能旋转；手动模式默认解锁（右键旋转 + 左键拖箱），锁定后用于精细调整。`data-interaction-mode` 取值：`locked` / `free` / `manual` / `manual-locked`。
  - **网格吸附步长**：50 mm。50 是常见栈板和木箱单位的最大公约数；500 mm 太粗、10 mm 太细。Toggle 默认开启；以后若有客户需要可配置。
  - **物理支撑阈值**：沿用上一轮 50% 投影重叠规则；ghost / drop / 键盘移动统一受控。
  - **作业回放仅自动模式可用**：手动 ManualDraft 没有可比的 workSteps（用户自定义顺序），强行支持会引入歧义。手动模式下回放面板提示 `playback-panel-empty`。
  - **回放导出**：本轮先导出 Excel `loading-instructions.xlsx`，PDF 留到下一轮。
- 影响：
  - 旧 E2E 中 `Free view` / `manual-free` 断言全部失效；改写为 `toggle-view-lock` + `manual-locked` 断言。
  - `freeViewEnabled` 状态被 `viewLocked` 取代，`enableFreeView/selectSceneView` 取消互斥逻辑。
- 后续：相机切换 lerp、复制粘贴、多选、播放时高亮当前 step 对应 box（已基本实现，未来可加入相机自动 follow）等下一轮再做。

## 记录格式

```md
## YYYY-MM-DD 决策标题

- 背景：
- 选项：
- 决策：
- 影响：
- 后续：
```

## 2026-05-20 分层按支撑深度生成

- 背景：PRD 要求分层查看表达真实堆叠关系，不能简单按 `z` 高度过滤；混合高度货物可能导致同一堆叠层出现在不同高度。
- 选项：按高度区间分层；按支撑关系递归分层；按装柜先后步骤分层。
- 决策：物理层使用支撑深度生成：落地箱为第 1 层，放在其他箱体上的箱体为其支撑箱体最大物理层 + 1；作业步骤继续使用计算放置顺序。
- 影响：同一物理层可以包含不同 `z` 高度的箱体，2D、3D、明细和导出应统一消费 `PackingResult.layers` 和箱体上的 `physicalLayer`。
- 后续：在 2D、3D 透明层、明细表和导出中继续接入同一层级数据，避免各视图自行计算层级。

## 2026-05-20 导入字段映射采用确定性实现

- 背景：`FEATURE_SPEC.md` 提到 LLM 辅助 Excel 字段映射；PRD 12.2 要求为后续 AI 字段映射预留接口；仓库规则要求确定性转换不要交给 LLM。
- 选项：本期接入运行时 LLM；本期使用确定性字段映射并保留结构化映射结果；暂不处理非标准表头。
- 决策：本期采用确定性字段映射、单位转换和导入状态摘要，覆盖 PRD 示例字段；不引入运行时 LLM 调用。
- 影响：导入结果可测试、可重复，用户能看到识别字段、导入行数和厘米换算行数；复杂未知表头仍需要后续 AI/手动映射扩展。
- 后续：如果后续接入 AI，优先在 `parseCargoRows` 前增加结构化映射层，输出同样的内部字段和摘要，不改变装箱计算与视图消费模型。

## 2026-05-20 装载模式只控制排序策略

- 背景：PRD 要求左侧操作区包含装载模式，但未定义具体业务模式；装载模式如果只展示不影响计算，会形成无效入口。
- 选项：保留单一默认模式；增加多个复杂装箱策略；先提供可解释的排序策略模式。
- 决策：本期提供 `volume` 体积优先和 `input` 录入顺序两种模式。二者共享同一合法性校验、支撑关系和分层逻辑，只改变待装货物排序。
- 影响：默认保留既有体积优先结果；需要按业务录入顺序规划作业步骤时可切换到录入顺序模式。
- 后续：如需更多模式，应继续作为确定性排序/评分策略接入，不在 UI 中添加无计算含义的选项。

## 2026-05-20 Review 首批装载规则边界

- 背景：review 要求 archive 中的规则控件不能继续作为静态说明，必须可选并进入当前计算或展示逻辑。
- 选项：一次性迁移 archive 的托盘、配重、承载软约束、层透明度等全部规则；或只开放当前算法能确定性支持的规则，其余暂缓。
- 决策：首批开放体积优先、重量优先、数量优先、录入顺序四种排序规则，全部进入 `calculatePacking`。有效边界、载重、支撑和堆叠继续作为硬约束展示，不提供关闭入口。
- 影响：UI 不再出现“可点但不生效”的装载规则；E2E 和单元测试可以证明规则选择会改变装柜作业顺序。
- 后续：archive 中的托盘模式、前后配重偏差、软承载规则、层透明度输入等暂不展示为可用控件，待算法/视图模型明确后再接入。

## 2026-05-20 远端添加货物回归根因

- 背景：生产地址 `http://101.33.232.150/` 上默认中文界面点击 `+ 添加货物` 后，新增货物没有出现在货物列表。
- 选项：只重新部署当前构建；改用 HTTPS；让客户端 ID 生成兼容没有 `crypto.randomUUID()` 的普通 HTTP 环境。
- 决策：保留当前 HTTP 部署方式，先修客户端 ID 生成。生产公网 HTTP 不是安全上下文，浏览器里 `crypto.randomUUID` 为 `undefined`，点击添加货物时直接调用会抛错并中断提交。新增 `createClientId`，可用时使用 `crypto.randomUUID()`，不可用时退到时间戳和随机数。
- 影响：手动添加货物、Excel/CSV 导入和历史方案保存不再依赖安全上下文；后续如果迁移 HTTPS，仍会自动使用原生 UUID。
- 后续：部署后必须重跑 `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ npx playwright test e2e/container-calc.spec.ts -g "adds cargo from the default Chinese workspace|adds cargo when browser randomUUID is unavailable" --project=chromium`。

## 2026-05-20 Playwright 不复用本地服务

- 背景：本地 5174 端口已有另一个 checkout 的 Vite 服务，`reuseExistingServer: true` 导致本仓库 E2E 误跑旧服务。
- 选项：保留复用并人工清理端口；改用专用端口但继续复用；改用专用端口并关闭复用。
- 决策：默认使用 5176，并关闭本地 `reuseExistingServer`。如果端口被占用，测试应直接失败而不是静默跑错应用；远端测试继续通过 `PLAYWRIGHT_BASE_URL` 跳过本地 webServer。
- 影响：本地 E2E 会稍慢，但结果能证明当前仓库代码；避免线上修复验证被旧服务污染。
- 后续：如需并行测试，可通过 `PLAYWRIGHT_PORT` 显式分配端口。

## 2026-05-21 引入 SQLite 数据库与 JWT 账号认证

- 背景：第四轮 Review 要求引入用户账号与管理员管理功能，支持历史方案与自定义柜型数据的云端隔离存储，防止设备更换或多访客数据混叠。
- 选项：
  1. 使用前端 Mock + LocalStorage 模拟身份。
  2. 引入轻量级 SQLite + JWT 认证机制的 Node.js/Express 服务。
- 决策：选择选项 2。使用 `better-sqlite3` 实现零配置 SQLite 单文件数据库，通过 Express/JWT 存储 session 凭证，在客户端将本地历史存储重构为 HTTP API 调用。
- 影响：实现了强身份状态保持和严格的数据隔离。未登录访客自动重定向，不同用户数据彻底隔离，管理员可操作用户表（禁用/删除），且为远程端到端测试提供了确定性的用户认证隔离场景。
- 后续：API 遵循 RESTful 规范，为后续扩展到其他客户端形态（如小程序、独立桌面端）奠定基础。

## 2026-05-21 装箱算法支持 6 轴完整旋转（含侧放与倾斜）

- 背景：原来的算法仅支持 2 种朝向（水平旋转），在装载 400x500x600 的箱子时无法有效利用垂直高度，造成大量垂直高度浪费（空间利用率不足）。
- 选项：
  1. 维持既有 2 种朝向。
  2. 扩展为 3D 空间下完整的 6 种朝向（长、宽、高互换），并通过体积/重量等策略进行层叠优化。
- 决策：选择选项 2。重构 `orientations()` 生成去重后的 6 轴朝向；优化装箱堆叠评分机制，遍历所有有效方向，最大化可堆叠层数。
- 影响：算法能自动选择侧放/倾斜（将 400mm 或 500mm 作为高度），从而将 80 个 400x500x600 货物在 40HQ 中的堆叠层数由原来的 3 层提升到 5 层以上，空间利用率和装载件数显著提升。
- 后续：通过 unit-tests 保障 6 轴放置时不重叠，且完美兼容物理支撑关系判定。

## 2026-05-22 标签朝向由 PackingResult 输出

- 背景：第七轮 Review 要求旋转货物的标签跟随箱体朝向旋转；当前 UI 只能看到实际长宽高，无法可靠判断原始长宽高映射关系。
- 选项：在 2D/3D 组件里根据实际尺寸猜测；在 `PlacedBox` 中输出朝向元数据；把整个箱体改为 Three.js 旋转矩阵渲染。
- 决策：在 `PlacedBox` 中输出 `orientationKey` 和 `labelRotationDeg`。`orientationKey` 记录原始长宽高到实际放置尺寸的离散映射，`labelRotationDeg` 记录标签渲染需要的离散角度。
- 影响：2D、3D、明细和后续导出可以消费同一份朝向数据，避免每个视图自行猜测；本阶段不引入复杂四元数或手动旋转编辑。
- 后续：如果后续需要更精确表达每个面的标签方向，再在 `PlacedBox` 上扩展 face-level orientation，而不是推翻当前字段。

## 2026-05-22 Excel 映射弹窗升级为导入确认工作台

- 背景：当前智能字段映射弹窗只有下拉框，用户无法看到源表格、样例数据、单位判断和换算结果。
- 选项：继续保留简单下拉；在弹窗中增加源数据预览和单位选择；引入运行时 LLM 自动判断字段与单位。
- 决策：升级为确定性的导入确认工作台：字段映射、源数据预览、单位选择、转换预览和错误/警告摘要在同一弹窗中完成。
- 影响：用户可以在覆盖当前货物数据前确认导入结果；解析与换算逻辑继续留在 `src/lib/importCargo.ts` 等可测试模块中。
- 后续：下一阶段独立实现 UI 重构和单元/E2E 覆盖，暂不引入运行时 LLM 判断。

## 2026-05-22 3D 大屏扩展先采用响应式工作区

- 背景：浏览器最大化后 3D 画布没有跟随扩展，用户无法获得更大的复核视角。
- 选项：增加全屏模式；直接把 3D 区域改成整页工具；先解除过窄高度限制并保持当前工作台布局。
- 决策：本阶段先保持当前工作台结构，调整视觉工作区高度约束和 WebGL resize 逻辑，让 3D 画布随可用视口扩大。
- 影响：改动小，能快速改善最大化后的视图体验；不会打断报告区、2D、分层和导出等既有布局。
- 后续：如果实际使用仍需要更大视角，再增加显式全屏按钮，而不是默认把工作台改成全屏应用。

## 2026-05-22 Playwright 默认单 worker 运行

- 背景：全量 E2E 使用同一个本地 Express/SQLite 服务和默认测试账号。并行 worker 会同时写入历史方案、自定义柜型和导入状态；重型 3D 用例还会争用浏览器 GPU/WebGL 资源。
- 选项：继续并行运行并接受偶发超时；为每个 worker 建独立数据库和账号命名空间；默认单 worker，后续再做测试隔离。
- 决策：本阶段默认 `workers: 1`，保留 `PLAYWRIGHT_WORKERS` 环境变量作为显式覆盖入口。不修改业务断言，不跳过失败用例。
- 影响：E2E 总耗时会增加，但结果更能代表当前仓库和当前 SQLite 状态；避免并行污染导致历史/导入测试偶发失败。
- 后续：远程同步部署和自动化测试阶段应补独立测试数据库、账号清理脚本和 worker 隔离后，再恢复并行。

## 2026-05-22 真实业务 Excel 31 托作为硬性算法验收

- 背景：`test-data/excel/俄罗斯整托装柜尺寸.xlsx` 在 `13400 * 2450 * 2650 mm` 柜型下当前只能装入 27 托，但业务要求至少装入 31 托。
- 选项：把 E2E 期望改成当前 27 托；修改夹具或导入行数；把 31 托作为算法缺陷修复目标。
- 决策：选择第三项。31 托全部装入是下一阶段算法硬性验收，测试和夹具不得为迁就当前算法而修改。
- 影响：需要重估自动装箱策略，当前逐个极点贪心可能不足以覆盖整托批量铺排场景。
- 后续：先补算法级回归和 E2E，再重构布局候选生成、整托批量铺排、局部回溯或评分策略。

## 2026-05-22 手动排布首期以 2D 俯视为主

- 背景：人工手动排布需要拖拽、旋转、删除、快捷键、合法性校验和历史保存；直接在 3D 中完成全部编辑会显著增加交互复杂度。
- 选项：首期直接做完整 3D 编辑；首期以 2D 俯视拖拽为主，3D 同步复核；单独做一个与当前结果无关的手动编辑器。
- 决策：首期以 2D 俯视拖拽为主，3D 同步展示。手动结果必须进入与自动结果兼容的数据模型，不能只存在 UI 临时状态中。
- 影响：可以先落地可控的手动排布能力，同时避免 3D picking、层面选择和自由视角编辑一次性过度复杂。
- 后续：多层手动堆叠和 3D 直接编辑需要单独设计支撑面选择、层切换和碰撞提示。

## 2026-05-22 升级兼容优先采用 SQLite 幂等迁移

- 背景：项目已保存用户、历史方案、自定义柜型等生产数据；未来升级新增字段或表时不能丢弃这些数据。
- 选项：每次启动用 `CREATE TABLE IF NOT EXISTS` 粗略补表；部署时人工改库；建立版本化幂等迁移机制。
- 决策：采用版本化幂等迁移，使用 `PRAGMA user_version` 或 migrations 表记录 schema 版本。部署前必须备份数据库，迁移不得默认删除数据。
- 影响：后续用户审计字段、手动方案字段和部署升级都必须通过迁移进入生产环境。
- 后续：实现迁移模块、旧库夹具测试、部署脚本备份/恢复/健康检查。

## 2026-05-22 E2E 测试不得迁就实现

- 背景：本轮明确要求 E2E 根据需求制定，不能为了通过而修改测试。
- 选项：用当前实现能力定义测试；把真实业务目标写成待实现但不跑；先写需求真实验收测试，失败则修实现。
- 决策：采用第三项。真实业务夹具、31 托装载、审计字段、手动排布等 E2E 必须编码需求意图；实现没完成时应修实现或明确记录缺口，不降低断言。
- 影响：短期可能出现红色测试，但能防止"测试绿色但业务不成立"。
- 后续：每个阶段先确认需求级验收，再实现功能；测试改动需要能追溯到需求变化，而不是实现便利。

## 2026-05-22 dengxbin 用户管理不可见排查

- 背景：用户反馈 `dengxbin` 账号已注册成功但管理员控制台看不到。运维需要确认是注册接口、用户列表 API、前端展示，还是远端数据库存在分歧导致用户消失。
- 排查方式：
  1. 本地 SQLite：`sqlite3 server/database.db "SELECT username, created_at FROM users ORDER BY created_at DESC;"`，结果显示 `dengxbin|user|0|2026-05-22T02:19:18.191Z` 存在并且 `disabled=0`、`role=user`。
  2. 远端站点：`ssh tencent-container-layout 'ls /usr/share/nginx/html/'` 仅有 `assets`、`favicon.svg`、`icons.svg`、`index.html`；远端没有 Node 进程和 SQLite 数据库，部署形态是纯静态前端，`scripts/deploy.mjs` 也只同步 `dist/`。
  3. API/前端：`GET /api/users` 旧实现没有 `ORDER BY`，依赖 SQLite 自然行序；`UserManagement.tsx` 没有刷新按钮、搜索框，也无显式错误条幅，浏览器一旦缓存旧分页或 fetch 静默失败就会看起来"用户不见了"。
- 结论：
  - 本地服务端用户表里 `dengxbin` 确实存在，数据没有丢；远端目前没有真正的注册后端，所以用户反馈中的 dengxbin 只可能落在曾经运行过 Node 服务的本地/演示环境上。
  - 管理员看不到的真正风险来自前端：没有刷新、没有错误提示、列表顺序不可控、长列表不可搜，注册时一旦后端报错（如 5xx）也不会让管理员知道需要重新拉数据。
- 决策：
  1. 服务端：注册接口区分 400/409/500，写入后回读完整 user 行再返回，所有阶段写 `console.log` 审计；`GET /api/users` 增加 `ORDER BY datetime(created_at) DESC` 且不加 LIMIT。
  2. 前端：`UserManagement` 增加刷新按钮、搜索框、用户总数与匹配数显示、可关闭的红色错误条幅；toggle/delete 失败也回写错误条幅。
  3. 文案：在组件内放置 `zh`/`en` 两套 copy，从 `localStorage.locale` 读取（缺省 `zh`），与现有 Workbench locale 保持一致。
- 影响：
  - 注册流程从隐式 400 升级为带状态码与日志的硬约束接口，管理员通过审计日志即可定位"是否真的注册过"。
  - 管理员控制台具备自助排障能力：刷新即可消除缓存，搜索 dengxbin 即可定位该账号，错误不再静默。
  - 远端部署需要重新规划：要么把 Node 服务（含 SQLite）放到 tencent-container-layout，要么继续保持静态前端但接入独立 API 域名；本期不在此 PR 中切换部署架构。
- 后续：
  - 在下一次部署后，在生产数据库上重跑同样的 SELECT 验证 dengxbin 与 created_at 顺序；如果生产没有 Node/数据库，先决定部署架构再讨论"管理员可见用户"。
  - 增补一条 E2E：注册一个新用户后切换 admin 账号，应在 `/api/users` 顶部找到该用户名；当前 `auth-isolation` 已覆盖部分流程，可在阶段 4/5 中补强搜索与刷新断言。

## 2026-05-22 手动排布 3D 同步与自动到手动联动

- 背景：第九轮 Review 阶段 4 要求闭合手动排布回路：手动结果要在 3D 中可复核、自动结果要能一键进入手动微调。
- 决策：
  1. `manualPlacement.toPlacedBoxes` 适配器把 `ManualPlacedBox` 转换为 `PlacedBox`，缺省字段 `index=1`、`workStep=1`、`physicalLayer=1`、`supportType='floor'`、`supportedBy=[]`、`weight=0`、`stackable=true`，保留 `orientationKey`、`labelRotationDeg`、`color`、`label`、坐标和尺寸。`invalidBoxIds` 不写进 `PlacedBox`，由 3D 组件单独消费。
  2. `ContainerScene` 新增可选 `invalidBoxIds`，对命中集合中的盒子使用红色描边（0xef4444）和暗红 emissive（0x5a1212）；材质缓存键加入 `inv|ok` 后缀，避免污染正常材质。
  3. Workbench 手动模式下复用顶部 2D/3D 切换：`workspaceView==='3d'` 渲染 `ContainerScene`（点击可选择，但不支持拖拽），`'2d'` 保留 `ManualPlacement2D` 编辑。
  4. 自动模式工具栏增加 “继续手动微调 / Continue manually” 按钮，把 `result.placed` 一次性提交到 `manualHistory`，以新 id `manual-${box.id}` 避免与未来重复编号冲突，并切换到手动模式。
- 影响：
  - 手动结果与 3D 复核打通，但 3D 阶段不引入拖拽，避免一次性堆叠 picking + 高度选择 + 碰撞提示。
  - 自动结果作为手动起点后会脱离自动重算；用户切回自动会覆盖 `result.placed`，但 `manualHistory` 不会被清空，仍可撤销/重做回到原始自动结果之前的手动起点。
- 后续 / P2 待做：
  - `history_plans` 表当前没有 `mode` 字段（schema 在 `server/db.mjs` 22-31 行仅含 `loading_mode`）。手动方案要落历史需要新增一次幂等迁移（例如 `ALTER TABLE history_plans ADD COLUMN mode TEXT DEFAULT 'auto'`）并在保存/恢复时携带；本期跳过，留待下一轮 Review 处理。
  - 3D 手动编辑（拖拽、层级切换、堆叠支撑提示）需要单独设计。
  - 自动→手动的反向回流（手动结果导出回自动验证）尚未规划，避免循环触发。


## 2026-05-22 第九轮远程 E2E 三个失败用例的归因

- 背景：第九轮收尾后将 dist 与 Node 后端部署到 `http://101.33.232.150/`（systemd `cargo-server.service` + EnvironmentFile `/etc/cargo-server.env`，nginx `/api/` → `127.0.0.1:3100`），并以 `PLAYWRIGHT_BASE_URL=http://101.33.232.150/` 跑完整 36 用例的 E2E。32 通过、1 主动 skip、3 失败。本节按项目规则 "不通过的点记录到 decision.md，不为通过修改测试" 整理失败归因。
- 选项：
  1. 立刻修 UI 或测试让用例通过。
  2. 仅记录归因，留待下一轮 Review 决定是改 UI、改测试夹具还是补隔离。
- 决策：选择 2，理由是三个失败都不是本轮交付（本地化、布局、手动排布闭环、用户管理）回归，而是新增覆盖与旧用例对 "无状态/可重复" 的隐含期望与服务端长存数据冲突。
- 失败 1 — `container-calc.spec.ts:321 edits cargo item details and keeps cancel as a no-op`
  - 报错：`getByRole('form', { name: 'Edit cargo item' }).getByRole('button', { name: 'Cancel' })` 命中 2 个按钮。
  - 根因：编辑对话框头部的关闭 × 按钮 `aria-label={t.cancel}`（值 `Cancel`/`取消`），底部 Cancel 按钮文本同名；role-name 命中两个。
  - 影响：用例是本轮新增的“编辑货物对话框”回归覆盖，断言流程本身正确，但 UI 没有给两个取消按钮区分语义。
  - 后续：下一轮把头部 × 的 aria-label 改成 `Close`/`关闭`，或在底部按钮加 `data-testid="edit-cargo-cancel"` 让测试可指向单一元素；本期不动 UI，避免与第十轮反馈中提到的“性能优化”一起改动。
- 失败 2 — `container-calc.spec.ts:776 saves and restores history plans with labels and layers intact`
  - 报错：从历史页点 `Back to workbench` 后立即 `setInputFiles(xlsx)`，断言 `cargo-list-item` 含 `Imported crate` 不可见；页面快照显示仍停留在历史页（含历次回归的 “21/21·H:3/3” 等历史记录）。
  - 根因：远端 Node 后端是长生命周期实例，每次 E2E 都会向 `history_plans` 写入；当本测试在测试用户的历史里已经有 5 条记录时，新计划落库会异步触发 `prune to 5`，导致 `Back to workbench` 的 React state 在导入文件之前还没完成切回 Workbench；本地 dev 重启清掉本地存储不会复现。
  - 影响：用例对 “历史只有自己刚保存的一条” 的隐含假设不成立；不会动到本轮交付，但说明 E2E 与生产数据库共享状态。
  - 后续：下一轮在测试 `beforeEach` 里调用 `DELETE /api/history`（或 `DELETE /api/admin/history?username=testuser`）做隔离，或在测试结尾点 `Back to workbench` 后插入 `await expect(page.getByTestId('cargo-panel')).toBeVisible()` 等同步点；本期保留失败作为远端状态污染证据。
- 失败 3 — `auth-isolation.spec.ts:34 ensures strict data isolation for custom containers and history plans`
  - 报错：`getByText('Shipment-User1')` strict mode 命中 2 个 `<p>装运名称: Shipment-User1</p>`。
  - 根因：同上，远端 `history_plans` 在多轮回归之后已经为新建测试用户保留了多条同名 `Shipment-User1`，断言期望唯一。
  - 影响：用户隔离逻辑本身没问题（每条记录都属于当前用户），只是测试夹具没做清理；这次不动测试以免误把真实数据隔离 bug 隐藏掉。
  - 后续：与失败 2 共享方案——给 `auth-isolation` 增加一次性清理接口或在每条测试开头删除当前用户的全部历史；最终方案放到下一轮 Review。
- 通用后续：
  - 在 `server/index.mjs` 增加一条 `DELETE /api/history/all`（鉴权 + 仅当前用户）以支持 E2E 清场，避免后续测试依赖 admin 接口。
  - 把 `responsive-3d.spec.ts` 当前的 `test.skip(true)` 替换为需要后端的真实流程：用户登录 → 调三种 viewport，下一轮兑现。


## 2026-05-22 第十轮交付完成与遗留问题清零

- 背景：第十轮 Review 提出 4 项核心需求（模式收敛、手动 3D 操作、手动 2D 视角、尺寸 badge 不遮挡、装载规则默认数量优先）+ 远程部署 + E2E 验证。同时需要把第九轮遗留的 3 个 E2E 失败用例（cancel 歧义、history 污染、auth-isolation 污染）一并解决。
- 决策与实现：
  1. 装载规则默认值从 `volume` 改为 `quantity`；现有依赖默认 volume 行为的单元/E2E 测试（packing.test.ts 138 行、packing.31pallet.test.ts、container-calc.spec.ts:518 旋转测试 / 193 导出测试）显式补传 `loadingMode: 'volume'` 或 UI 切换；新增 `defaults to quantity-priority loading mode when none is specified` 单元用例锁定默认值。
  2. 容器尺寸 badge 从画布绝对定位（`absolute left-5 top-5`）改为顶部工具栏右侧（`ml-auto`），统一自动/手动模式渲染，且不再遮挡 manual-undo/redo/旋转/删除按钮；新增 E2E `容器尺寸 badge 与场景同步且不遮挡手动工具栏` 用 boundingBox 不相交断言保护。
  3. `ManualPlacement2D` 接收 `viewMode: top|front|side`，按视图选择 viewBox 与 box 投影坐标；新增组件单元测试覆盖三视图 viewBox/rect 尺寸。本期 front/side 渲染为只读，拖拽改 z 暂未实现 — 见下方"后续"。
  4. `ContainerScene` 新增 `manualEditable` 模式：左键按下命中 box 后通过 raycast 投影到 y=0 ground plane 拖动（同步 mesh + edges 位置）；pointerup 写回 `onManualMove`；接收 HTML5 drop（含 `application/x-cargo-id`）将 cargoId + 落点 mm 转给 `onManualDropFromPool`；OrbitControls 在拖拽中禁用，结束后恢复 freeView 状态。
  5. `vite.config.ts` 新增 `/api` proxy 默认指向 `http://127.0.0.1:3010`（环境变量 `VITE_API_TARGET` 可覆盖）；本地 3000 端口被 docker 占用时，用 `PORT=3010 npm run start:server` 启动后端即可让 dev server 跟 E2E 都走真后端。
  6. 装箱 / Load 按钮取消自动 POST history（第九轮遗留行为），避免与 "保存方案" 重复写入 history 并触发 prune 抖动；显式 save 只走 `saveCurrentPlan`。
  7. server 新增 `DELETE /api/history`（鉴权，仅当前用户），E2E `beforeEach` 登录后清空 testuser 历史，彻底解决远程数据库状态污染（失败 2、失败 3 全部通过）。
  8. 编辑货物对话框头部 × 按钮 `aria-label` 从 `t.cancel` 改为新增的 `t.closeEditDialog`（中文：关闭编辑对话框 / 英文：Close edit dialog），与底部 Cancel 按钮区分语义（失败 1 通过）。
- 验证：`npm run lint && npm test && npm run build` 全绿；E2E 40 用例 39 通过 + 1 主动 skip（`responsive-3d.spec.ts` 仍是占位）；本地登录、装箱、手动模式、历史保存与恢复、auth 隔离全部 OK。
- 影响：
  - 默认装载规则改动会影响"未显式指定 loadingMode 的旧调用方"的装箱顺序；所有已知调用点都已校准（前端 UI 默认下拉框、单元测试夹具、E2E 用例）。
  - `vite.config.ts` 引入了 server proxy 默认值；CI / 部署不应受影响（生产由 nginx 反代 `/api/` → 后端，无需 dev proxy）。
  - 取消 Load 按钮自动 save，等价于把"保存"行为显式化；如果有历史轮次依赖"装箱即落库"的隐含语义，需在新轮明确产品定义。
- 后续：
  - 手动 2D front/side 视图目前只支持读视图；要让拖拽改 box.z 需要扩展 `manualPlacement.setBoxPosition` 接收 z 参数与对应 reducer 命名约定，留待后续轮次。
  - 3D 手动模式当前只做平面 XY 平移；旋转仍走顶部工具栏的 `handleManualRotate`，本身能影响 3D 渲染（因 boxes prop 由 manualDraft 派生），但缺少键盘快捷键体验，可在后续轮接入。
  - 装箱算法 quantity 路径不走 best-fit decreasing，在"小货 + 大件"混排时利用率明显低于 volume；如果未来用户期望"数量优先但智能交错"，需要把 best-fit 抽出共用辅助。


## 2026-05-22 第十轮收尾：手动 3D 编辑器视角、碰撞、性能三件套

- 背景：第十轮主提交把手动模式 3D 拖拽与 pool drop 跑通后，用户提出三点遗留：(1) 视角不能移动（OrbitControls 默认关掉），(2) 拖拽中没有实时碰撞反馈（只在松手后由 manualPlacement.validateDraft 反算 issue），(3) 每次手动 commit 都重建 Scene，体感卡顿。
- 决策：在 `ContainerScene.tsx` 做一次性的有限重构，避免变成 3D 编辑器全量重写：
  1. 视角：手动模式下 `controls.enabled = true`、`mouseButtons = { LEFT: null, MIDDLE: DOLLY, RIGHT: ROTATE }`；自由视角下保留默认 `LEFT: ROTATE, MIDDLE: DOLLY, RIGHT: PAN`；其他情况锁定。把"controls 启用 / 当前交互模式"暴露成 `data-controls-enabled` 与 `data-interaction-mode`，给 E2E 一个稳定断言点（playwright `page.mouse.wheel` 在 WebGL canvas 上不可靠，不用作回归点）。
  2. 实时碰撞：拖拽 pointermove 中按当前候选位置算与其它箱体的 XY 重叠 + 容器越界（仅同 z 重叠区间需要检测），命中则把当前 box.id 临时塞进 `sceneState.invalidOverride`，pointerup 落地后清空 override 让 `manualPlacement.validateDraft` 的持久 issues 接管。`refreshEntryVisual` 复用既有 `applyBoxVisualState` 路径，红边即时反馈。
  3. 性能：把单一大 `useEffect` 拆为三层：主 effect 仅依赖 `[container]`（容器尺寸变了才重建场景），新增 `boxes` effect 做增量 mesh add/update/remove + dispose，`viewMode` / `manualEditable+freeView` 各一个 effect 单独同步 camera 与 controls。`controls.update()` 仅在 enabled 时调用，减少 idle 状态的无用计算。本地全量 E2E 时长从 5.5min 降到 4.0min（约 27% 改善）。
- 影响：
  - 主 effect 依赖减少导致 React Hooks ESLint 报 "missing dependency: viewMode"，已用行内 disable + 注释明确意图，避免未来无意中加回 deps 触发重建。
  - 手动模式视角操作改成"右键旋转 / 中键 / 滚轮缩放 / 左键留给箱体拾取与拖拽"，与一般 3D 编辑器约定一致。键盘 PAN 暂不支持。
  - 拖拽碰撞检测是 O(N) per move（N=已放置箱数）；当 N 巨大（>1000）时可能感受到帧率影响，本期不引入空间索引，预留下一轮（uniform grid / 简单 KD-tree）。
- 后续：
  - 手动 3D 仍是 XY 平面平移；要支持把箱体抬起堆叠（改 z）需要扩展 `manualPlacement.setBoxPosition` 接收 z 并把 raycast 改为同时支持 ground + 已放置箱顶面。
  - OrbitControls.mouseButtons LEFT=null 的类型在 three@old 上是 `MOUSE | undefined`，本期用 `null` 强制赋值（运行时 OK）；如果未来 three.js 升级类型变严格，需要改成 `undefined`。
  - 远程 E2E 跑了 41 个用例 → 40 pass / 1 skipped（`responsive-3d.spec.ts` 仍待补真后端流程），与本地一致。


## 2026-05-23 第十一轮：历史恢复 3D 不刷新根因 + 手动 3D Z 轴 + 调试面板

- **背景**：远程 admin 反馈"从历史方案恢复后 3D 场景看不到任何箱体"，并提出"3D 还需要 Z 轴 + 快捷键 + 日志辅助"。本轮先复现 admin bug、找到根因、修复，再交付 Z 轴 + 调试面板能力。
- **bug 根因**（diff 关键）：
  - `ContainerScene.tsx` 之前在**模块作用域**持有 `textureCache: Map<string, THREE.Texture>` 和 `materialCache: Map<string, THREE.Material>`，所有 scene 实例共享。
  - 当 `container.length/width/height` 变化时主 effect cleanup 旧 scene 并 `renderer.dispose()`，释放 GPU 资源；但 module 级 cache 中的 Texture/Material 仍持有 stale references。
  - 下一次主 effect 创建新 scene + 新 renderer，box mesh 复用 cached material → material.map 是上一个 renderer context 的 texture handle → 在新 context 上 GPU side 无效 → mesh 表面变成"无纹理"（实际全透明/不可见），canvas 中心只看得到背景 + grid + floor 颜色，整体 distinct colors ≤ 3。
  - 用户感知：恢复后柜型尺寸、cargo 列表、统计数字、layer 数全部正确，**但 3D 完全空白**。
- **修复**：cache 改为 `WeakMap<SceneState, Map<string, Texture|Material>>` per-scene 实例；主 effect cleanup 时 `texture.dispose() / material.dispose()` 并清空 map。新增 regression E2E `从历史方案恢复自定义柜型后 3D 场景重建并显示新箱体`（pixel sample 验证箱体颜色出现，distinct colors >= 4）。
- **附带：Z 轴拖拽 + 快捷键**：
  - `manualPlacement.setBoxPosition(draft, id, x, y, z?)` 加可选 z 参数，z 缺省时保持原值；新增单元测试覆盖 z 缺省与显式。
  - `ContainerScene` pointerdown 时根据 `event.shiftKey` 进入 'z' 模式：锁定 XY，把 pointer Y 像素位移按 `Z_PIXELS_PER_MM=0.5` 映射为 z mm；pointerup 落地时调用 `onManualMove(id, x, y, z)`（z 模式下传原 x/y）。
  - 全局 `keydown` 监听（仅 manualEditable + 有选中 box）：R 旋转、Delete/Backspace 删除、Esc 取消选中、方向键 ±X/Y、PgUp/PgDown ±Z；step = Shift→100mm、Ctrl→1mm、默认 10mm。
  - keydown 跳过 input/textarea/contentEditable，避免文本输入冲突。
- **调试面板**：
  - 新文件 `src/components/DebugPanel.tsx`：`Ctrl+Shift+D` 切换；`?debug=1` query 默认打开；面板 + 浮动按钮自适应。
  - 展示 user/role/locale/placementMode/workspaceView/container summary/loadingMode/cargo & placed 数/manual boxes 数/history 数/最近 30 条 console.error|warn。
  - Workbench 在 mount 时包裹 `console.error` / `console.warn`，把 stringified args 推入 `recentErrors` state（保留最近 30 条）。
  - `window.__cargoSnapshot()` 暴露 JSON 快照，便于团队让用户在 console 直接拷贝。
  - admin 角色额外显示"Fetch server logs"按钮，调 `GET /api/_debug/recent-logs?limit=120`。
- **服务端日志接口**：
  - `server/index.mjs` 新增 `GET /api/_debug/recent-logs?limit=N` (authenticate + requireAdmin)。
  - 读 `process.env.CARGO_LOG_PATH || /var/log/cargo-server.log` 末尾 N 行（最大 500）。
  - 过滤含 `/api/auth/` 路径的行避免泄漏登录尝试 metadata（即使日志只记 method+path，没记 body）。
  - 简单 rate limit：两次调用间隔 < 500ms 返回 429。
- **验证**：
  - 本地 `lint && test (59 unit tests) && build`：全绿。
  - 本地 E2E 44 用例 → 43 pass / 1 skipped / 0 failed。
  - 远程 E2E (101.33.232.150) → 同样 43 pass / 1 skipped / 0 failed。
  - admin 远程登录 + `/api/_debug/recent-logs` 返回有效日志（验证 systemd 服务用 `/var/log/cargo-server.log`）。
- **后续**：
  - 手动 3D 当前 Z 轴是"按 Shift 临时切换"模式；考虑后续把鼠标手势改成更直观的双指/中键 + 屏幕指示（小提示框显示 "X/Y / Z 模式"）。
  - keydown 监听器是 window-scoped，若同页面挂了多个 ContainerScene（理论上不可能但需要小心），会冲突；当前 manualEditableRef 保证只有手动模式响应，但未防止两个 manualEditable scene 同时存在。
  - `Z_PIXELS_PER_MM` 是常数，未来可改成 viewport 高度 / 容器高度的比例，让大柜小柜手感一致。
  - 调试面板 admin 日志接口仅 tail；未实现"按 user_id / path 过滤"或"流式推送"，下一轮再做。

## 2026-05-23 第十二轮：手动自由视角、支撑阈值与换柜刷新

- 背景：第十二轮 Review 要求修复手动模式 free view、补充 Shift+Z/快捷键说明、禁止悬空手动摆放，并处理自动模式下更换货柜后画布仍显示旧结果的问题。
- 选项：
  1. 手动 free view 与 manual edit 同时启用，左键既可能选箱也可能旋转。
  2. free view 优先，手动模式下进入只读浏览态；关闭 free view 后恢复编辑。
  3. 自动换柜后立即自动重算。
  4. 自动换柜后清空旧自动结果并提示用户重新计算。
- 决策：
  1. 手动 free view 采用只读浏览态：`freeView=true` 时 OrbitControls 优先，`data-interaction-mode=manual-free`，禁用拖拽/drop/快捷键移动，避免误操作。
  2. 手动支撑初版要求箱体要么落地，要么底面接触下方箱顶且累计投影支撑面积 >= 50% 底面积；不足则报 `floating`。允许多个下方箱体累计支撑。
  3. 自动模式换柜不自动重算；当 container id、有效尺寸、载重或预留间隙变化，且上一个自动结果有箱体时，清空画布并提示“已更换货柜，请重新计算”。
- 影响：
  - free view 与编辑互斥让用户可以安全查看手动方案，但不能边浏览边拖动；UI 增加只读提示。
  - 50% 支撑阈值比自动算法当前 80% 支撑阈值更宽松，原因是手动排布需要允许业务人员表达部分支撑实践；后续可按真实装柜规范收紧或按货物类型配置。
  - 换柜后需要用户显式点击装箱，避免系统在用户还没确认柜型/间隙输入时悄悄生成新方案。
- 后续：
  - 若用户需要更严格作业规范，把手动支撑阈值提升到 80% 并补充可视化支撑面积。
  - 手动方案历史保存需要 schema migration 后再实现，不在本轮混入。

## 2026-05-25 第二十一轮：清理远程测试账号

- 背景：远程数据库 `/opt/cargo-server/server/database.db` 累积了 87 个 E2E 跑出来的随机用户名账号（`u1_adm_*` / `u1_iso_*` / `u2_adm_*` / `u2_iso_*` / `u_reg_*` / `u1_8wel2`），用户在第二十一轮 review 中要求清理。
- 选项：
  1. 用 `LIKE '%test%'` 等宽松通配；风险：可能误伤真实账号。
  2. 用 `GLOB` 精确前缀匹配，覆盖已知测试账号命名规律。
- 决策：
  1. 删除前先 `cp -a /opt/cargo-server/server/database.db /root/cargo-db-backup-20260525-230917.db`。
  2. 在远程执行 SQL：`DELETE FROM users WHERE username GLOB 'u1_*' OR username GLOB 'u2_*' OR username GLOB 'u_reg_*' OR username = 'u1_8wel2';`
  3. 保留账号：`admin` / `testuser` / `dengxbin` / `RUIXI` / `邓晓艳`（中文用户名 + 非随机命名一律保留）。
- 影响：
  - 删除 87 条 users，外键 ON DELETE CASCADE 自动级联清理 `history_plans` / `custom_containers`，无孤儿行（已验证）。
  - 数据库总 users 数 92 → 5。
  - 不需要重启服务，better-sqlite3 嵌入式连接立即看到新状态。
- 回滚命令（如需）：`ssh tencent-container-layout 'systemctl stop cargo-server && cp -a /root/cargo-db-backup-20260525-230917.db /opt/cargo-server/server/database.db && systemctl start cargo-server'`。
- 后续：
  - E2E 套件需要补「测试结束后清理自己创建的临时账号」的 fixture，避免再次堆积。
  - 第二十一轮其余开发任务（车型几何 + 重心场）按计划在阶段 A–C 推进。

## 2026-05-25 第二十一轮：车型几何 + 重心场实现

- 背景：第二十轮 review 明确了「美化卡车 + 重心场」但代码层只完成 vehicleProfile 数据 + 安全范围 box，车头仍是单个 BoxGeometry 线框；重心场未实现。第二十一轮把这两件事落地。
- 选项：
  1. 直接在 `ContainerScene.tsx` 拼 mesh：实现快但无法 unit-test 几何参数。
  2. 在 `cogVisual.ts` 输出纯几何描述符，`ContainerScene` 只翻译为 Three.js mesh：可单元测试 + 与渲染解耦。
- 决策：
  1. 采用方案 2。新增 `buildTruckGeometry(container, profile?) -> TruckGeometry | null` + `buildGravityField(container, cog, opts?) -> GravityFieldPoint[]`，纯函数 + 单元测试。
  2. `CogOverlay` 类型扩展为 `{ truck (legacy), truckGeometry, gravityField }`，旧 `truck` 字段保留以兼容现有测试；新代码消费 `truckGeometry`。
  3. 重心场点数硬上限 80（常量 `GRAVITY_FIELD_MAX_POINTS`），默认 10×4 网格，maxPoints 触发时缩 nx/ny。Three.js 渲染采用 `SphereGeometry` + `MeshBasicMaterial`（HSL 绿→黄→红 lerp），全部挂到 `state.cogGroup`，cleanup 跟随 dispose。
  4. `CenterOfGravityPanel` 新增 `cog-toggle-gravity-field` 按钮：3D overlay 关闭时该按钮 `disabled`，避免重心场在 overlay 不可见时无意义启用。
- 影响：
  - 车头几何可以独立 unit-test（4 个新测试覆盖 trapezoid 比例、windshield 倾斜、axle 布局、container-only 是否退出）。
  - 重心场可视化让运输偏置一眼可见，且性能可控（≤80 个低分辨率 sphere）。
  - 旧 `truck` 字段保留 = 旧 `buildTruckSilhouette` 测试不需要改，渐进式迁移。
- 后续：
  - 若用户希望场更密，可在 `BuildCogOverlayOptions` 增 `gravityFieldDensity`，由 panel 暴露。
  - 旧 `truck` / `buildTruckSilhouette` 字段在下一轮可删除。

## 2026-05-27 第二十二轮重审：交互语义收敛与重心重做

- 背景：
  - 第二十二轮实现交付了尺规、六向旋转、Excel 模板和 CoG 三模式，但用户反馈这些实现“存在但不好用”：手动拖放失败无提示，尺规像遮挡按钮的弹窗而不是测量工具，旋转语义不符合 `R`/`Shift+R` 预期，模板创建入口不可见，重力场和 `装箱/重心/混合` 三模式没有业务意义。
- 选项：
  1. 在现有第二十二轮 UI 上继续补提示和按钮。
  2. 先重审并收敛产品语义，再按 P0/P1 拆小阶段重构。
- 决策：
  1. 采用方案 2。`REVIEW.md` 新增“第二十二轮重审 Review 与下一阶段重构计划（2026-05-27）”，作为下一阶段执行依据。
  2. 手动模式所有失败路径必须显式反馈，不再允许拖动/drop/旋转静默失败。
  3. 尺规从“选中箱体余量弹窗”重构为“用户可手动放置并固定的测量线”；现有余量计算仅作为快速辅助。
  4. 旋转语义重定义：`R` 为向右 90 度旋转，`Shift+R` 为向下 90 度旋转；六向 picker 只作为精确选择入口。
  5. 标签必须显示朝向角标或字母提示，选中态不再混用旋转标记。
  6. Excel 模板需要独立“模板管理/创建模板”入口，模板模型扩展为包含表头行、起始行、默认值规则、字段映射和单位策略，而不只是 mapping/units。
  7. 下线重力场和 `packing | cog | mixed` 三模式；装载重心 3D overlay 只在装载重心 panel active 时显示，离开即销毁。
  8. PM 新功能方向确定为“复核标注清单”，汇总测量线、重心状态、手动问题、未装货物和合规诊断。
- 影响：
  - 第二十二轮已实现的部分代码会被重构或删除，尤其是 `cogView.ts`、gravity field UI、固定 clearance overlay、`Shift+R` 循环六向逻辑。
  - 下一阶段必须避免一次性大改，按手动反馈、旋转标签、测量线、模板管理、重心重做、复核清单拆分提交。
- 后续：
  - 每个阶段完成后更新 `CHANGELOG.md` 并提交。
  - UI/3D/导入流程阶段必须运行浏览器自动化测试；若测试暴露现有功能缺陷，先记录再修，不削弱断言。

## 2026-06-11 越南整柜散货反馈复核（仅诊断，未改代码）

- 背景：用户反馈 6/11 一批问题，逐条对照当前代码核实是否真实存在。
- 复核结论：

  1. 「无法批量导入xlsx」→ **未复现/疑似使用问题**。导入已实现并接线：Workbench.tsx:3681 文件输入 accept=".xlsx,.xls,.csv" → importExcel (Workbench.tsx:2177) → parseCargoRows/parseCargoRowsWithTemplate；importCargo.ts 支持中英文表头映射含最大堆叠层数列(importCargo.ts:71,258)，并有模板管理器(open-template-manager)。导入错误会写入 importLog 标签(Workbench.tsx:2181)。需向用户确认其文件表头/扩展名或是否找到入口。

  2A. 「自动转手动微调卡顿」→ **确认**。validateDraft(manualPlacement.ts:523) 每次 move 都全量重算：overlap 双重循环 O(n^2)(537)，外加 supportingStackLimitViolation 对每个 box 重建 Map 且对每个 box 递归 stackLayerForManualBox(493-517)，整体接近 O(n^3)；handleManualMoveBox(Workbench.tsx:1278) 在每次提交都跑 validateDraft，无节流/记忆化。box 多时明显卡顿。
  2B. 「无法判定能否自由旋转」→ **部分**。canRotate 有校验(dryRunOrientation manualPlacement.ts:387)，六向+yaw/pitch 逻辑存在，但缺少「该货物可否旋转」的明确 UI 指示，属体验缺口。

  3&4. 「手动出现产品交叉/超出边界」→ **确认（核心根因）**。手动移动管线只「检测后拒绝」而非「钳制/吸附避让」：setBoxPosition(manualPlacement.ts:97) 直接写 x/y 无任何边界/重叠保护；handleManualMoveBox(Workbench.tsx:1278-1287) 校验若有 blocking issue 则整体拒绝该次移动(return)，但这意味着交互依赖 3D/2D 拖拽过程的中间态，且自动→手动接管时若位置因取整/朝向重算产生重叠，会被当作已存在的非法态。需运行时确认拖拽落点行为。

  5. 「体积利用率口径」→ **部分确认**。volumeUtilization 分母用 getContainerVolume(packing.ts:846)，而该函数其实已扣除安全余量（containers.ts:65-68 内部调用 effectiveContainer，扣 doorGap/sideGap*2/topGap）。所以并非用满柜名义体积，但仍未扣除「箱体无法完全贴内壁」的现实贴合损耗，用户感受的 85% vs 实际可装差距来源于此——可考虑增加「可用体积/实际贴合率」说明。

  6. 「无法边边对齐/自动吸附」→ **未复现（功能已具备）**。snapToEdges(snapEdges.ts:15) 支持吸附到柜壁/中线/相邻货物四种边(34-39)，容差默认 30mm(EDGE_SNAP_TOLERANCE_MM)；已接线到 3D 拖拽(ContainerScene.tsx:1271,1377,1438)。但 2D 视图(ManualPlacement2D)是否调用 snapToEdges 需确认；且吸附默认开关(placementSettings edgeSnapEnabled 默认值)需核对。用户「无法边边对齐」可能是吸附被关闭或仅在 3D 生效。

- 影响：手动排布质量(2A/3/4)是主要痛点，根因集中在 manualPlacement 校验策略与性能；导入(1)与吸附(6)更可能是发现/开关问题，需运行时确认。
- 后续：与用户确认 1、6 的运行时表现后，再就 2A/3/4 出具单独计划文件(plans/)。本轮不改代码、不写 review.md。

## 2026-06-11 手动排布吸附「可感知化」决策（已决策）

- 背景：6/11 反馈「手动无法边边对齐/吸附」。复核确认吸附功能齐全且默认开启（placementSettings.ts:23-27，snapEdges.ts 吸柜壁/中线/邻箱边），真问题是「吸附无视觉反馈 + 容差太小(30mm) + 3D 落定未重套边吸附」。用户澄清：诉求是让吸附「可被感知」，不是新增功能。
- 选项与决策：
  - 视觉反馈：采纳「对齐辅助线 + 被吸附边高亮」。吸附触发时沿对齐的那条边画一条贯穿参考线（CAD/Figma 风格），并高亮被吸附的边；3D 与 2D 都做。（放弃「仅变色」「再加提示文字」两个候选。）
  - 吸附容差：采纳「放大到固定值」。edgeToleranceMm 默认 30 → 80。（放弃「随缩放自适应像素」与「设置面板滑块」，本轮从简。）
  - 落定一致性 bug：采纳「一起修」。ContainerScene.tsx pointerup 落定(约 1307 行)只重套 grid snap，需补 edge snap，保证「预览贴边=最终落点」。
- 影响：snapToEdges 已返回 snappedAxes，需在 3D 拖拽中保留并驱动辅助线/高亮渲染（当前 ContainerScene.tsx:1274-1276 丢弃）；2D applyManualPlacementSnap 已正确吸附，需新增辅助线渲染。容差默认值变更会影响所有用户新会话（旧 localStorage 设置不被覆盖）。
- 后续：定稿计划见 plans/2026-06-11-snap-feedback.md，转交 Codex 执行。

## 2026-06-11 三个问题工程复核：交叉/超界是「渲染 bug」而非「数据 bug」（已确认，关键发现）

- 背景：用户提供 test-data/json/ 三个 debug 快照（snapshot 3/5/6），反馈手动排布出现产品交叉、边界超出、俯视图空隙。
- 验证方法：用真实 calculatePacking 与 validateDraft 重跑三个快照的 cargo/draft（临时测试已删除，结论如下）：
  - snapshot(3): 自动 866 箱、手动 74 箱；重叠对=0，越界=0，validateDraft issues=0。
  - snapshot(5): 自动 30、手动 30；重叠=0 越界=0 issues=0。
  - snapshot(6): 自动 30、手动 2；重叠=0 越界=0 issues=0。
  → **数据层面三个工程完全合法**，与存档里 manual.issues=0 一致。

- 关键发现：**视觉交叉/超界来自 3D 渲染朝向 bug，不是装箱数据错误。** 数值复算 render transform（scale=1，three.js 实算 8 顶点 AABB）：
  - snapshot(3) 940 箱中 74 个渲染足迹与存储尺寸不符；snapshot(5) 60 中 18 个不符；snapshot(6)（全 LWH 单位朝向）0 个不符。
  - 典型：某 WLH 箱存储 (L365,W580,H435)，但渲染足迹算出 (x580,z365) —— **长宽被转置 90°**，于是 mesh 互相穿插、捅出柜壁，而 validateDraft 用的是正确的 length/width，所以报 0 问题。

- 根因定位：auto→manual 接管 handleContinueManually（Workbench.tsx:1401-1431）。它把自动箱的「已旋转后」length/width/height 直接拷贝（1413-1415），同时：
  - orientationKey 仍取自动箱的 box.orientationKey（如 WLH，1419）；
  - baseLength/Width/Height 却取「原始 cargo」未旋转尺寸（cargo.length/width/height，1416-1418）；
  - 完全不设 orientationAxes → 渲染时 orientationAxesOf 回退到 canonical(identity)。
  三者自相矛盾：renderer 用 baseDimensionsFromPlaced(按 orientationKey 反推)得到未转置的 600×400 几何体，但 orientationAxes=identity 不施加旋转 → 画成 600×400，而数据/校验是 400×600。
  对照：自动渲染路径不设 orientationAxes，回退 canonical WLH 轴，旋转刚好把几何体换回 400×600，所以**自动视图正确、手动视图错位**——与用户「自动正常、手动出问题」完全吻合。

- 修复方向（下一轮计划，本轮不改码）：handleContinueManually 生成 manual 箱时，使 orientationKey / orientationAxes / base*/ length-width-height 自洽。两条可选：
  (A) base* 用「原始 cargo」尺寸时，必须同时写入与 orientationKey 对应的 orientationAxes（canonical），并保证 length/width/height = dimensionsForManualOrientation(base, key)；
  (B) 或令 manual 箱 orientationKey 统一为 LWH、base* 直接等于已旋转后的 length/width/height（即「把当前朝向当作基准」），最简单且消除歧义。
  验证标准：对每个 placed 箱，renderedFootprint(box) 的 (x,z,y) 必须等于 (length,width,height)（容差<0.5mm）——把本轮临时复算固化成单测；并补 E2E：snapshot(3)/(5) 进入手动后 3D 无交叉。

- 体积利用率（issue 5）补充确认：data/containers.ts 所有标准柜 doorGap/topGap/sideGap 全为 0，effectiveContainer 不扣任何余量，故 volumeUtilization 分母=名义满柜体积。用户「按 78CBM 名义算、实际只能装 64CBM」的质疑成立——系统未对「箱体无法贴内壁」的现实损耗建模，effective 余量机制存在但因数据为 0 而失效。

- 影响：交叉/超界类反馈的优先修复点从「手动碰撞策略」转移到「auto→manual 朝向元数据自洽」（Workbench.tsx:1401）。这比之前判断的 setBoxPosition 无防护更直接、更高频。
- 后续：把渲染朝向自洽修复纳入手动排布计划文件；利用率口径单列决策（是否引入贴壁损耗系数或显示「可用体积」）。

## 2026-06-11 6/11 反馈计划落定（已决策）

- 背景：复核后确认 6/11 全部 7 项均已分析。用户拍板：先写完 6/11 剩余全部（#1-5），#3/#4 两个根因都修。
- 决策：
  - #6 吸附 → plans/2026-06-11-snap-feedback.md（已出）。
  - #1-5 → plans/2026-06-11-manual-render-and-metrics.md（本轮出）。5 个子任务：
    1) 手动渲染朝向自洽（修 #3/#4 主因，handleContinueManually Workbench.tsx:1401 复用 makeManualBox 不变式；含「渲染足迹==存储尺寸」单测 + 三快照回归夹具）。
    2) 手动移动落点 clamp 到柜内（修 #3/#4 次因，保留重叠拒绝语义）。
    3) 旋转能力可见化（修 #2B，canRotate 禁用态 + 文案）。
    4) 利用率口径：本轮只做方案 A（展示净体积分母透明化）；方案 B(补柜型余量)/C(贴壁损耗系数) 待用户决策。
    5) 导入 #1：先运行时确认真实 Excel，再决定是增强报错可见性还是降级为发现性问题处理。
- 影响：#3/#4 主修点确定为渲染朝向自洽（实测证据），setBoxPosition 防护降为次要 clamp。
- 后续：两份计划转交 Codex。利用率方案 B/C 与导入 #1 的最终处置需下一轮用户确认。

## 2026-06-11 2A 性能计划单列 + 旧批次暂缓（已决策）

- 用户拍板：2A（手动卡顿，validateDraft 近 O(n³)）单独出性能计划；6/11 之前旧批次暂缓，先把 6/11 计划交 Codex。
- 2A 计划：plans/2026-06-11-manual-perf.md。三步：①单箱增量校验 validateBox(O(n³)→O(n))；②消除 supportingStackLimitViolation 重复建图(O(n³)→O(n²))；③拖动中节流(可选,先测后定)。核心防回归门槛：validateBox 结果必须 == validateDraft().filter(boxId)。
- 旧批次（6/2、5/26、5/25、5/22、5/14、3月）：未分析、未计划，按用户指示推迟。注意尺规/装柜步骤/重心代码里已存在(measurement.ts/loadingSteps/centerOfGravity)，下轮需逐条核实已实现/已修/仍缺。

- 6/11 三份计划齐备：snap-feedback.md(#6) / manual-render-and-metrics.md(#1-5) / manual-perf.md(#2A)。

## 2026-06-11 导入模板泛化性差：根因定位（真实文件 越南第十一批6.2海运.xlsx）

- 背景：用户实测导入不好用，泛化性差。用真实文件复核（test-data/excel/越南第十一批6.2海运.xlsx）。
- 文件结构：R1=标题「越南第十一批海运 预计6.2提货」(单格)；R2=真实表头(物料代码SKU/物料名称/预计发货数量/箱数/产品净重(KG)/个/产品毛重(KG)/箱/.../外箱尺寸(mm)/箱规)；R3+ 数据。尺寸为单格合并「530*305*310」，无单独长宽高列；无独立标签列(用 SKU)；数量有两列(预计发货数量=单品数、箱数=箱数)。
- 根因（均已实测确认）：
  1. **表头行硬编码为 1**：importExcel(Workbench.tsx:2208-2209) 固定 headerRow=1/startRow=2。真实文件标题占 R1，自动探测把标题行当表头 → 列名只剩标题一格 → canAutoMap 必失败，且回退的映射弹窗也拿到错误列(只有标题)。无「标题行/表头行」自动跳过或探测。
  2. **合并尺寸列不被识别**：canAutoMap(Workbench.tsx:2126) 要求分别命中 length/width/height。真实文件尺寸在「外箱尺寸（mm）/箱规」单格(530*305*310)。combined 模式存在(splitCombinedDimensions 正确)，但 canAutoMap 不认识合并列，preSelectCol 也无合并列候选 → 必落到手动弹窗。
  3. **表头候选词太窄**：fields(importCargo.ts:57-72) 与 preSelectCol(Workbench.tsx:2141) 的中文候选不含「物料名称」(name 候选有"名称"可命中)、「箱规」「外箱尺寸」(尺寸合并列)、「物料代码SKU」(label 无 SKU/物料代码)。即使表头行对了，长宽高仍全 NONE。
  4. **手动弹窗负担重**：落到弹窗后默认 headerRow=1、dimensionMode=separate(Workbench.tsx:2260-2262)，用户须手动改表头行→切合并模式→选合并列→设顺序，步骤多、预选无用，正是「不好用」。
- 影响：真实业务 Excel 几乎一定走手动弹窗且预选无效，泛化性差的核心是「表头行探测缺失 + 合并尺寸列不参与自动识别 + 候选词窄」。
- 后续：出导入泛化计划(plans/)。方向：自动探测表头行(扫描首几行找命中字段最多的行)、自动识别合并尺寸列并默认 combined、扩充中文候选词(含 SKU/物料代码/物料名称/箱规/外箱尺寸/箱数)、弹窗智能预选(含合并列与表头行)。待与用户确认优先级与是否需要"双数量列"语义(箱数 vs 件数)。

## 2026-06-11 导入模板重新定性：模板=用户配置规则（纠正前一条自动探测思路）

- 用户纠正：客户格式复杂度高，不可能靠系统猜全。模板的本质是「用户配置一次读取规则，之后照规则读」。问题应聚焦「配规则 + 复用规则」的体验，而非加自动探测。
- 当前规则模型已有的能力：表头行 templateHeaderRow、起始行 templateStartRow、逐字段列映射 customMapping、尺寸分离/合并 templateDimensionMode、合并列 templateCombinedColumn、单位 customUnits、默认值 templateDefaults、模板存取(saveImportTemplate/applyImportTemplate, 后端 /api/import-templates)。
- 真正的体验缺陷（按模板=规则的模型）：
  1. **上传时不主动套已存模板**：importExcel(Workbench.tsx:2219) 只试 canAutoMap，失败就开「空白/瞎猜」的弹窗，从不先尝试用户已保存的模板。同格式文件第二次导入仍要从头配——复用链路根本没接上。这是「不好用」的首要原因。
  2. **合并尺寸顺序不可配**：数据层支持 dimensionOrder(importCargo.ts:52)，但 UI 把它写死成 [length,width,height]（Workbench.tsx:1856/1969/2002），合并模式只能选列、默认按 L*W*H。文件若是 宽*长*高 或 长*高*宽，规则无法表达。
  3. **应用模板后仍是「填表单」而非「按规则直接读」**：applyImportTemplate(1877) 把模板灌进各 state，用户还要在弹窗里确认/再点确认导入；模板没有「选中即套用并预览结果」的直达体验。
  4. 弹窗字段映射、表头行、合并列分散在多个区块，配置心智负担重（次要）。
- 设计方向（待与用户确认）：① 上传时按「列名签名/表头指纹」自动匹配已存模板，命中即直接用该规则解析并展示结果，未命中才开配置；② 合并尺寸顺序做成可配（下拉 LWH/WLH/...）；③ 模板选中即套用并实时预览解析结果，弱化「再确认」。核心是把「模板」从「一次性映射弹窗」升级为「可复用、可命中的读取规则」。

## 2026-06-11 导入模板重构设计定稿（已决策）

- 模型：模板=用户在选定表格范围内显式配置「我们的参数 ← 他的标头」映射规则；系统不猜，照规则读。
- 决策汇总：
  1. 表格范围：表头行+数据起始行（已有）框定，下拉列来源取该范围标头。
  2. 字段映射：必填(尺寸/数量)重点高亮区，未配齐禁用「确认导入」并提示缺项；选填(名称/重量/可旋转/可堆叠/最大层数/颜色)收次要区。
  3. 尺寸合并：指到单列+连接符拆分(现 splitCombinedDimensions 支持 * × x 空格)+**强制选顺序**(LWH/WLH/...，不预设，不选不让确认)。dimensionOrder 需从写死(Workbench.tsx:1856/1969/2002)改为 UI 可配。
  4. 标签 A-Z：原文过长进 name 完整保留；label 按导入顺序自动发 A,B,...,Z,AA,AB...(**修现有 %26 第27个撞A 的 bug**：nextLabel Workbench.tsx:761、fallbackLabel importCargo.ts:125)；**一行一标签**；图例显示 A=原文。
  5. 标签列冲突：用户**映射了标签列就用该列值(过长才 A-Z)**，未映射才自动 A-Z。
  6. 模板复用(稳妥路线，不自动匹配)：弹窗模板下拉**默认选中上次用过的模板**(新增 lastUsedTemplateId 持久化)；手选→预填→**用户确认再导入**；多个候选不自动选，靠用户在下拉里选；选中实时预览(已有预览表)。
  7. 组织：一个计划文件全做，内部分子任务。
- 影响：弹窗布局重排(必填/选填分区)、新增合并顺序下拉与 A-Z 生成器(可配进位)、模板下拉默认上次。后端 import-templates schema 已含 dimensionOrder，无需迁移。
- 后续：计划见 plans/2026-06-11-import-template-redesign.md。

## 2026-06-12 第N轮 Review：模板入口收敛 + 装箱缝隙根因

- 背景：用户复核反馈两点。①导入导出模板不完善：选了合并尺寸列后下面还要继续选 L/W/H，应自动填充；模板分散在「模板管理页 / 导入 Excel 弹窗 / 导入模板管理」三处，设计不完整。②用越南测试 Excel（越南第十一批6.2海运.xlsx）总出现箱子之间有缝隙。

- 根因（已用真实文件实测，非纯读码推断）：
  - **缝隙**：跑 `calculatePacking`（src/lib/packing.ts）于越南文件 24 品类 864 箱 → 785 已放置中 **365 个（46%）侧面(-y)悬空留缝**；-z 悬空=0（支撑链正常，不是 floating bug）。同一品类被拆成多种朝向：label D = 42 LWH + 89 WLH。
  - 决定性实验：单一品类 530×305×310 ×200：`canRotate:true`（默认）→ 56 LWH + 144 WLH 混排，地面 x 列 `0,305,530,610,915,1060,1220,1525,1590…`（行距 530/305 交替）；`canRotate:false`（单朝向）→ 200 LWH，地面整齐 `0,530,1060,1590`。
  - 缝隙来自 `placementScore`（packing.ts:275）中 `labelFacingPenalty=(length-width)*0.01` 偏好 LWH 太弱，压不过 `point.x/point.y` 位置项，导致 WLH 频繁胜出、同品类朝向不一致、行距交替留缝。这是 342f6cb/0dc8d9a 尝试修但力度不足的延续。
  - **模板入口分散**：①模板管理 nav 页（Workbench.tsx:2968）→ `templateManagerPanel`（:2663）：列映射用**自由文本输入**（:2724），无下拉/无预览。②导入弹窗（:4188+）：完整下拉映射+预览+必填校验，是更好的另一套 UI。③合并模式自动填充缺失（:4256）：选了合并模式+尺寸列后，下方仍渲染独立 L/W/H 选择器（:4304 遍历所有 key），用户"还要继续选"，合并列设了但 L/W/H 选择器照常显示且未禁用。

- 选项与决策：
  1. 缝隙修复力度：A 同 label 同朝向；B 仅加强 LWH 偏好权重；C 两者都做。**决策＝A 同货物同朝向**：同一装柜区域内强制同 label 货物统一朝向，消除行距交替；力度比纯调权重更贴近真实装柜作业，利用率可能略降可接受。
  2. 模板入口收敛：**决策＝统一为导入弹窗式**。模板管理页复用导入弹窗那套下拉+预览+必填校验组件，删自由文本输入；三处共用同一套映射组件；合并模式自动隐藏 L/W/H 选择器。

- 影响：packing 评分/排序需引入「同 label 朝向一致」约束（须保证现有 packing.test.ts 全绿，新增缝隙回归断言）；模板 UI 三处合一，删除 templateManagerPanel 自由文本输入分支。
- 后续：计划见 plans/2026-06-12-template-and-packing-gap.md。

## 2026-06-17 第34轮 Review：模板入口再收敛（去掉弹窗外的「新建无数据源」问题）

- 背景：第33轮 4 点已实现（模板管理页改用共享下拉映射组件），但用户复核仍指出模板设计有问题：①导航页「模板管理」点「新建模板」要选数据列，但新建时**没有数据源**，所有列下拉是空的，根本选不了；②工具栏还有一个「导入模板管理」按钮，与导航页重复，应去掉并合并到导航页模板管理。

- 根因（已读码定位）：
  - **新建无数据源**：导航页「新建模板」按钮（Workbench.tsx:2843）调 `createBlankImportTemplateDraft()` 开空白 `ImportMappingForm`；该表单列下拉只来自 `availableColumns`（ImportMappingForm.tsx:97 = `availableColumns ∪ 已选值`），而导航页传入的是 `importColumnsForHeaderRow(templateSampleRows, …)`，`templateSampleRows` 仅在用户先点「加载样本表头」上传文件后才有值。未上传 → 列下拉全空 → 「要选数据却没数据源」。
  - **入口重复**：工具栏「导入模板管理」按钮（:3961，`open-template-manager`）`setImportRows([{}])` 后开映射弹窗，喂空数据 `[{}]`，同样列下拉为空；与导航页 `template-manager` 功能重叠。
  - **真正可用路径**：导入真实 Excel → 弹窗带真实列 → 配映射 → 弹窗顶部 import-template-controls（:4301）命名+保存。这是唯一有数据源的创建路径。

- 选项与决策（已与用户确认）：
  1. 合并目标：**决策＝合并进导航页「模板管理」**，去掉工具栏「导入模板管理」按钮（`open-template-manager`，:3958-3971）。
  2. 导航页去留：**决策＝保留，作为唯一管理入口**，且允许在此新建/自定义模板。
  3. 新建时列下拉数据源：**决策＝允许手填列名**。新建/编辑模板时，列映射不强制依赖样本文件——`ImportMappingForm` 的列选择器在无 `availableColumns` 时支持用户手动输入列名（自由文本），有样本则可下拉选。沿用「加载样本表头」作为可选辅助。
  4. 导入弹窗保存控件：**决策＝保留**。真实导入 Excel 时，弹窗顶部仍可命名并「保存模板」（看着真列配出来是最自然的创建路径），存后也出现在导航页同一列表。
  - 导出模板（exportTemplateManagerPanel）本轮不动。

- 影响：①删工具栏 `open-template-manager` 按钮 → E2E `container-calc.spec.ts:917-920` 段需更新（改走导航页或直接删该复用断言）。②`ImportMappingForm` 列选择器需支持「无样本时手填列名」——新增可输入模式（如 datalist 或 input+下拉混合），不破坏现有 `map-select-*` selectOption E2E。③导航页「新建模板」不再要求先加载样本。
- 后续：计划见 plans/2026-06-17-template-entry-consolidation.md。

### 补充（同轮）：合并模式下仍出现一个多余的「dimensions」列下拉

- 现象：用户反馈「选了合并列后，后续仍然需要选择长宽高」。
- 根因（已读码定位）：`FIELD_KEYS`（ImportMappingForm.tsx:65-78）含一项 `'dimensions'`。字段循环隐藏条件是 `dimensionMode==='combined' && dimensionKey`（:122），而 `dimensionKey` 仅 length/width/height 有值（`DIMENSION_FIELDS` 只收这三）。合并模式下真正的 L/W/H 三选择器**已被正确隐藏**；但 `dimensions` 项 `dimensionKey` 为 undefined → **不被隐藏**，渲染出一个裸的 "dimensions" 列下拉（`fieldLabel` 无此键，显示原始 key）。同时合并模式底部已有专门的「合并尺寸列」选择器 `template-combined-column`（:285），二者 onChange 都写同一个 `mapping.dimensions`（:289）——重复且困惑。
- 决策：`dimensions` **不作为普通字段渲染**，字段循环跳过它（任何模式）；合并列统一由底部维度区的 `template-combined-column` 负责。`mapping.dimensions` 数据语义不变（仍由 combinedColumn 写入），parse 不动。
- 影响：合并模式下字段区只剩 label/name/weight/quantity/color/可旋转/可堆叠/最大层数 等非尺寸项 + 底部「合并列 + 拆分顺序」；分列模式不受影响。无新增 E2E 风险（`map-select-dimensions` 无人引用）。
- 已并入计划子任务 1。

### 完成记录（2026-06-17）

- 实现：`ImportMappingForm` 的列映射控件已由纯下拉改为可输入 `input + datalist`，保留原 `map-select-*`/`template-combined-column` test id 与 mapping 语义；无样本时可手填列名，有样本时给建议。
- 实现：工具栏 `open-template-manager` 重复入口已删除，模板管理只走导航页「模板管理」；真实导入 Excel 弹窗顶部命名/保存模板控件保留。
- 实现：`dimensions` 不再作为普通字段渲染；合并尺寸只由专门的 `template-combined-column` 写 `mapping.dimensions`。兼容旧模板：若后端序列化出的 `combinedColumn` 是空字符串但 `mapping.dimensions` 仍有列名，parser 与 Workbench 编辑/草稿/保存边界都使用 `combinedColumn || mapping.dimensions` 兜底，避免编辑旧合并模板时把合并列清空。
- 验证：先改 E2E 并观察到 RED（旧 `<select>` 无法 `.fill()`）；实现后 targeted GREEN 6 项通过；TS review 发现旧合并模板空 `combinedColumn` 兼容缺口后新增单测并修复；本地 `npm run lint`、`npm test`（52 文件 / 321 测试）、`npm run build`、全量 `npm run test:e2e`（91 passed / 1 skipped）通过。部署结果见 CHANGELOG 同日条目追加。

## 2026-06-18 第38轮 Review：撤销"选模板即导入"，更正为"选模板=仅应用参数预填"

> 状态：已实现本地门禁验证；E2E 按用户本轮明确要求未执行。部署结果见 CHANGELOG 同日条目。

- 背景：第37轮架构师（Claude）误读用户诉求，把"选模板"设计成**直接解析+关窗导入**（计划 plans/2026-06-18-template-select-triggers-import.md，已由 commit e2eaa6b 实现）。用户第38轮实测反馈：「选择了模板以后，直接弹窗就消失了」「选择模板不是就直接将 excel 导入了，而是只应用模板参数」。

- 根因（架构师理解偏差 + 已读码定位）：
  - 设计误读：用户说"再次导入不用再选映射"指的是**选模板后映射自动填好、省掉逐列手选**；架构师误解为**省掉查看/确认那一步**。
  - 代码现状：commit e2eaa6b 把导入弹窗模板下拉 `onChange`（Workbench.tsx:4356 区域）从 `applyImportTemplate(value)`（仅预填）改为 `importWithTemplate(template)`（解析 parseCargoRowsWithTemplate + applyImportedCargo 写货物 + setShowMappingModal(false) 关窗 + setActiveNav('report')）→ "选模板=确认导入"。

- 选项与决策（已与用户确认）：
  1. 选模板语义：**决策＝仅应用/预填模板参数（列映射 + 表头行/起始行/单位/合并模式/拆分顺序/默认值）到映射弹窗**，弹窗保持打开，预览与各列映射可见，用户查看确认后**再点"确认导入"**才真正导入。回到 e2eaa6b 之前 applyImportTemplate 的"仅预填"语义。
  2. 红框能力：**决策＝保留** e2eaa6b 引入的缺列检测/红框（missingColumns / missingMappedColumns），仅去掉"自动解析+关窗"。选模板预填后若模板映射的列在文件中不存在，对应输入框标红，弹窗仍开。
  3. 默认不加载模板：**决策＝维持**（不恢复 on-open 自动套用 lastUsedTemplate）；打开弹窗下拉默认「无」。
  4. 记忆上次模板：**决策＝改到"确认导入成功后"才记**，避免"只是选来看看没导入"也被记成上次用。

- 影响：删除 `importWithTemplate` 函数；弹窗模板下拉 `onChange` 改回 `applyImportTemplate`（含红框计算）；`rememberSelectedImportTemplate` 仅在确认导入且产生有效 cargo 后记录，避免“只是选来看看”或失败确认污染 last-used；e2eaa6b 写的「选模板即导入」E2E 已改写为「选模板预填、确认才导入」+「选模板后不确认则不导入」防回归断言，不为通过弱化断言。
- 验证：本轮按用户要求不跑 E2E；本地 `npm run lint && npm test && npm run build` 通过（53 文件 / 329 单测，build 仅既有 chunk-size warning）。

## 2026-06-18 第39轮 Review：导入弹窗"保存模板"= 选中即更新 + 失败不再静默

- 背景：用户对导入弹窗顶部「保存模板」按钮（save-import-template）提出两点：①选中某模板、在弹窗改了参数（如分列改合并、补合并尺寸列）后点保存，期望**更新当前这条**，现状却永远新建一条；②保存失败时无任何提示（静默）。

- 根因（已读码定位）：
  - handleSaveImportTemplate（Workbench.tsx:2179）只调 saveImportTemplate（POST），从不调 updateImportTemplate（PUT）。后端 POST /api/import-templates（server/index.mjs:371）永远 INSERT 新 UUID，且 name 有 UNIQUE 约束 → 同名 POST 撞 409（:386-388）。
  - 静默：saveImportTemplate 失败返回 null（importTemplates.ts:28），handleSaveImportTemplate `if (!saved) return`（:2194）直接返回不提示。对比 saveNewImportTemplate(:2282)、saveEditedImportTemplate(:2216) 失败都有 alert，唯独弹窗这个缺。

- 选项与决策（已与用户确认）：
  1. 保存语义：**决策＝选中了就更新，改名才新建**。判定：selectedImportTemplateId 非空 且 选中模板存在 且 name 未改 → updateImportTemplate（PUT）；否则 saveImportTemplate（POST，新建/另存为）。仍是同一个「保存模板」按钮，逻辑自动判定（用户预期只有一个按钮）。
  2. 失败反馈：**决策＝alert**，与旁边 saveNewImportTemplate/saveEditedImportTemplate 一致（Convention Over Novelty）。
  3. 同名覆盖：**决策＝本轮不做**。新建走 POST 若键入已存在的别的模板名 → 后端 409 → alert 告知即可；"同名是否覆盖"确认超范围，如需另开一轮。

- 影响：仅改 handleSaveImportTemplate 一个函数；复用现有 PUT/POST lib 通道与 t.templateUpdated/t.templateSaved 文案（均已存在）；不动后端、不动导航页新建/编辑、不动下拉选模板 onChange。
- 后续：计划见 plans/2026-06-18-save-template-update-in-place.md。与 plans/2026-06-18-template-apply-only-prefill.md 相互独立（同文件不同函数，合并注意不互相覆盖）。
