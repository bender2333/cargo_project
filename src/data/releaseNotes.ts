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
    version: '2026-05-26-r22',
    date: '2026-05-26',
    title: { en: 'Ruler, six-way manual rotation, import templates', zh: '尺规 / 六向手动旋转 / 导入模板' },
    items: {
      en: [
        'Layer wording is now "Layer view" so review/filtering is not confused with manual layer editing.',
        'Manual placement can choose all six orientations, with visible orientation controls and Shift+R cycling.',
        'The ruler overlay shows selected-box clearance to walls, ceiling, door side, and nearest neighbors.',
        'Excel import mappings can be saved as user-scoped templates and reused later.',
        'Balance view now has Packing / CoG / Mixed display modes so the gravity field does not hide the packing result.',
      ],
      zh: [
        '「逐层添加」统一改为「分层查看」，避免把复核过滤误解为按层编辑。',
        '手动排布支持六种朝向，新增可见朝向控件，Shift+R 可循环切换。',
        '新增尺规 overlay，选中箱体后显示到柜壁、顶部、门口和最近邻箱的余量。',
        'Excel 字段映射可保存为用户自己的导入模板，下次导入可复用。',
        '装载重心新增「装箱 / 重心 / 混合」显示模式，避免重心场遮挡自动排布结果。',
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
    title: { en: 'Maximize workspace, edge snap, vehicle profile, release notes', zh: '工作区最大化 / 边缘吸附 / 车型选择 / 新特性通知' },
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
        '新增「新特性」站内通知，列出每个版本的关键改动。',
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
