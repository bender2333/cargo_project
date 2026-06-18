# 计划：6/11 反馈剩余项（手动渲染朝向 / 卡顿 / 旋转指示 / 利用率口径 / 导入确认）

本文件覆盖 2026/6/11 反馈中**除吸附外**的全部条目（吸附见 `plans/2026-06-11-snap-feedback.md`）。

复核已确认（见 decision.md 2026-06-11 三条）：三个问题工程 `test-data/json/snapshot(3)(5)(6)` 的**数据完全合法**（真实 calculatePacking + validateDraft：重叠=0、越界=0、issues=0），用户看到的「产品交叉 / 超出边界 / 俯视图空隙」是 **3D 渲染朝向 bug**，与用户原话「数据一致、不会报错」吻合。

子任务执行顺序：1 → 2 → 3 → 4 → 5。每个子任务单独 commit。

---

## 子任务 1【最高优先】手动排布渲染朝向自洽（修 #3 #4 主因）

- **根因**：`handleContinueManually`（`src/Workbench.tsx:1401-1431`）把自动箱转手动箱时产生自相矛盾的朝向元数据：
  - `length/width/height` 取自动箱**已旋转后**的值（1413-1415）；
  - `orientationKey` 仍取自动箱的 `box.orientationKey`（如 `WLH`，1419）；
  - `baseLength/Width/Height` 却取**原始 cargo 未旋转**尺寸（1416-1418）；
  - **完全不设 `orientationAxes`** → 渲染回退 canonical。
  - 结果：渲染器用 `baseDimensionsFromPlaced`(按 key 反推) 建出未转置几何体，但因 `orientationAxes` 缺失不施加旋转 → mesh 长宽差 90°，互相穿插、捅出柜壁。实测 snapshot(3) 74 箱、(5) 18 箱足迹错位，(6) 全 LWH 0 错位。
- **意图**：让 handleContinueManually 生成的每个 manual 箱满足「渲染足迹 == 存储 length/width/height」不变式。采用与 `makeManualBox`（`src/lib/manualPlacement.ts:663`，drop 路径已用、正确）一致的**规范化基准**：
  - 把自动箱**当前朝向后的尺寸**当作 manual 箱的基准：`baseLength=box.length, baseWidth=box.width, baseHeight=box.height`；
  - `orientationKey='LWH'`、`orientationAxes={L+,W+,H+}`、`yaw=pitch=0`、`labelRotationDeg=0`。
  - 即：丢弃自动箱的 orientationKey 语义（它的旋转已经"烘焙"进 length/width/height 了），不再二次旋转。
  - 建议直接复用 `makeManualBox(...)` 构造，传入 `length/width/height = box.length/width/height`，避免再手写对象漏字段。
- **边界**：只改 handleContinueManually 的箱体构造；不改 calculatePacking、不改 validateDraft、不改 drop 路径（已正确）。x/y/z 原样保留（数据已合法）。`canRotate/stackable/maxStackLayers` 仍从 cargo 取（保持现状）。
- **验证标准（核心，编码业务意图）**：
  - 新增纯函数单测 `renderedFootprint(box)`：用 orientationTransform 的 `baseDimensionsFromPlaced` + `orientationRenderingBasisVectors` + `orientationAxesOf` 复算渲染足迹（8 顶点 AABB，逻辑同 ContainerScene `boxGeometryForPlaced`+`boxOrientationQuaternion`）。把它做成可测工具（放 `src/lib/`），断言：**对 handleContinueManually 产出的每个箱，renderedFootprint(box) 的 (xExtent,zExtent,yExtent) == (length,width,height)，容差 <0.5mm**。
  - 回归夹具：把 `test-data/json/snapshot(3)(5)(6)` 接入测试（已有 `restoreManualDebugScenario`）。断言：对每个快照的 cargo 跑 calculatePacking → 模拟 handleContinueManually 转换 → 所有箱 renderedFootprint 自洽（snapshot 3/5 修复前会失败 74/18 个，修复后=0）。**这是能在 bug 回归时失败的断言。**
  - E2E（`e2e/manual-3d.spec.ts`）：导入 snapshot(5) 场景或等价数据，自动排布后点「继续手动」，断言 3D 场景中无 mesh 越界（可用既有 invalidOverride / data 属性，或对比 mesh 世界 AABB 与柜内）。

## 子任务 2 手动移动二次防护（修 #3 #4 次因）

- **根因/现状**：`setBoxPosition`（`src/lib/manualPlacement.ts:97`）直接写 x/y 无任何边界/重叠保护；`handleManualMoveBox`（`src/Workbench.tsx:1278-1287`）确实会在校验出 blocking issue 时**整体拒绝**该次移动（return）——所以落定不会写入非法态。但这依赖每次 move 都正确校验，且「拒绝」对用户表现为「箱子拖不动」，体验差。
- **意图**：保留「检测后拒绝」语义（不引入自动避让，避免行为突变），但补一层**落点钳制到柜内**：移动/落定时先把 x/y/z clamp 到 `[0, container.dim - boxDim]`，再做校验。这样越界这一类问题在源头消除，仅重叠类仍走拒绝。
- **边界**：clamp 只处理边界（boundary），不处理重叠（overlap 仍由 validateDraft 拒绝）；不改 supportPolicy；2D/3D 两条路径都接（`handleManualMoveBox` 是公共入口，改这里即可覆盖）。
- **验证标准**：
  - 单测：构造把箱拖出柜界的 move，断言 clamp 后 `x>=0 && x+length<=container.length`（其余轴同理），且不再产生 boundary issue。
  - 单测：拖到与邻箱重叠处，断言仍被拒绝（overlap issue 存在、draft 不变）——确认 clamp 没有削弱重叠防护。
