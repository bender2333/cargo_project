export type ReleaseNote = {
  /** Sortable version string (e.g. "2026-05-25-r18"). Lexicographic order = chronological. */
  version: string
  date: string
  title: { en: string; zh: string }
  items: { en: string[]; zh: string[] }
}

/**
 * Ordered newest → oldest. The version field doubles as the "last read" marker stored
 * in localStorage; if a user's stored marker is < releaseNotes[0].version they see a red dot.
 *
 * Add new entries at the TOP. Keep the list short — old changes belong in CHANGELOG.md, not here.
 */
export const releaseNotes: ReleaseNote[] = [
  {
    version: '2026-06-12-r42-packing-layout-fixes',
    date: '2026-06-12',
    title: { en: 'Packing layout: label-facing + cargo grouping', zh: '排布局优化：标签朝向与货物聚整' },
    items: {
      en: [
        'Auto-packing prefers LWH orientation (labels facing door) over WLH (sideways), while keeping WLH when it improves density.',
        'Same-label cargo clusters together rather than splitting across two zones — easier to verify and unload.',
        'Same-height boxes stack on each other, reducing mixed-height visual gaps.',
      ],
      zh: [
        '自动排布优先 LWH 朝向（标签面朝柜门），替代 WLH（标签侧翻）；不牺牲需 WLH 时的装载密度。',
        '同标货物聚成一整块，不再拆到两区域——理货和查验更方便。',
        '相同高度货箱上下对齐堆叠，减少高低混层的视觉缝隙。',
      ],
    },
  },

  {
    version: '2026-06-12-r41-import-template-redesign',
    date: '2026-06-12',
    title: { en: 'Import template redesign', zh: '导入模板重构' },
    items: {
      en: [
        'Row labels now use Excel-style column IDs (A, B, C… Z, AA, AB…) — no more collision when importing 27+ cargo rows.',
        'Mapped label columns keep original values; unmapped rows fall back to unique auto-generated labels.',
        'Combined-dimension columns support configurable split order (L×W×H, W×L×H, etc.) via dropdown.',
        'Required fields highlighted; Confirm Import stays disabled with hints until dimensions and quantity are configured.',
        'Last-used template remembered and auto-selected on next modal open.',
      ],
      zh: [
        '导入行标签使用 Excel 列号式生成（A/B/C…Z/AA/AB…），27+ 件货物不再标签撞车。',
        '映射标签列时保留原始值；未映射时自动生成唯一标签。',
        '合并尺寸列支持自定义拆分顺序下拉，适配不同客户表单。',
        '必填项高亮；未配齐时确认按钮置灰并提示缺项。',
        '上次使用的模板自动记忆并默认选中预填。',
      ],
    },
  },

  {
    version: '2026-06-12-r40-snap-render-perf',
    date: '2026-06-12',
    title: { en: 'Snap feedback, render fixes, and manual performance', zh: '吸附反馈 / 渲染修正 / 手动性能优化' },
    items: {
      en: [
        'Snap-to-edge tolerance increased from 30mm to 80mm for easier alignment discovery; 3D pointer-up now applies edge snap matching the preview position.',
        'Fixed orientation metadata inconsistency when continuing manually from auto-packed results — rendered footprint now matches stored dimensions.',
        'Movement now clamps to container bounds before validation, preventing out-of-bounds placements at the source.',
        'Rotation gizmo is now hidden for boxes with locked rotation, with a bilingual notice explaining why.',
        'Volume utilization now shows used CBM / net CBM alongside the percentage for clearer capacity understanding.',
        'Import now gives clear guidance when no cargo rows are auto-recognized, suggesting manual column mapping.',
        'Manual placement validation performance improved from O(n³) to O(n²) on move/drop hot paths — smoother interaction with many boxes.',
      ],
      zh: [
        '边吸附容差从 30mm 扩大到 80mm，更容易发现对齐位置；3D 松手落定现在应用边吸附，与预览位置一致。',
        '修复从自动结果进入手动模式时的朝向元数据不一致——渲染足迹现在与存储尺寸完全匹配。',
        '移动自动钳制在货柜边界内，从源头杜绝越界放置。',
        '不可旋转的货物现在隐藏旋转手柄并显示双语提示。',
        '体积利用率现在同时显示已装 CBM / 净空间 CBM，容量理解更直观。',
        '导入无自动识别行时给出明确引导，建议使用模板管理器手动映射。',
        '手动排布校验性能从 O(n³) 优化到 O(n²)，大量箱体时拖拽交互更流畅。',
      ],
    },
  },

  {
    version: '2026-06-10-r39-feedback-round2',
    date: '2026-06-10',
    title: { en: 'Template help, manual steps, and 3D loading sheets', zh: '模板帮助 / 手动步骤 / 3D 作业分解图' },
    items: {
      en: [
        'Import mapping now shows inline help for header rows, data start rows, dimension mode, combined size columns, and cargo label columns.',
        'Selected-box clearance annotations now use smaller AutoCAD-style dimension text with extension lines instead of large white labels and endpoint markers.',
        'Manual placement now supports loading steps and playback using the current manual layout, including step-by-step 3D reveal.',
        'The loading-sheet PDF export button now lives in the Stage Plan tab, and step cards render orthographic 3D isometric snapshots with highlighted newly loaded cargo.',
      ],
      zh: [
        '导入映射现在为表头行、数据起始行、尺寸模式、合并尺寸列和货物标签列提供字段级帮助。',
        '选中货物的余量标注改为小号 AutoCAD 风格测距文字和两端延伸线，不再使用大白底标签和端点圆球。',
        '手动排布现在支持装柜步骤和作业回放，可基于当前手动布局逐步显示 3D 装载过程。',
        '作业分解图 PDF 导出按钮已移入装柜步骤页签，步骤卡片改为带高亮新装货物的 3D 轴测快照。',
      ],
    },
  },
  {
    version: '2026-06-09-r38-import-sheet-clearance',
    date: '2026-06-09',
    title: { en: 'Import templates, loading sheets, and clearance labels', zh: '导入模板、作业分解图与余量标注' },
    items: {
      en: [
        'Irregular Excel imports now support reusable templates with custom header rows, start rows, combined dimension columns, and explicit label-column mapping.',
        'Imported SKU labels such as TB-C10-EV_v1.1 now remain intact through the cargo list, packing result, loading steps, stats, unplaced rows, and details table.',
        'The loading-step panel can export a multi-page PDF loading sheet with a legend page and cumulative top-view step cards.',
        'The old manual two-point ruler has been replaced by selected-box 3D clearance annotations that hide contact directions and show usable gaps.',
      ],
      zh: [
        '异形 Excel 导入现在支持可复用模板，可配置表头行、起始行、合并尺寸列和明确的标签列映射。',
        '导入的 SKU 标签（如 TB-C10-EV_v1.1）会完整保留到货物列表、装箱结果、装载步骤、统计、未装货物和明细表，不再压缩成两位前缀。',
        '装柜步骤现在可以导出多页 PDF 作业分解图，包含首页图例和逐步累加的俯视步骤卡片。',
        '旧的手动两点尺规已替换为选中货物的 3D 余量标注；接触方向自动隐藏，只显示可用间隙。',
      ],
    },
  },
  {
    version: '2026-06-08-r37-stack-fill-diagnostics',
    date: '2026-06-08',
    title: { en: 'Stack-fill optimization and capacity diagnostics', zh: '堆叠填充优化与容量诊断' },
    items: {
      en: [
        'Automatic quantity packing now keeps finite stack-capacity columns available for capacity-1 top cargo instead of letting low-capacity cargo lock too many floor positions early.',
        'Capacity-1 cargo now tries valid high top-surface passenger positions before falling back to floor placement in automatic quantity and volume modes.',
        'The snapshot-12 style load improves from the recorded 109 boxes to 118 boxes, with capacity-1 top passengers increasing from 8 to 22 while stack-chain legality remains intact.',
        'Compliance diagnostics now explain when remaining cargo is mainly constrained by too many non-stackable or capacity-1 items, not by weight or dimensions.',
      ],
      zh: [
        '按数量自动装箱现在会为容量 1 顶层货预留有限堆叠列，不再让低容量货过早锁死过多地面位。',
        '容量 1 货物在按数量和按体积自动装箱中会先尝试合法的高位顶面乘客位置，再回退到地面。',
        'snapshot(12) 类装载从记录的 109 件提升到 118 件，容量 1 顶层乘客从 8 件提升到 22 件，支撑链合法性保持不变。',
        '合规与诊断现在会提示剩余货物主要受不可堆叠/容量 1 货物过多限制，而不是重量或尺寸限制。',
      ],
    },
  },
  {
    version: '2026-06-07-r36-stack-capacity-labels',
    date: '2026-06-07',
    title: { en: 'All-direction labels and layer clarity', zh: '全向标签与分层清晰度' },
    items: {
      en: [
        '3D cargo labels now render on the fixed exposed faces instead of changing with the camera angle.',
        'Face-label text, badge, dimensions, weight, and icons now use separated layout bands to avoid overlapping.',
        'Stacking rules now use one stack-capacity model: non-stackable cargo can ride as top cargo, while floor-only cargo is reserved for the data layer.',
        'Quantity and volume packing modes now place higher-stack-capacity cargo earlier, and quantity mode preserves top room for capacity-one cargo.',
        'Specific-layer views now fade inactive layers more strongly, and the measurement list no longer appears when the ruler is off and no measurements exist.',
        'Camera movement no longer triggers the removed full-scene label-face material refresh path.',
      ],
      zh: [
        '3D 货物标签现在固定显示在外露面上，不再跟随相机角度切换标签面。',
        '面标中的名称、徽标、尺寸、重量和图标改为分区排版，避免压在同一个字母区域上。',
        '堆叠规则已统一为堆叠容量模型：不可堆叠货物可作为顶层货物上架；仅限地面的含义保留在数据层。',
        '按数量和按体积装箱时，会优先放置堆叠能力更高的货物；按数量模式还会为容量 1 货物保留顶层空间。',
        '指定分层视图会更明显地虚化非当前层；关闭尺规且没有测量线时，不再显示空测量列表。',
        '相机移动不再触发已移除的全场景标签面材质刷新路径。',
      ],
    },
  },
  {
    version: '2026-06-06-r35-label-stack-template-controls',
    date: '2026-06-06',
    title: { en: '3D labels, stack limits, and template creation', zh: '3D 标签 / 堆叠上限 / 模板新建' },
    items: {
      en: [
        '3D cargo face badges no longer include orientation-axis text, while manual placement metadata still keeps the orientation information.',
        'Near-top free-camera 3D labels now stay on the top face instead of switching to side labels during review.',
        'Max stack layer limits are enforced through the whole support chain in automatic packing and manual validation.',
        'The header project name, new project, save project, and upload project controls were removed; history still keeps an auto-generated plan name.',
        'The top-level template manager can now create import templates with free-text source columns and reuse them in Excel import.',
      ],
      zh: [
        '3D 货物面标不再显示朝向轴文字，手动排布和明细仍保留朝向元数据。',
        '自由相机接近俯视时，3D 标签会稳定停留在顶面，不再切到侧面标签。',
        '最大堆叠层数现在会沿完整支撑链校验，自动装箱和手动校验都不会越过下层货物限制。',
        '顶部项目名、新建项目、保存项目、上传项目控件已移除；历史方案仍保留自动生成的方案名。',
        '顶层导入模板管理现在可用自由文本源列名新建模板，并在 Excel 导入中复用。',
      ],
    },
  },
  {
    version: '2026-06-05-r34-manual-rotation-gizmo',
    date: '2026-06-05',
    title: { en: 'In-scene 3D rotation handles', zh: '场景内 3D 弧形旋转手柄' },
    items: {
      en: [
        'Manual 3D rotation now uses in-scene arc handles around the selected cargo instead of a floating HTML panel.',
        'Double-click a selected cargo in 3D to show or hide the handles; R, Shift+R, arrow keys, PageUp/PageDown, Delete, and Esc remain available.',
        'Rotation now animates with a short quaternion transition while the placement data updates immediately.',
      ],
      zh: [
        '手动 3D 旋转已改为场景内弧形手柄，环绕选中货物显示，不再使用悬浮 HTML 面板。',
        '在 3D 中双击选中货物可显示或隐藏手柄；R、Shift+R、方向键、PageUp/PageDown、Delete、Esc 等快捷键继续保留。',
        '旋转时新增短暂 quaternion 补间动画，业务排布数据仍会立即更新。',
      ],
    },
  },
  {
    version: '2026-06-05-r33-manual-rotation-overlay',
    date: '2026-06-05',
    title: { en: 'Grounded manual rotation', zh: '手动旋转落地语义' },
    items: {
      en: [
        'The earlier floating rotation panel has been superseded by the in-scene 3D arc handles above.',
        'Grounded cargo stays on the floor after height-changing rotation, so R then Shift+R can reach the expected WHL orientation instead of being rejected as floating.',
        'The old manual toolbar and side precise panel were removed; keyboard shortcuts remain available from the canvas help button.',
      ],
      zh: [
        '上一版悬浮旋转面板已被上方的场景内 3D 弧形手柄取代。',
        '贴地货物在高度变化旋转后会重新落地，R 后再 Shift+R 可以到达预期的 WHL 朝向，不再因悬空校验被拒绝。',
        '旧的手动工具栏和右侧精调面板已移除；快捷键仍保留，并可从画布内键盘帮助查看。',
      ],
    },
  },
  {
    version: '2026-06-04-r32-global-stack-facing-labels',
    date: '2026-06-04',
    title: { en: 'Global stack limit and camera-facing 3D labels', zh: '全局堆叠层数 / 3D 朝向面标签' },
    items: {
      en: [
        'Loading rules now include a global default max stack layer limit for cargo that does not have its own limit.',
        'Cargo cards, exports, debug snapshots, saved projects, history plans, and container comparison all use the same global stack fallback.',
        '3D labels now render only on faces oriented toward the camera, keeping label size consistent while other faces remain plain color blocks.',
      ],
      zh: [
        '装载规则新增全局默认最大堆叠层数，未单独设置层数的货物会自动套用该限制。',
        '货物卡片、导出、调试快照、项目保存、历史方案和柜型对比都会使用同一个全局堆叠兜底值。',
        '3D 标签现在只画在朝向相机的面上，标签大小保持一致，其余面保留纯色块。',
      ],
    },
  },
  {
    version: '2026-06-04-r31-workspace-snap-stack',
    date: '2026-06-04',
    title: { en: 'Workspace, edge snap, stack limits, label clarity', zh: '工作区 / 边界吸附 / 堆叠层数 / 标签清晰度' },
    items: {
      en: [
        'Maximized workspaces now hide the top statistics strip, so 2D and 3D operations get more vertical room.',
        'Manual placement no longer shows the capacity card in the main canvas path; capacity remains available in debug snapshots.',
        'Edge snapping now keeps wall and neighbour-edge alignment even when the exact coordinate is not on the grid.',
        'Cargo can now store a max stack layer limit, with automatic packing, manual validation, import/export, templates, and history preserving the value.',
        'All-layer 2D and 3D views now downgrade covered stacked labels so same-column cargo is not mistaken for physical overlap.',
        '3D rendering now normalizes snapshot rotation axes to a right-handed basis before building the box quaternion.',
      ],
      zh: [
        '最大化工作区现在会隐藏顶部统计条，把竖向空间让给 2D / 3D 作业区。',
        '手动排布主画布默认不再显示容量占用卡；相关容量数据仍保留在调试快照中。',
        '边界吸附现在不会再被网格吸附二次拉偏，贴墙和贴邻箱边的最终落点保持精确。',
        '货物新增最大堆叠层数，自动装箱、手动校验、导入导出、模板和历史方案都会保留该参数。',
        '2D / 3D 全层视图会把被上层遮盖的堆叠标签降级显示，避免把同柱位多层货物误读成实体交叉。',
        '3D 渲染会先把快照中的旋转轴归一化为右手系，再生成箱体 quaternion，避免特定旋转状态视觉消失。',
      ],
    },
  },
  {
    version: '2026-05-29-r28-true-3d-rotation',
    date: '2026-05-29',
    title: { en: 'True 3D label rotation', zh: '真实 3D 标签旋转' },
    items: {
      en: [
        'Cargo labels now follow the real 3D box rotation instead of being simulated by separate per-face texture angles.',
        '2D projections and 3D rendering now share one orientation math module, so compound R and Shift+R rotations stay consistent.',
        'Automatic packing boxes without signed manual axes are still supported by deriving canonical axes from their orientation key.',
      ],
      zh: [
        '货物标签现在跟随箱体真实 3D 旋转，不再用逐面贴图角度模拟。',
        '2D 投影和 3D 渲染共用同一个朝向数学模块，R 与 Shift+R 的复合旋转保持一致。',
        '自动装箱产出的箱体即使没有 signed axes，也会从 orientationKey 推出 canonical 朝向继续兼容。',
      ],
    },
  },
  {
    version: '2026-05-29-r27-physical-face-label-rotation',
    date: '2026-05-29',
    title: { en: 'Physical face-level label rotation', zh: '物理面级标签旋转' },
    items: {
      en: [
        'Manual rotation now treats label direction by physical face instead of applying one angle to the whole box.',
        'R rotates the label direction on the top and bottom faces only; vertical side labels stay upright for that action.',
        'Shift+R rotates the label direction on the side faces only; top-view labels no longer change when the cargo is flipped vertically.',
      ],
      zh: [
        '手动旋转现在按物理面计算标签方向，不再把一个角度套到整个箱体六个面。',
        'R 只改变上下面标签方向；这个动作不会让竖直侧面标签一起侧躺。',
        'Shift+R 只改变两侧面标签方向；上下翻转时俯视标签不再跟着改变。',
      ],
    },
  },
  {
    version: '2026-05-28-r26-label-snap-settings',
    date: '2026-05-28',
    title: { en: 'Directional label rotation and split snap settings', zh: '标签方向旋转 / 吸附设置拆分' },
    items: {
      en: [
        'R and Shift+R now rotate the cargo label itself through the same four visual directions, so asymmetric labels point up, left, down, right, then up again.',
        'Placement settings and snap settings are now separate menu panels.',
        'Snap settings include a global on/off switch; turning it off disables grid, edge, Z, and surface snapping together.',
      ],
      zh: [
        'R 与 Shift+R 现在会让货物标签本体按四个方向循环，非对称标签会依次朝上、朝左、朝下、朝右、再朝上。',
        '「排布设置」与「吸附设置」已拆成两个独立菜单面板。',
        '「吸附设置」新增总开关；关闭后网格、边缘、Z 轴和上表面吸附会一起停用。',
      ],
    },
  },
  {
    version: '2026-05-28-r25-rotation-notifications',
    date: '2026-05-28',
    title: { en: 'Rotation cycles, readable orientation labels, notification bar', zh: '旋转循环 / 朝向识别标签 / 通知栏' },
    items: {
      en: [
        'R and Shift+R now rotate as two independent four-step cycles; four presses return the cargo to the same pose.',
        'Manual labels no longer use H/I angle text. They show signed X/Y/Z axis mapping so the current pose is identifiable from one label.',
        'What\'s new has been renamed to Notifications and will be updated with each shipped change.',
        'The maximize workspace control sits inside the actual canvas area instead of overlapping toolbar text.',
      ],
      zh: [
        'R 与 Shift+R 改为两个独立的四步循环旋转；连续按四次会回到同一姿态。',
        '手动标签不再使用 H/I 角度文字，改为显示 X/Y/Z 三轴对应关系，从单个标签即可识别当前姿态。',
        '「新特性」已改名为「通知栏」，后续每次上线改动都需要更新这里。',
        '最大化工作区按钮放入真正画布区域，不再遮挡工具条文字。',
      ],
    },
  },
  {
    version: '2026-05-27-r22-rework',
    date: '2026-05-27',
    title: { en: 'Round 22 rework: manual feedback, fixed ruler lines, checklist', zh: '第二十二轮重构：手动反馈 / 固定测量线 / 复核清单' },
    items: {
      en: [
        'Manual placement failures now surface a non-blocking notice instead of silently snapping back.',
        'R rotates right 90 degrees, Shift+R rotates down 90 degrees, and selected cargo shows an orientation diagram.',
        'Ruler mode now creates fixed 2D measurement lines with a measurement list instead of a clearance popup.',
        'Import templates have a visible manager entry plus header row, start row, defaults, mapping, and unit metadata.',
        'Balance removes the gravity field and Packing / CoG / Mixed modes; the 3D overlay only lives while the Balance tab is active.',
        'A Review checklist tab collects fixed measurements, CoG risk, manual issues, unplaced cargo, and diagnostics for export.',
      ],
      zh: [
        '手动排布失败现在显示非阻塞提示，不再只是无声回弹。',
        'R 为向右 90°，Shift+R 为向下 90°，选中货物新增朝向示意图。',
        '尺规模式改为在 2D 中创建固定测量线和测量列表，不再显示遮挡按钮的余量弹窗。',
        '导入模板新增明确管理入口，并保存表头行、起始行、默认值、字段映射和单位策略。',
        '装载重心下线重心场和「装箱 / 重心 / 混合」三模式；3D overlay 只在装载重心页签激活时存在。',
        '新增「复核清单」页签，汇总测量线、重心风险、手动问题、未装货物和诊断，并支持导出。',
      ],
    },
  },
  {
    version: '2026-05-26-r22',
    date: '2026-05-26',
    title: { en: 'Ruler, six-way manual rotation, import templates', zh: '尺规 / 六向手动旋转 / 导入模板' },
    items: {
      en: [
        'Layer wording is now "Layer view" so review/filtering is not confused with manual layer editing.',
        'Manual placement can choose all six orientations, with visible orientation controls.',
        'The ruler initially showed selected-box clearance to walls, ceiling, door side, and nearest neighbors.',
        'Excel import mappings can be saved as user-scoped templates and reused later.',
        'This behavior was superseded by the 2026-05-27 rework.',
      ],
      zh: [
        '「逐层添加」统一改为「分层查看」，避免把复核过滤误解为按层编辑。',
        '手动排布支持六种朝向，新增可见朝向控件。',
        '初版尺规 overlay 可在选中箱体后显示到柜壁、顶部、门口和最近邻箱的余量。',
        'Excel 字段映射可保存为用户自己的导入模板，下次导入可复用。',
        '该行为已被 2026-05-27 重构替代。',
      ],
    },
  },
  {
    version: '2026-05-25-r21',
    date: '2026-05-25',
    title: { en: 'Detailed truck silhouette + gravity field overlay', zh: '卡车轮廓重做 + 重心场可视化' },
    items: {
      en: [
        'The tractor + trailer drawn beneath the container is no longer a plain box. The cab is trapezoidal (wider/taller at the back), with a slanted windshield, a grille, and a roof deflector that point in the direction of travel.',
        'Each axle now shows a dual-wheel group with a centre-to-centre beam, plus a chassis beam and a kingpin marker — closer to a real semi-trailer profile.',
        'Balance tab gains a "Gravity field" toggle. With the 3D overlay on, the container floor is sampled (≤80 points) and shaded green → amber → red by distance from the load center, so the bias is visible at a glance.',
        'Cleaned up 87 leftover automated-test accounts from the production database; only operator accounts remain.',
      ],
      zh: [
        '货柜下方的牵引车 + 拖挂改成更真实的轮廓：驾驶室是梯形（后高后宽），带倾斜风挡、格栅、顶部导流罩，能直接看出车头朝向。',
        '每根车轴升级为双轮组并加横梁连接，新增车架纵梁和牵引销标记，更接近实拍半挂。',
        '装载重心面板新增「重心场」开关：3D overlay 开启后，柜底以 ≤80 个点采样，按到装载重心的距离做绿→黄→红渐变，重心偏置一眼可见。',
        '清理生产库残留的 87 个自动化测试账号，仅保留实际运营账号。',
      ],
    },
  },
  {
    version: '2026-05-25-r19',
    date: '2026-05-25',
    title: { en: 'Floating maximize, middle-mouse pan, admin nav', zh: '画布角最大化按钮 / 中键平移 / 管理员主导航入口' },
    items: {
      en: [
        'The Maximize button now sits in the top-right corner of the 3D canvas. Maximized mode keeps the pool sidebar and the precise-input panel visible so you can still place and tune cargo.',
        'In manual mode the middle mouse button pans the camera (left/right/up/down). The right mouse button still rotates and the scroll wheel still zooms.',
        'Administrators now have a dedicated "Users" tab in the top navigation alongside Workbench and History.',
      ],
      zh: [
        '「最大化」按钮浮动在 3D 画布右上角。最大化后仍保留待放置池和精确数值面板，确保仍能放置/微调货物。',
        '手动模式下中键拖动平移视角（左右上下），右键仍是旋转，滚轮仍是缩放。',
        '管理员主导航新增独立的「用户管理」入口，与「工作台 / 历史方案」并列。',
      ],
    },
  },
  {
    version: '2026-05-25-r18',
    date: '2026-05-25',
    title: { en: 'Maximize workspace, edge snap, vehicle profile, release notes', zh: '工作区最大化 / 边缘吸附 / 车型选择 / 通知栏' },
    items: {
      en: [
        'Manual workspace can be maximised to give the 3D canvas the full screen.',
        'Drag now snaps to container walls and neighbouring box edges within 30 mm.',
        'Balance tab lets you pick a vehicle profile (semi-trailer / flatbed / box-truck / container-only); the safe centre-of-gravity range and truck silhouette react.',
        'This in-app notifications panel lists what changed in each release.',
      ],
      zh: [
        '手动工作区新增「最大化」按钮，给 3D 画布更多空间。',
        '拖拽时自动吸附到货柜内壁和已放置箱体边缘（30mm 容差），可关闭。',
        '装载重心面板新增「车型」下拉（半挂 / 平板挂 / 厢式 / 仅货柜），安全重心范围与拖挂示意图按车型自动调整。',
        '新增「通知栏」站内通知，列出每个版本的关键改动。',
      ],
    },
  },
  {
    version: '2026-05-24-r17',
    date: '2026-05-24',
    title: { en: 'Drop preserves Z, ghost shows legality', zh: '上层落点保留 / Ghost 红绿守门' },
    items: {
      en: [
        'Dragging cargo from the pool onto an already-placed box now actually drops onto its top face.',
        'The drop ghost turns red when the position would be invalid; releasing on red simply does nothing.',
      ],
      zh: [
        '从左侧拖入货物到已放置箱体上方时，真正落在上层箱顶（之前会掉回地面）。',
        'Ghost 在非法位置变红，松手不再落下，避免「红的还放下了」的歧义。',
      ],
    },
  },
  {
    version: '2026-05-24-r16',
    date: '2026-05-24',
    title: { en: 'Pool ghost, precise panel, fill cap', zh: 'Pool 拖拽预览 / 精确数值面板 / 补装防卡死' },
    items: {
      en: [
        'Dragging from the pool now shows the placement preview the moment the cargo enters the canvas.',
        'New precise panel on the right of the manual workspace with XYZ inputs and quick-align buttons.',
        '"Add every preset" in Fill caps each preset at 50 per click so the calculator stays responsive.',
      ],
      zh: [
        '从左侧拖货物进入 3D 画布时立即显示落点预览。',
        '手动工作区右侧新增「精确数值面板」，可直接输入 XYZ 坐标或一键贴墙 / 居中 / 落地。',
        '补装建议「一键全部加入」对每个箱型上限 50 件，避免一次加入数千个导致浏览器卡死。',
      ],
    },
  },
  {
    version: '2026-05-24-r15',
    date: '2026-05-24',
    title: { en: 'Surface snap, balance overlay, fill suggestion', zh: '贴附拖拽 / 重心 3D / 补装建议' },
    items: {
      en: [
        'Surface-snap drag: A→B in one gesture by hovering above another box.',
        'Balance tab adds a 3D overlay with safe range and truck silhouette beneath the container.',
        'New Fill tab suggests how many standard preset boxes still fit and one-click adds them.',
      ],
      zh: [
        '贴附拖拽：拖到其它箱体上方一手势完成「A 放到 B 上」。',
        '装载重心面板新增 3D overlay：安全范围 + 拖挂示意图。',
        '新增「补装建议」面板，根据剩余空间列出标准箱型可装数量。',
      ],
    },
  },
]
