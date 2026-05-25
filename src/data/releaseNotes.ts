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
