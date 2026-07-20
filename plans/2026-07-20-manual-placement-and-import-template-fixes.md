# 2026-07-20 手动排布与导入模板修复计划

## 目标

修复 `issues/0720` 中确认的三项问题：快捷放置的校验/渲染尺寸不一致、合法堆叠箱无法上下翻转、缺少批量货物导入模板下载入口。保留现有边界、重叠和支撑硬约束，不修改既有测试断言。

## 子任务 1：快捷放置朝向元数据一致性

- 根因：`src/lib/quickPlace.ts:100` 把已旋转世界尺寸当作 `makeManualBox()` 原始尺寸，再只覆盖 `orientationKey`，导致校验 AABB 与 `ContainerScene` 渲染 AABB 不一致。
- 修改：复用 `setManualBoxOrientation()` 从原始 `CargoItem` 尺寸生成完整朝向元数据，候选点坐标仍由 quick-place 决定；不改碰撞、边界和候选评分算法。
- RED：新增测试强制选择 `WLH`，断言 `base*`、`orientationAxes` 和 `renderedFootprint()` 与存储尺寸一致；增加 `issues/0720` 的 D 货尺寸 `530x305x360` 密集快捷放置回归。
- GREEN：`npx vitest run src/lib/quickPlace.test.ts`。
- 提交：`fix(manual): align quick-place orientation metadata`。

## 子任务 2：堆叠箱翻转保持支撑面

- 根因：`src/lib/manualPlacement.ts:228` 对所有非贴地箱保持垂直几何中心；高度变化后合法堆叠箱会离开或穿入原支撑面。
- 修改：若旋转前箱体当前接触地面或任一支撑面，则保持原 `z`；本来悬空的非贴地箱继续保持几何中心，保留既有测试语义。继续由 `validateDraft()` 决定旋转后支撑面积、边界、重叠和堆叠是否合法。
- RED：新增合法支撑箱上下翻转测试，要求 `dryRunRotation()` 成功、`z` 等于支撑顶面且无 `floating/overlap`；既有无支撑非贴地中心旋转测试不改。
- GREEN：`npx vitest run src/lib/manualPlacement.test.ts src/lib/orientationTransform.test.ts`。
- 决策记录：更新 `decision.md` 中 2026-06-05 的非贴地中心语义影响说明。
- 提交：`fix(manual): keep stacked rotations on support plane`。

## 子任务 3：下载标准批量导入模板

- 根因：当前“导入模板”仅指字段映射规则；React 工作台未迁移旧版的可填写工作簿下载能力。
- 修改：在 `导入 XLSX / Import XLSX` 旁增加下载按钮，复用现有 `xlsx` 客户端生成单工作表空白 `.xlsx`。中文界面使用解析器已支持的中文标准表头，英文界面使用标准字段名；不增加后端接口、依赖或静态二进制文件。
- RED：新增 Playwright 用例下载模板，验证文件名、工作表和表头；在内存中追加一行货物后回导，确认进入统一货物清单。
- GREEN：启动 Express 后端后运行新增用例，并运行现有俄罗斯、越南 Excel 夹具用例。
- 提交：`feat(import): add cargo template download`。

## 子任务 4：发布、全量验证与远程部署

- 新增 `src/data/releaseNotes.ts` 顶部双语 release note，覆盖三项用户可见修复。
- 本地门禁：`npm run lint`、`npm test`、`npm run build`、`npm run test:e2e`。
- 数据回归：复核 `issues/0720` 的 D 货密集快捷放置；运行 `test-data/excel/俄罗斯整托装柜尺寸.xlsx` 和 `test-data/excel/越南第十一批6.2海运.xlsx` 对应用例。
- 发布：提交 release note，推送 `main`，按 `CLAUDE.md`/`npm run deploy` 生产流程备份并部署，随后对 `http://101.33.232.150/` 运行远程 E2E。
- 部署结果、备份路径、线上 bundle 和远程 E2E 数量写回 `CHANGELOG.md` 并再次提交、推送。

## 回归门槛

- 任一逻辑箱体的 `renderedFootprint` 必须等于其存储 `length/width/height`。
- 不允许通过放宽边界、重叠、50% 支撑或修改既有测试断言获得绿灯。
- 堆叠翻转只改变锚点语义，不自动搜索新位置。
- 下载模板必须能被当前导入流程直接识别，不新增第二套解析规则。