- **风险**：clamp 后若与邻箱重叠，仍会被拒绝，表现为「贴边但拖不动」，可接受。

## 子任务 3 旋转能力可见化（修 #2B）

- **根因**：`canRotate` 有校验（`dryRunOrientation` `src/lib/manualPlacement.ts:387` 对 `canRotate===false` 直接拒绝并给 `rotation-disabled` issue），但 UI 无「该箱能否旋转」的指示，用户「无法判定货物是否可以自由旋转」。
- **意图**：选中箱时，在旋转控件区显示该箱 `canRotate` 状态：可旋转→正常显示旋转按钮；不可旋转→按钮置灰 + 文案（如「该货物已锁定旋转」）。中英双语（沿用 Workbench 的 `t` 字典）。
- **边界**：纯展示/禁用态，不改旋转算法、不改 canRotate 来源（仍来自 cargo）。不新增"自由旋转"能力（六向+yaw/pitch 已存在）。
- **验证标准**：
  - E2E：选中一个 `canRotate:false` 的箱，断言旋转按钮 disabled 且提示文案出现；选中可旋转箱，断言按钮可用。
  - 组件单测（如适用）：传入 canRotate=false 的 selected box，断言渲染出禁用态。

## 子任务 4 体积利用率口径修正/澄清（修 #5）

- **根因**：所有标准柜 `doorGap/topGap/sideGap=0`（`src/data/containers.ts:3-52`），`effectiveContainer` 不扣余量，故 `volumeUtilization` 分母 = 名义满柜体积（`src/lib/packing.ts:846,848` `getContainerVolume`）。用户「按 78CBM 名义算、实际只能装 64CBM（箱体无法贴内壁）」质疑成立。
- **决策待用户拍板（写计划时先列方案，勿自作主张）**：
  - 方案 A（最小、推荐先做）：**口径透明化**——在利用率旁同时展示「已装体积 X CBM / 柜内净体积 Y CBM」，并标注分母为名义净空间，不改数值。零业务风险。
  - 方案 B：给柜型数据补默认安全余量（doorGap/sideGap/topGap），使 effective 真正小于名义，利用率分母随之下降。影响装箱结果（可装量变少），需用户确认是否接受。
  - 方案 C：引入「贴壁损耗系数」单独显示「预计实际可装」，不动现有利用率定义。
- **边界**：本子任务**先只做方案 A**（展示层），B/C 待 decision.md 记录用户决策后再单列。
- **验证标准**：
  - 单测：`volumeUtilization` 与「usedVolume/effectiveVolume」展示值一致；effectiveVolume 等于 `getContainerVolume(container)`。
  - E2E：报告/摘要区出现净体积分母文案。

## 子任务 5 导入「无法批量导入」运行时确认 + 报错可见性（应对 #1）

- **现状**：导入功能齐全且接线（`src/Workbench.tsx:3681` file input `.xlsx,.xls,.csv` → `importExcel` `:2177`；`importCargo.ts` 支持中英表头含最大堆叠层 `:71,258`；有模板管理器）。「无法导入」大概率是**发现性/真实文件解析**问题。
- **意图**：
  - (a) 运行时确认：用用户的真实 Excel（`test-data/excel/越南第十一批6.2海运.xlsx` 等）跑导入，看是否报错、报错是否进 importLog。
  - (b) 若解析失败：增强 `importExcel` 的错误反馈——当解析出 0 行或抛错时，给出明确提示（哪一列没匹配上 / 鼓励用模板管理器手动映射），而非静默。当前错误只在文件过大/异常时写 importLog（`:2181`），列名不匹配可能静默产出空结果。
- **边界**：不改 importCargo 的映射规则；只增强「失败时告诉用户原因 + 引导到模板管理器」。导入入口已存在，不新增入口。
- **验证标准**：
  - 单测（importCargo）：传入列名完全不匹配的行，断言返回结果可被上层识别为「需手动映射」（如返回空且带原因），而非抛未捕获异常。
  - E2E：上传一个列名非常规的 xlsx，断言出现「请用模板管理器映射」之类引导，且不崩溃。
  - **若运行时确认导入其实正常**：在 decision.md 记录"#1 未复现，属发现性问题"，本子任务降级为「在导入按钮旁增加模板下载/说明」的小改。

---

## 必跑验证
- 每个子任务：`npm run lint && npm test && npm run build`。
- 子任务 1/2/3/5（涉及 3D/2D/交互/导入）：额外 `npm run test:e2e`。
- 测试失败先记 decision.md，不削弱断言。

## 风险与回归门槛
- 子任务 1 是行为修复，务必保证既有 `manual-3d.spec.ts`、`manualPlacement.test.ts`、`orientationTransform.test.ts` 全绿；新增的「渲染足迹自洽」单测是防回归核心。
- 子任务 2 的 clamp 不得改变"重叠仍拒绝"语义。
- 子任务 4 本轮只做展示层（方案 A），B/C 需用户决策。
- 子任务 5 以运行时确认为先，避免对其实正常的功能过度改造。
