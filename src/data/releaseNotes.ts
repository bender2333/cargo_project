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
    version: '2026-08-18-r67-import-mapping-columns',
    date: '2026-08-18',
    title: {
      en: 'Import mapping columns are freely selectable',
      zh: '导入映射列可自由选择',
    },
    items: {
      en: [
        'After you set the real header row, empty mapping fields are suggested from the file columns. You can still change any field, including quantity and weight.',
        'Vietnam combined-size sheets now suggest per-carton gross weight and carton count, not planned piece quantity or total gross weight.',
        'When the file has columns, mapping pickers are full dropdowns of every column instead of a filtered suggestion box.',
      ],
      zh: [
        '改到真实表头行后，空着的映射字段会按文件列给出建议；数量、重量等仍可改成任意列。',
        '越南合并尺寸表会优先建议单箱毛重和箱数，而不是预计发货数量或总毛重。',
        '文件里已有列时，映射控件是完整下拉，不再被当前输入过滤成只剩一项。',
      ],
    },
  },

  {
    version: '2026-08-07-r65-workspace-props-aggregation',
    date: '2026-08-07',
    title: {
      en: 'Cleaner workspace and report panel component boundaries',
      zh: '工作区与报告面板组件边界收口',
    },
    items: {
      en: [
        '3D/2D workspace props are grouped into manual, playback, render, and selection domain objects instead of dozens of loose fields.',
        'Results panel props are grouped into playback, loading steps, COG, compare, fill, export, and selection domains for the same reason.',
        'Behavior is unchanged: layer/label filtering, manual placement, export blockers, and keyboard shortcuts keep the same user-facing paths.',
        'Large-container packing is faster after finishing spatial-index wiring and hot-path scan reductions (same packing results).',
      ],
      zh: [
        '3D/2D 工作区 props 收成 manual / playback / render / selection 四个域对象，不再以几十个散字段透传。',
        '报告面板 props 同样收成回放、装柜步骤、重心、柜型对比、补货、导出与选择等域对象。',
        '行为不变：层级/标签过滤、手动装柜、导出阻断与键盘快捷键仍走原来的用户路径。',
        '完成空间索引热路径接线与扫描收口后，大柜体装箱更快（装箱结果不变）。',
      ],
    },
  },

  {
    version: '2026-08-07-r64-visual-selection-ownership',
    date: '2026-08-07',
    title: {
      en: 'Report panel now owns layer, label, and tab selection',
      zh: '报告面板收口层级、标签与页签选择状态',
    },
    items: {
      en: [
        'Layer, label, and result-tab selection states now live inside the Results Panel instead of the main Workbench, reducing cross-component wiring.',
        'Keyboard layer navigation and step-box selection are handled locally in the Results Panel without Workbench needing to track these states.',
        'Import failures and navigation shortcuts still trigger the correct report tabs as before — just through a cleaner internal path.',
        'Spatial grid index (SpatialGrid) added to the packing library as a foundation for future placed-box query performance improvements.',
      ],
      zh: [
        '层级、标签和结果页签的选择状态现由报告面板自行管理，不再由主工作台持有，减少跨组件接线。',
        '键盘层级导航和步骤选箱在报告面板内部处理，工作台不再需要追踪这些状态。',
        '导入失败和导航快捷键照常触发正确的报告页签，仅通过更清晰的内路径完成。',
        '空间网格索引（SpatialGrid）已加入装箱算法库，为后续已装箱查询性能优化打底。',
      ],
    },
  },

  {
    version: '2026-08-06-r63-packing-root-cause-and-boundaries',
    date: '2026-08-06',
    title: {
      en: 'Packing root-cause fixes and safer plan boundaries',
      zh: '装箱根因修复与更安全的方案边界',
    },
    items: {
      en: [
        'Automatic packing no longer treats non-restrictive stack limits like 99 as hard constraints, and block routing decides eligibility per SKU instead of flipping the whole load off one short box.',
        'Ground-only cargo stays enforced in Quick Place and in the automatic block-engine fallback, so floor-only goods are not silently stacked or skipped.',
        'Automatic and manual packing now share the same minimum support-ratio setting, so raising support stability in settings applies consistently across both modes.',
        'Editing a cargo label/color or the selected custom container no longer leaves a stale manual/automatic plan that cannot be saved or still uses old dimensions.',
        'Invalid manual boxes remain visible for editing but are excluded from loaded counts, volume, and layer summaries; custom container create/update now rejects impossible dimensions on the server.',
      ],
      zh: [
        '自动装箱不再把 99 这类非限制性堆叠上限当成硬约束；块路由按 SKU 判断资格，不会因为一只矮箱就把整批切出块引擎。',
        '必须落地货物在快捷放置和自动块引擎补装路径中都会继续强制落地，不会被静默上堆或跳过。',
        '自动与手动装箱共用同一套最小支撑率设置，在设置里提高稳定性后两种模式行为一致。',
        '修改货物标签/颜色或当前选中的自定义柜型后，不再留下无法保存的陈旧手动方案，也不会继续使用旧柜尺寸计算结果。',
        '违规手动箱体仍可见可改，但不再计入已装件数、体积和分层汇总；服务端创建/更新自定义柜型时会拒绝不可能的尺寸。',
      ],
    },
  },

  {
    version: '2026-08-06-r62-test-integrity-and-packing-gates',
    date: '2026-08-06',
    title: { en: 'Packing gates and reliability notes', zh: '装箱门禁与可靠性说明' },
    items: {
      en: [
        'Automatic packing keeps finite stack and ground-only constraints visible in block routing (d037df0), so non-restrictive max stack values are no longer treated as hard blockers by themselves.',
        'Same-SKU Quick Place continues to prefer the first upright orientation (6f864a9) when space and constraints allow.',
        'Production Excel import remains compatible with the shared SheetJS worker namespace shape (abf53d6).',
        'Release/test accounting is now machine-checkable: completed changelog sections cannot keep open checkboxes without an explicit supersede pointer.',
      ],
      zh: [
        '自动装箱在块路由中继续显式保留有限堆叠与必须落地约束（d037df0），非限制性最大堆叠层数本身不再被当作硬阻断。',
        '同 SKU 快捷放置在空间与约束允许时继续优先首个正立朝向（6f864a9）。',
        '生产 Excel 导入继续兼容共享 SheetJS worker 的命名空间导出形状（abf53d6）。',
        '发布/测试记账现可机器校验：已完成 CHANGELOG 段落不得在无 supersede 指向时保留未勾选项。',
      ],
    },
  },
  {
    version: '2026-08-05-r61-0802-packing-and-reliability',
    date: '2026-08-05',
    title: { en: 'Packing and reliability fixes', zh: '装箱与可靠性修正' },
    items: {
      en: [
        'Vietnam 40HQ automatic packing now places 877/877 boxes while preserving ground-only, stacking, geometry, and other packing constraints.',
        'Repeated Quick Place for the same SKU now prefers the first upright box orientation and reuses it when space and constraints permit; the existing alternate-upright fallback remains when that orientation is not legal.',
        'The Workbench chunk now preloads while the login screen is visible to reduce the wait after sign-in.',
        'Delayed history saves no longer override navigation that happens after the save starts.',
      ],
      zh: [
        '越南 40HQ 自动装箱现可装入 877/877 箱，并继续遵守必须落地、堆叠、几何等装箱约束。',
        '同一 SKU 连续使用「快捷放置」时，现在优先首个正立箱体的朝向，并在空间与约束允许时复用；该朝向不合法时仍沿用现有的其他正立朝向回退。',
        '登录界面显示期间现会预加载工作台 chunk，以减少登录后的等待。',
        '延迟完成的历史保存不再覆盖保存开始后发生的导航。',
      ],
    },
  },
  {
    version: '2026-07-30-r60-plan-integrity-and-history-snapshots',
    date: '2026-07-30',
    title: {
      en: 'Plan integrity, imports, and history snapshots',
      zh: '方案完整性、导入事务与历史快照',
    },
    items: {
      en: [
        'Automatic packing now rejects stack-capacity violations when a new box is inserted under existing cargo, so capacity-one goods cannot silently carry riders.',
        'Save and formal exports are blocked whenever the active plan has error diagnostics or blocking manual issues, including history save, XLSX, PDF, review, and current-view export.',
        'Excel import requires positive finite weight, previews parse results before confirm, and never replaces current cargo while error rows remain.',
        'Label statistics merge cargo rows under the same business label, and plan export splits mixed orientations into one row per orientation with exact counts and actual dimensions.',
        'History now stores versioned result snapshots for exact restore; older input-only records are marked as templates and recompute only after explicit confirmation.',
        'Admin account management is a read-only login audit. Create/disable/delete actions are no longer product UI.',
        'The login shell loads the workbench on demand, with a recoverable state if the workbench chunk fails.',
      ],
      zh: [
        '自动装箱在新箱插入已有货物下方时也会校验堆叠容量，capacity-one 货物不能再静默承载上层箱。',
        '当前方案存在 error 诊断或阻塞性手动问题时，保存与正式导出一律阻断，覆盖历史保存、XLSX、PDF、复核和当前视图导出。',
        'Excel 导入要求重量为正有限数，确认前可预览解析结果；存在错误行时不会覆盖当前货物。',
        '标签统计按业务标签聚合；导出走 cargo×orientation 拆行，精确给出每种朝向数量与实际尺寸。',
        '历史方案保存版本化结果快照，可精确恢复；旧的仅输入记录标为模板，需确认后才按当前算法重算。',
        '管理员账号入口改为只读登录审计，产品界面不再提供创建/禁用/删除。',
        '登录壳按需加载工作台；工作台 chunk 失败时有可恢复状态。',
      ],
    },
  },
  {
    version: '2026-07-28-r59-manual-compliance-and-data-fidelity',
    date: '2026-07-28',
    title: { en: 'Manual plan compliance and data fidelity', zh: '手动方案合规与数据保真' },
    items: {
      en: [
        'A manual plan that breaks a rule can no longer be saved or exported: total weight over the container payload is now checked alongside bounds, overlap, floating, and stack limits, and the save and export buttons stay disabled until every blocking issue is cleared.',
        'The diagnostics tab now reflects manual placement instead of staying empty, so boundary, overlap, support, stacking, and overweight problems are visible in the same place as automatic ones.',
        'Editing a cargo definition now updates boxes already placed by hand. Changing weight, stackability, stack limit, or floor-only no longer leaves old and new rules coexisting for the same cargo.',
        'Business labels imported from Excel keep their full text when edited. A label such as TB-C10-EV_v1.1 is no longer silently cut to two characters, so labels stay consistent across entry, 3D, layers, details, export, and history.',
        'A negative weight in an imported workbook is now treated as zero instead of cancelling out other cargo, so the payload limit can no longer be bypassed.',
        'The plan export leaves actual dimensions blank and notes the orientations when one cargo is loaded in more than one orientation, instead of presenting the first box as if it represented all of them.',
      ],
      zh: [
        '违规的手动方案不再能保存或导出：总重量超过货柜载重现已与越界、重叠、悬空和堆叠层数一并校验，存在阻塞性问题时保存与导出按钮保持禁用。',
        '诊断页现在会反映手动排布状态，不再恒为空白；越界、重叠、支撑、堆叠和超重问题与自动模式在同一处可见。',
        '编辑货物定义现在会同步已手动放置的箱体。修改重量、可堆叠、最大堆叠层数或仅限地面后，同一货物不再同时存在新旧两套规则。',
        '从 Excel 导入的业务标签在编辑后保留完整文本。类似 TB-C10-EV_v1.1 的标签不再被静默截断为两个字符，标签在录入、3D、分层、明细、导出和历史之间保持一致。',
        '导入表格中的负数重量现按 0 处理，不再抵消其他货物重量，载重上限无法再被绕过。',
        '同一货物存在多种实际朝向时，导出的实际尺寸留空并注明朝向组合，不再用第一个箱体的尺寸代表全部箱体。',
      ],
    },
  },
  {
    version: '2026-07-28-r58-layer-support-contract',
    date: '2026-07-28',
    title: { en: 'Correct layers, support, and loading order', zh: '分层、支撑与装柜顺序修正' },
    items: {
      en: [
        'Layers now express vertical stacking as intended: a box on the floor is layer 1, and a box resting on another enters a higher layer. Loading depth (pushing cargo from the far wall outward) is tracked separately and no longer overwrites layer and support data.',
        'Support relationships now match real base-face contact and are recomputed after placement, so a supporting box added later is no longer missing from the box it carries.',
        'Loading steps now guarantee that every supporting box is loaded before the boxes resting on it, which was previously reversed for a large share of stacked cargo.',
        'Loaded quantity and utilization are unchanged by this correction — only layer, support, and step order were wrong before.',
      ],
      zh: [
        '分层现在按设计表达垂直堆叠：落地箱为第 1 层，压在其他箱体上的进入更高层。装柜推靠深度（自里向外推货）独立记录，不再覆盖分层与支撑数据。',
        '支撑关系现与真实底面接触一致，并在放置完成后重算，后加入的支撑物不再从被支撑箱的支撑清单中缺失。',
        '装柜步骤现保证支撑物一定先于压在其上的箱体装载；此前相当比例的堆叠货物顺序是颠倒的。',
        '本次修正不改变装入数量与利用率——此前错误的只有分层、支撑和作业顺序。',
      ],
    },
  },
  {
    version: '2026-07-23-r57-template-manager-boundary',
    date: '2026-07-23',
    title: { en: 'Reliable template manager boundary', zh: '模板管理页面边界' },
    items: {
      en: [
        'Import and export template drafts, sample headers, and page feedback now stay inside the template manager instead of the packing workbench.',
        'The manager, import mapping dialog, and export toolbar still share one protected template catalog, including retries and stale-response handling.',
        'Template manager UI now loads only when that page is opened, keeping login and the main workbench bundle focused.',
        'Delayed saves or deletes no longer clear a newer edit, and leaving the manager cannot surface feedback from an old page operation.',
        'If a stale deployment chunk cannot load, the workbench stays available with clear reload and close recovery actions.',
      ],
      zh: [
        '导入/导出模板草稿、样本表头和页面反馈现已收口到模板管理页，不再混入装箱工作台状态。',
        '管理页、导入映射弹窗和导出工具栏继续共享同一套受保护模板目录，包括重试与陈旧响应处理。',
        '模板管理 UI 仅在首次打开该页面时加载，登录和主工作台初始包不再携带页面专属代码。',
        '延迟完成的保存或删除不再清除后来开始的编辑；离开管理页后也不会弹出旧页面操作的反馈。',
        '旧会话若无法加载已失效的部署 chunk，工作台仍保持可用，并明确提供重新加载和关闭恢复操作。',
      ],
    },
  },
  {
    version: '2026-07-23-r56-cargo-library-boundary',
    date: '2026-07-23',
    title: { en: 'Reliable cargo library boundary', zh: '货物库页面边界' },
    items: {
      en: [
        'Cargo library loading, retries, stale-response protection, and CRUD refreshes now run through one dedicated controller instead of the packing workbench.',
        'Creating and editing saved cargo keeps quantity-at-use fixed to one, normalizes labels, and removes stack limits whenever stacking is disabled.',
        'The cargo library page now owns its temporary form and feedback, while adding a saved item still updates the current packing session through the existing workflow.',
      ],
      zh: [
        '货物库加载、重试、陈旧响应保护和 CRUD 后刷新现已统一收口到独立 controller，不再混入装箱工作台状态。',
        '新建和编辑已保存货物时继续固定单次使用数量为 1、规范化标签，并在关闭堆叠时清除最大堆叠层数。',
        '货物库页面现在自行管理临时表单和反馈；把已保存货物加入当前方案仍沿用既有装箱会话流程。',
      ],
    },
  },
  {
    version: '2026-07-23-r55-history-page-boundary',
    date: '2026-07-23',
    title: { en: 'Reliable history page boundary', zh: '历史方案页面边界' },
    items: {
      en: [
        'History loading, saving, deletion, retries, and stale-response protection now run through one dedicated page controller instead of the packing workbench.',
        'Saving from either the results toolbar or History page uses the same refresh path, while restoring a plan still updates the packing session atomically.',
        'History load failures remain visible and retryable, and an older delayed response can no longer replace the latest plan list.',
      ],
      zh: [
        '历史方案的加载、保存、删除、重试和陈旧响应保护现已统一收口到独立页面 controller，不再混入装箱工作台状态。',
        '从结果工具栏或历史页保存都会走同一刷新链路；恢复方案仍以原子方式更新装箱会话。',
        '历史加载失败继续明确显示并可重试，较早返回的延迟响应不会再覆盖最新方案列表。',
      ],
    },
  },
  {
    version: '2026-07-23-r54-manual-session-active-result',
    date: '2026-07-23',
    title: { en: 'Manual sessions and active results', zh: '手动会话与活动结果' },
    items: {
      en: [
        'Manual placement now owns mode, selection, history, validation, and editing commands as one session, while every shared result view reads the current automatic or manual plan consistently.',
        'Reducing quantities or deleting cargo trims every manual undo/redo branch, so obsolete or excess boxes cannot remain visible or return through history.',
        'Continuing from an automatic plan preserves the real 3D pose and future rotation basis; manual debug summaries and 2D view exports now use the active manual plan.',
      ],
      zh: [
        '手动排布现在以单一会话统一管理模式、选择、历史、校验和编辑命令；所有通用结果视图会一致读取当前自动或手动方案。',
        '减少数量或删除货物时会同步裁剪手动撤销/重做的全部分支，过期或超额箱体不会继续显示，也不会被历史操作复活。',
        '从自动方案继续手动微调会保留真实 3D 姿态和后续旋转基准；手动调试摘要与 2D 视图导出也会使用当前活动方案。',
      ],
    },
  },
  {
    version: '2026-07-23-r53-packing-session-history-restore',
    date: '2026-07-23',
    title: { en: 'Concurrent-safe packing sessions', zh: '并发安全的装箱会话' },
    items: {
      en: [
        'Automatic packing results are now tied to the exact input revision, so delayed calculations cannot overwrite newer cargo or container changes.',
        'History restore now updates the project, shipment, container snapshot, cargo, loading rules, and result as one session transition.',
        'Restoring a saved plan no longer changes the user default stack setting for future sessions.',
      ],
      zh: [
        '自动装箱结果现在绑定到精确的输入版本，延迟计算不会覆盖更新后的货物或柜型变化。',
        '历史方案恢复现在以一次会话状态转换同时更新项目、装运、柜型快照、货物、装载规则和结果。',
        '恢复历史方案不再改变用户未来新会话的默认堆叠层数设置。',
      ],
    },
  },
  {
    version: '2026-07-21-r52-refactor-safety-baseline',
    date: '2026-07-21',
    title: { en: 'Frontend refactor safety baseline', zh: '前端重构安全基线' },
    items: {
      en: [
        'Frontend architecture work now starts from a repeatable regression baseline that runs every browser scenario against an isolated API and database.',
        'Release verification now fails when any browser scenario is skipped, including the restored responsive 3D workspace check.',
        'The administrator log panel is now verified through the full server-to-screen flow, preventing a failed log request from appearing successful.',
      ],
      zh: [
        '前端架构重构现已建立可重复回归基线；全部浏览器场景会使用隔离的 API 与数据库运行，不影响开发数据。',
        '发布验证现在会在任一浏览器场景被跳过时失败，响应式 3D 工作区检查也已恢复为每次实际执行。',
        '管理员日志面板现已覆盖从服务端读取到界面显示的完整链路，日志请求失败不再呈现为测试成功。',
      ],
    },
  },
  {
    version: '2026-07-20-r51-manual-placement-template-download',
    date: '2026-07-20',
    title: { en: 'Safer manual placement and import template', zh: '手动放置修正与导入模板' },
    items: {
      en: [
        'Quick Place now validates bounds and collisions using the same real orientation dimensions shown in 3D, preventing visual overlaps and out-of-container placement.',
        'Flipping supported cargo up or down now keeps its original support plane; rotations that would leave upper cargo floating or overlapping are rejected.',
        'A directly re-importable blank standard template is now available beside Import XLSX.',
      ],
      zh: [
        '快捷放置现在使用与 3D 显示一致的真实朝向尺寸校验边界和碰撞，避免视觉重叠或越箱。',
        '已受支撑货物上下翻转时会保持原支撑面；若旋转会让上层货物浮空或重叠，则拒绝旋转。',
        '「导入 XLSX」旁新增可直接回导的标准空白模板下载。',
      ],
    },
  },
  {
    version: '2026-07-08-r50-loading-modes-priority-removal',
    date: '2026-07-08',
    title: { en: 'Distinct loading modes', zh: '装载模式真正分化' },
    items: {
      en: [
        'Quantity mode now prefers blocks that place more cartons first, while Volume mode keeps choosing larger-volume blocks first.',
        'Vietnam 20GP now produces different Quantity and Volume plans instead of identical results.',
        'The deprecated First/Normal priority field has been removed from cargo forms, import templates, saved mappings, and packing output.',
      ],
      zh: [
        '数量优先现在先选择可装更多箱的块；体积优先继续先选择大体积块。',
        '越南十一批 20GP 的数量/体积两种模式现在会产出不同方案，不再完全一致。',
        '已废弃的「先装/普通」优先级字段已从货物表单、导入模板、保存映射和装箱输出中移除。',
      ],
    },
  },
  {
    version: '2026-06-30-r49-loading-priority-ground-only',
    date: '2026-06-30',
    title: { en: 'Ground-only cargo and import flow', zh: '必须落地与导入流程' },
    items: {
      en: [
        'Cargo can now be constrained to Ground only from the cargo form, edit dialog, cargo library, and Excel import templates.',
        'Automatic packing keeps ground-only cargo on the container floor, then fills pallet tops and gaps under the updated support threshold.',
        'Large workbook imports no longer block on unrelated background packing; packing runs when you click Load.',
      ],
      zh: [
        '货物现在可在录入、编辑、货物库和 Excel 导入模板中设置「必须落地」。',
        '自动装箱会让必须落地货物保持在柜底，再按更新后的支撑阈值填充托顶和缝隙。',
        '大型工作簿导入不再被无关后台装箱阻塞；点击「装箱」时才执行排布计算。',
      ],
    },
  },
  {
    version: '2026-06-18-r48-template-prefill-confirm',
    date: '2026-06-18',
    title: { en: 'Templates prefill mappings for review', zh: '模板先预填，确认后导入' },
    items: {
      en: [
        'Selecting a saved Excel import template now only applies its mapping parameters in the dialog. The dialog stays open so you can review the preview and click Confirm Import when ready.',
        'Missing template columns still show red inline feedback immediately after selection, so you can fix the mapping before importing.',
      ],
      zh: [
        '选择已保存的 Excel 导入模板后，现在只会把模板参数预填到弹窗里。弹窗保持打开，用户可先查看预览，再点击「确认导入」。',
        '模板列缺失时仍会在选择后立即红框提示，方便导入前现场修正映射。',
      ],
    },
  },
  {
    version: '2026-06-18-r47-template-select-import',
    date: '2026-06-18',
    title: { en: 'Template immediate-import behavior superseded', zh: '选择模板即导入行为已调整' },
    items: {
      en: [
        'This interim immediate-import behavior has been superseded: selecting a template now pre-fills the mapping dialog only, and importing requires the Confirm Import button.',
      ],
      zh: [
        '这一版“选模板即导入”的过渡行为已被取代：现在选择模板只预填映射弹窗，真正导入仍需点击「确认导入」。',
      ],
    },
  },
  {
    version: '2026-06-18-r46-save-template-remember',
    date: '2026-06-18',
    title: { en: 'Saved template behavior superseded', zh: '保存模板行为已调整' },
    items: {
      en: [
        'This interim saved-template auto-apply behavior has been superseded by the current explicit prefill-and-confirm flow: new imports start with “No template”, selecting a template fills the mapping dialog, and importing requires Confirm Import.',
      ],
      zh: [
        '这一版“保存后下次自动套用”的过渡行为已由当前“显式选择、预填、再确认”流程取代：新的导入默认「无模板」，选中模板只填充映射弹窗，真正导入仍需点击「确认导入」。',
      ],
    },
  },
  {
    version: '2026-06-17-r45-upright-boxes-and-gaps',
    date: '2026-06-17',
    title: { en: 'Upright boxes & tighter packing', zh: '箱体正立与无缝排布' },
    items: {
      en: [
        'Fixed boxes that rendered upside-down in 3D: cargo turned 90° (width-along-length) now shows upright, readable labels instead of inverted text and blank top faces.',
        'Identical cargo now packs in a single consistent orientation, so rows share one pitch and the alternating side gaps between same-product boxes are gone.',
        'Boxes are no longer tipped onto their side or end to squeeze in; a box still switches orientation only when that is the sole way it fits.',
      ],
      zh: [
        '修复 3D 中箱体倒置显示的问题：货物旋转 90°（宽沿柜长）后现在正立显示、标签可读，不再出现颠倒文字和无标签的顶面。',
        '相同货物现在按统一朝向排布，行距一致，同一产品箱体之间交替出现的侧向缝隙已消除。',
        '不再为塞进货物而把箱体侧倒或竖立；仅当唯一能放下的方式就是换朝向时，箱体才会换朝向。',
      ],
    },
  },
  {
    version: '2026-06-17-r44-template-entry-consolidation',
    date: '2026-06-17',
    title: { en: 'Template entry consolidation', zh: '模板入口收敛' },
    items: {
      en: [
        'Template management now has one management entry: the toolbar duplicate "Import template manager" button is gone; use the navigation "Template manager" page for creating, editing, deleting, import templates, and export templates.',
        'New import templates no longer need a sample workbook first. In the template manager page, every mapped column field is now a fillable input with optional datalist suggestions, so you can type headers such as Goods, L, W, H directly.',
        'Loading sample headers remains available as an optional helper: after uploading a sample workbook, the same inputs offer suggestions from the file while still allowing custom typed column names.',
        'The real Excel import dialog keeps its save-template controls. When a workbook is open, the same fillable mapping inputs show the real file columns as suggestions and saved templates still appear in the one template list.',
        'Combined-dimension mode is cleaner: the ordinary "dimensions" mapping field is no longer rendered; only the dedicated combined-size column plus split-order controls own that mapping.',
        'E2E coverage now checks pure hand-typed template creation, optional sample-header suggestions, the removed toolbar entry, reused templates, remembered raw mappings, and the Vietnam combined-dimension fixture.',
      ],
      zh: [
        '模板管理现在只保留一个管理入口：工具栏重复的「导入模板管理」按钮已删除；统一从导航「模板管理」页创建、编辑、删除导入模板与导出模板。',
        '新建导入模板不再必须先加载样本文件。模板管理页的每个列映射字段都改为可输入框 + 可选建议，Goods、L、W、H 等表头可直接手填。',
        '「加载样本表头」仍保留为可选辅助：上传样本后，同一输入框会给出文件列建议，同时仍允许输入自定义列名。',
        '真实 Excel 导入弹窗保留顶部「命名 + 保存模板」控件。打开工作簿时，同一套可输入映射框会用真实文件列做建议，保存后的模板仍进入统一列表。',
        '合并尺寸模式更干净：普通字段区不再渲染裸的 "dimensions" 映射项；合并尺寸列只由专门的合并列 + 拆分顺序控件负责。',
        'E2E 已覆盖纯手填新建模板、样本表头建议、删除的工具栏入口、模板复用、裸映射记忆，以及越南合并尺寸夹具。',
      ],
    },
  },

  {
    version: '2026-06-16-r43-template-unify-export',
    date: '2026-06-16',
    title: { en: 'Unified templates, export templates, and mapping fixes', zh: '模板统一 / 导出模板 / 映射修正' },
    items: {
      en: [
        'Export templates: pick which columns to export, reorder them, rename headers, and set mm/cm units — then choose a template beside Export XLSX. No template selected keeps the full default columns.',
        'Template manager page now uses the same dropdown mapping form as the import dialog (load a sample workbook to populate column choices) — one consistent mapping experience everywhere.',
        'Manually mapped imports are remembered: reopen the import dialog and your last mapping, units, and rows are prefilled even without saving a named template.',
        'Combined dimension mode auto-fills length/width/height from the combined column — the redundant standalone selectors are now hidden.',
        'Field help bubbles (header row, dimension mode, …) are no longer clipped by the dialog edge; they render above everything and stay inside the viewport.',
      ],
      zh: [
        '导出模板：自选导出列、调整顺序、自定义表头名、设置 mm/cm 单位，导出 XLSX 旁选择模板即可；不选模板时仍输出完整默认列。',
        '模板管理页改用与导入弹窗一致的下拉映射表单（加载样本表头填充列候选）——三处映射体验统一。',
        '手填映射会被记住：重开导入弹窗时，上次的映射、单位与表格行已自动预填，无需显式命名保存模板。',
        '合并尺寸模式下长/宽/高由合并列自动填充，冗余的独立选择器已隐藏。',
        '字段帮助气泡（表头行、尺寸模式等）不再被弹窗边缘裁切，悬浮在最上层并夹紧在视口内。',
      ],
    },
  },

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
