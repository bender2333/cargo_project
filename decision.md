# Decision Log

记录 PRD 未明确、需要取舍或会影响后续架构的决策。

## 2026-06-05 手动模式贴地旋转改为落地语义

- 背景：手动模式长期存在 `R` 后 `Shift+R` 期望到 `WHL`、实际停在 `WLH` 的 E2E 缺口。复核后确认根因不是朝向 reducer 不会生成 `WHL`，而是贴地箱体高度变化时沿用纯几何中心旋转会把箱体抬到 `z>0`，随后 `validateDraft` 以悬空问题阻断提交，用户看到的结果就是“旋转没反应”。
- 选项：
  - 继续沿用第二十九轮纯几何中心语义：数学一致，但贴地箱高度变化时容易悬空并被静默拒绝。
  - 只在水平面保持中心补偿，贴地箱旋转后重新落到 `z=0`；堆叠箱仍保留垂直中心补偿，避免被错误吸回地面。
- 决策：采用第二种。`applyOrientation()` 对 `box.z <= EPSILON` 的贴地箱使用 `z=0`，x/y 仍按尺寸差的一半保持中心补偿；非贴地箱继续按原有 z 中心补偿。同步补全世界轴四向旋转：左/右 yaw、上/下 pitch，`dryRunRotation()` 覆盖四个方向。
- 影响：关闭 2026-05-29 第二十九轮记录的手动旋转 `WHL` vs `WLH` 待裁定缺口；贴地箱不再因高度变化旋转被判定悬空。贴角旋转仍可能因 x/y 越界被显式阻断，语义不变。后续 UI 浮层可以直接暴露四向旋转按钮。
- 验证：新增 `src/lib/manualPlacement.test.ts` 覆盖贴地箱高度变化后 `z=0`、`R` 后 `Shift+R` 可到 `WHL`、left/right 与 up/down 互为逆旋转，以及四方向 dry-run。`npx vitest run src/lib/manualPlacement.test.ts` 通过 40 项。

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
