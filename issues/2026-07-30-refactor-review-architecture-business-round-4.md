# 2026-07-30 重构第四轮复审与问题根因分析

## 1. 结论

- 审查结论：**BLOCKED**。
- 固定点：`b13b9fd608cd3c3d58c2e0815fcbe7f2d4d482c1`。
- 当前目标：`2dbe5c535dc36b6e6017095083204f93280e1f24`。
- 审查范围：`git diff b13b9fd...HEAD`，包含第三轮整改提交及其测试、合同和基线变化。
- 变更规模：51 个文件，约 `+5448/-1506`。
- 未纳入范围：工作区原有 `.codegraph/.gitignore`、`.serena/project.yml` 和 `issues/0720/` 未提交改动。
- 本轮性质：只读复审与根因分析；未修改运行时代码、测试、业务夹具或 benchmark baseline；未部署。

本轮整改确实关闭了一部分第三轮的直接缺陷，但没有把自动/手动结果、导入、历史、合规和性能门禁收敛成单一可验证合同。文档曾把任务 1–9 写成“收口”，而当前 fresh 证据仍显示任务 2–7 和任务 9 存在阻塞或部分完成项，因此不能宣称第三轮整改闭环。

## 2. Grok 本轮实际做了什么

| 任务 | 实际改动 | 本轮判断 |
| --- | --- | --- |
| 1. capacity-one | `canPlace` 增加向上乘员链检查；普通路径、volume 路径和 block engine 均经过候选校验 | **部分通过**：原 RED 转绿，但缺少对多级后插支撑的完整不变量证明 |
| 2. 共享终结 | 新增 `finalizePlacementGeometry`，手动路径使用；自动路径仍在 `packing.ts` 中独立拼装结果 | **Fail** |
| 3. 合规命令 | 新增 `evaluatePlanCompliance/assertPlanCompliant`，接入多个保存/导出命令 | **Partial**：活动模式、诊断集合和失败反馈不一致 |
| 4. 手动生命周期 | 新增 `draftInitialized`，补充尺寸和部分货物规则同步 | **Partial**：全局堆叠默认、朝向元数据、快捷键范围和跨状态恢复仍有问题 |
| 5. Excel 事务导入 | parser 预览、错误行阻断、正重量校验、模板默认值 round-trip | **Partial**：合法 auto-map 仍直接覆盖；缺重量可被隐藏默认值补成 1 |
| 6. 标签/朝向导出 | `labelStats` 按业务标签聚合，导出按 `orientationKey` 拆行 | **Partial**：核心函数方向正确，但关键测试可静默跳过，缺少完整 UI/E2E 合同 |
| 7. 历史快照 | 新增 `schemaVersion: 2`，保存 `PackingResult` 和手动草稿，旧记录确认后重算 | **Partial**：手动恢复时序和运行时校验不完整 |
| 8. 账号范围 | 用户管理改为只读登录审计，隐藏产品 CRUD | **Pass** |
| 9. 架构/性能 | App 懒加载 Workbench，抽出文案，保留受控动态页面加载 | **Partial**：懒加载重试失效，行数/props/ContainerScene/benchmark 未收口 |

## 3. 已确认的高优先级问题

### P1-1 自动与手动作业步骤仍不是同一结果合同

**证据**

- `src/lib/packing.ts:1309-1342` 独立执行支撑、深度和拓扑排序，但丢弃 `assignWorkStepsBySupport` 返回的 `ordered`，随后使用 `placed.map(...)` 生成 `workSteps`。
- `src/lib/finalizePackingResult.ts:133-158` 的手动路径使用 `ordered.map(...)`。
- `src/components/ResultsPanel.tsx:393` 直接按 `activeResult.workSteps` 数组展示。
- fresh Vietnam volume 结果的自动步骤序列出现：`322, 328, 330, 2, 4, 6, 8`；同一坐标经过共享终结器后为按步骤顺序排列。

**直接根因**

自动结果仍有第二套终结逻辑；拓扑排序只更新了每个箱体的 `workStep` 字段，没有把排序后的数组作为结果出口。

**系统根因**

`PackingResult` 没有唯一构造入口。所谓“共享 finalizer”是可调用工具，而不是自动/手动生产者必须遵守的边界；类型系统也没有表达 `workSteps` 必须与 `step` 顺序一致。

**测试为何漏过**

- canonical contract 会再次按 `step` 排序，掩盖运行时数组顺序错误。
- 现有测试主要断言单个箱体的 `workStep` 数值或快照哈希，没有断言结果数组顺序和展示顺序一致。

**影响**

2D/3D 可能显示正确的字段，但作业步骤、回放、loading sheet 的顺序来源不一致。违反任务 2 的“同坐标相同作业顺序”和 PRD 8/9 的结果一致性要求。

**修复方向**

自动和手动都只能调用同一个 `finalizePackingResult`；结果构造器内部返回排序后的 `workSteps`。增加不变量：`workSteps[i].step === i + 1`，且每条 `supportedBy` 边的 supporter step 小于被支撑箱 step。

---

### P1-2 手动历史恢复使用了恢复前的货物计划

**证据**

- `src/Workbench.tsx:1368-1383` 同一事件分别调用 `restoreHistory` 和 `restoreHistoryDraft`。
- `src/hooks/useManualPlacementSession.ts:458-470` 的恢复命令闭包使用当前 `cargoPlan`。
- `src/lib/manualPlacementSession.ts:214-225` 会按该计划执行 `reconcileDraft`。
- fresh 模块复现：保存 1 个 cargo A 箱体，在当前计划只有 cargo B 时执行 `historyDraftRestored`，恢复箱数为 `0`。

**直接根因**

Packing session 与 manual session 是两个独立 reducer；历史恢复不是一个原子 action。手动草稿先按旧计划裁剪，下一次 effect 才拿到恢复后的货物，但被裁掉的箱体已经不可逆丢失。

**系统根因**

状态边界按 UI hook 划分，而不是按“历史方案恢复”这个业务事务划分。代码保存了结果快照，却没有定义恢复时“输入、结果、手动草稿、校验计划”必须一起切换的版本边界。

**测试为何漏过**

现有测试分别覆盖快照序列化和 reducer 恢复，没有覆盖“当前货物与历史货物不同”的交叉场景，也没有断言恢复后 `packingResult.placed` 与 manual draft 逐箱一致。

**影响**

手动历史方案可能显示为手动模式，但草稿为空或缺箱；保存时的结果快照和恢复后的实际草稿形成两个合同。违反任务 7。

**修复方向**

建立单一 `restoreHistory` 事务：先用快照货物计划建立 manual session，再恢复 draft 和 result；或把 packing/manual 状态合并为带 `sessionRevision` 的恢复 action。恢复完成后必须验证 draft 与 result 的 cargoId、数量、坐标和朝向一致。

---

### P1-3 手动模式没有接入全局默认堆叠层数

**证据**

- `src/hooks/useManualPlacementSession.ts:201-215` 构造 `cargoPlan` 时只传货物自身 `maxStackLayers`。
- `src/Workbench.tsx:502-507` 没有向手动 hook 传入 `defaultMaxStackLayers`。
- fresh 复现：两个上下堆叠箱在未应用默认值时没有 issue；应用全局默认 `1` 后应产生 `max-stack-layers`，当前路径仍无 issue。

**直接根因**

自动算法用 `effectiveMaxStackLayers(item, defaultMaxStackLayers)`，手动校验只读取 CargoItem 字段；同一业务规则在两个生产者中有不同输入。

**系统根因**

“规则”没有作为结果计算上下文的一部分冻结。全局设置存在于 Workbench/packing session，手动 draft 只保存了局部货物属性。

**测试为何漏过**

测试覆盖了货物自有 `maxStackLayers` 的同步，没有覆盖“货物无自有上限、使用全局默认”的路径。

**影响**

手动非法堆叠不产生 blocking issue，统一合规守卫无法阻止保存/导出。违反任务 4，并使任务 3失效。

**修复方向**

把 `effectiveMaxStackLayers` 作为 manual session 的显式输入，并在 cargo plan、draft reconcile、validateDraft、历史恢复中使用同一冻结规则；为 own limit、global fallback、无限制三种情况分别加测试。

---

### P1-4 活动自动方案会被隐藏手动草稿阻断

**证据**

`src/components/ResultsPanel.tsx:295` 计算合规状态时无条件传入 `manualIssues`；`src/Workbench.tsx:1190-1320` 的保存/导出命令也无条件传入。`reviewChecklist` 在 `src/Workbench.tsx:855` 反而按 `placementMode` 正确过滤。

**直接根因**

`activeResult` 和 `manualIssues` 没有被封装成同一活动方案对象；调用方必须自行记住模式条件，导致不同出口条件不一致。

**系统根因**

合规守卫仍以 UI props 为中心，而不是以 `ActivePlan`/`PlanCommandContext` 为中心。隐藏状态与当前业务对象没有明确隔离。

**影响**

手动草稿改坏后切回自动，合法自动方案无法保存或导出；反过来，部分出口又可能漏掉真正活动方案的错误。

**修复方向**

建立唯一 `getActiveCompliance()`，只接受当前活动模式的结果和校验问题；所有按钮状态与命令都调用同一个函数，不在组件内拼参数。

---

### P1-5 诊断集合重复，复核出口与诊断出口不一致

**证据**

- `src/lib/manualSteps.ts:27-75` 已把手动 issue 映射成 diagnostic。
- `src/lib/reviewChecklist.ts:70-93` 又追加全部 manual issue。
- 一个 overlap 会得到 `diagnostic-overlap-check` 与 `manual-b1-overlap-0` 两个 error；复核清单 `errorCount` 为 2，而诊断集合为 1。
- 现有 `reviewChecklist.test.ts` 反而把诊断和手动条目同时存在当作通过。

**直接根因**

diagnostic 是结果层投影，manual issue 是编辑层原始问题；两者没有统一 ID/去重投影规则。

**系统根因**

业务模型同时保留了“来源事件”和“审核结论”，但没有定义哪个是权威集合。不同页面各自构造审核项目。

**修复方向**

选择一个权威诊断集合：建议由 finalizer/validation 汇总后生成唯一 diagnostic，复核清单只引用该集合并保留来源字段；JSON、Excel、按钮禁用状态全部消费同一集合。

---

### P1-6 自动映射仍绕过确认边界

**证据**

`src/Workbench.tsx:1166-1171` 对可自动映射且无错误的工作簿直接 dispatch `cargoImported`；只有非 auto-map 路径才打开 `CargoImportDialog`。

**直接根因**

“自动映射”被实现成“自动提交”，解析、预览和提交没有统一的 pending 状态。

**系统根因**

导入行为由输入格式分叉，而不是由统一的导入事务控制。错误批次被阻断了，但成功批次仍保留旧的即时覆盖旁路。

**影响**

用户选择合法但错误的文件后，当前货物立即被替换，无法取消。违反计划任务 5 和 `PRD.md:460-465`。

**修复方向**

auto-map 只产生预填映射和 pending parse；所有文件都进入同一个确认对话框。唯一的 `cargoImported` dispatch 必须位于显式确认回调内。

---

### P1-7 导入缺重量被隐藏默认值改成 1 kg

**证据**

`src/components/CargoImportDialog.tsx:105` 默认创建 `{ quantity: 1, weight: 1, ... }`；`src/lib/importCargo.ts:414-438` 会把默认值写入未映射字段和空单元格。

**直接根因**

模板默认值和临时映射默认值使用同一个对象，且没有“用户明确选择/确认默认重量”的状态。

**系统根因**

解析器没有区分三种语义：真实重量、用户明确配置的模板默认重量、临时 UI 初始值。默认值变成了静默数据修复。

**修复方向**

未选择模板时不注入重量默认值；已映射重量列的空值始终产生 `invalid-weight`；只有用户明确选择或保存的模板默认重量才可填充无重量列，并在预览中显示来源。

---

### P1-8 历史快照运行时校验不足

**证据**

`src/lib/historySnapshot.ts:87-105` 只检查 `container`、`cargoItems` 和 `packingResult.placed`。缺少 `layers/workSteps/labelStats/diagnostics`、非法枚举/数值、manual 模式缺 `manualDraft` 的 v2 数据仍被判为 snapshot。

服务端 `server/index.mjs:516-545` 只检查 `projectName` 和 truthy `data`，没有 schema 版本和结果完整性校验。

**直接根因**

TypeScript 类型 cast 被当作运行时验证；前端分类器和后端 POST 没有共享 validator。

**系统根因**

历史数据被当作普通 JSON 存取，而不是版本化、可验证的领域快照。快照边界没有定义必需字段、引用一致性和恢复前不变量。

**影响**

损坏快照可被保存、读取并注入当前 session；连续写入畸形记录还可能淘汰用户有效历史。违反任务 7 的“损坏/未知版本失败可见”。

**修复方向**

建立前后端共享或等价的运行时 validator：版本、柜体、货物、结果数组、有限数、枚举、ID 引用、manual draft 必需性和结果一致性全部验证；GET、POST、恢复三处都拒绝并可见报告错误。

另有大小合同不一致：前端/历史路由允许 `2,500,000` bytes，但 `server/index.mjs:27` 的全局 `express.json({ limit: '2mb' })` 会先拒绝约 2.1–2.5 MB 请求。

---

### P1-9 Workbench chunk 重试无效

**证据**

`src/App.tsx:7-10` 在模块顶层创建 `React.lazy`；`src/App.tsx:103-105` 的重试只改变 ErrorBoundary key。React 官方文档说明 lazy loader 的 Promise 和解析结果都会缓存，reject 后不会再次调用 loader。

**直接根因**

重试只重置了错误边界，没有重建 lazy component/loader。

**系统根因**

加载资源状态和页面错误状态混在一起；产品提供了“重试”动作，却没有对应的资源请求重试语义。

**修复方向**

将动态 import 封装为可重建的 loader，重试时递增 loader epoch 并创建新的 lazy 类型；增加 reject → retry → resolve 的真实测试，不接受只检查按钮出现的测试。

## 4. 其他未闭环问题

### P2-1 手动编辑禁用旋转后保留陈旧朝向元数据

`src/lib/manualPlacementSession.ts:71-113` 将 `orientationKey` 改回 `LWH`，但未同步清除旧的 `labelRotationDeg`、`yawQuarterTurn`、`pitchQuarterTurn`、`orientationAxes` 和 `orientationLabel`。2D/3D 可能显示 LWH 尺寸，却继续使用旧姿态。

### P2-2 快捷键仍作用于隐藏页面状态

`src/Workbench.tsx:691-704` 只检查 `placementMode`，不检查 `activeNav` 或手动工作区焦点。进入历史、模板或登录审计页后，Ctrl/Cmd+Z/Y 仍可修改隐藏草稿。

### P2-3 映射弹窗只有 ARIA 外壳

`src/components/CargoImportDialog.tsx:295-437` 有 `role="dialog"`、`aria-modal` 和标题关联，但没有初始焦点、focus trap、Escape 关闭和焦点恢复。背景 Workbench 仍可能接收焦点及全局快捷键。

### P2-4 导入实时预览缺少展开规模上限

文件限制按压缩文件大小（5 MB），但 `sheet_to_json` 没有行数/单元格展开上限；`pendingImport` 在每次映射变更时同步重解析全部行。大而高度压缩的工作簿可以冻结主线程或耗尽内存。

### P2-5 混合朝向测试可静默 no-op

`src/lib/exportPlan.test.ts:216-220` 在不足两个已装箱体时直接 `return`，没有断言失败。

### P2-6 `depthLayer` 仍为 optional

`src/types.ts:69` 仍声明 `depthLayer?: number`，而计划任务 2 要求完成结果必有该字段，canonical contract 也没有把缺失值作为错误拒绝。

### P2-7 全局性能与业务合同门禁仍 RED

fresh `npm run benchmark`：

- 5 个 contract hash 全部 mismatch；
- `canvasFirstNonEmptyPixelsMs` median `278.55 ms`，基线 `206.625 ms`，回退 `34.8%`；
- P95 `287.8 ms`，基线 `238.125 ms`，回退 `20.9%`；
- initial JS gzip `48,603 B`，相对旧基线 `292,322 B`，下降约 `83.4%`；
- total JS `685,873 B`，相对 `678,236 B` 增长约 `1.1%`。

包体改善不能抵消合同哈希和 3D 首像素门禁失败；不得更新 baseline 掩盖结果。

## 5. 问题根因总表

| 表象 | 直接根因 | 系统性根因 | 测试/流程为何漏过 |
| --- | --- | --- | --- |
| 自动/手动作业步骤不同 | 自动丢弃 ordered | 没有唯一 PackingResult 构造器 | canonical 排序掩盖展示顺序 |
| 手动历史丢箱 | 恢复使用旧 cargoPlan | 两个 reducer 没有原子恢复事务 | 缺少跨当前输入恢复测试 |
| 全局堆叠规则失效 | manual hook 未接默认值 | 规则没有冻结进 session context | 只测货物自有上限 |
| 非活动手动问题阻止自动 | guard 无活动模式概念 | 合规放在 UI props 而非命令上下文 | 复核清单和命令各自过滤 |
| 诊断重复 | diagnostic 与 manual issue 双投影 | 没有权威诊断集合 | 测试把重复当作预期 |
| auto-map 直接覆盖 | 成功路径直接 dispatch | 导入没有统一 pending/commit 边界 | 只测试错误批次 |
| 畸形历史可恢复 | 类型 cast 代替 runtime validator | 快照不是领域级版本合同 | 只测 null/未知版本/完全缺字段 |
| lazy 重试无效 | 只重置 ErrorBoundary | 资源重试和 UI 错误状态混淆 | Workbench 永久 mock 成功 |
| benchmark 不可信 | 业务合同和基线不同步 | 性能/正确性门禁未作为发布闸门 | 文档先写“收口”，验证后置 |

## 6. 这些问题为何集中出现

### 6.1 以“补丁接入”代替“生产者收口”

本轮新增了 finalizer、compliance、snapshot 等模块，但旧生产路径没有被删除。结果是新模块存在，旧旁路仍然有效。对于这类结果型业务，增加共享函数而不删除原构造路径，实际上会增加两个合同。

### 6.2 UI 状态和领域状态没有统一边界

`Workbench` 同时持有导航、模式、自动结果、手动草稿、导入弹窗和命令。很多守卫依赖调用方传入的多个 props，导致活动模式、隐藏草稿和当前结果之间出现组合错误。

### 6.3 快照只被当成 JSON，而不是可恢复领域对象

保存了更多字段并不等于快照可信。没有运行时 validator、版本迁移和原子恢复，字段越多，残缺数据进入结果模型后的失败面越大。

### 6.4 测试偏向“字段存在/快照相等”，没有覆盖状态交叉和失败边界

当前测试可以证明某个函数返回了字段，却没有证明：

- 两个生产者对同一坐标结果完全相等；
- 当前输入变化后恢复旧方案仍完整；
- 用户取消导入后所有状态不变；
- 错误出口数量和 ID 一致；
- 动态资源失败后真的可以重试；
- 测试前置条件不足时测试必须失败而不是 return。

### 6.5 文档状态先于证据更新

`CHANGELOG.md` 顶部将任务 1–9 描述为闭环，但同一记录又承认 benchmark 和架构目标未完成。本轮 fresh benchmark、真实作业步骤和手动恢复复现进一步证明业务闭环也未完成。状态文档必须由最终门禁结果驱动，不能由提交意图驱动。

## 7. 建议修复顺序

### 阶段 A：先建立不可绕过的红测试

1. 自动/手动同坐标 finalizer 等价测试。
2. `workSteps` 数组顺序与 `step` 连续性测试。
3. 当前货物不同的手动历史恢复测试。
4. 全局默认堆叠层数测试。
5. 活动模式合规测试和诊断唯一 ID 测试。
6. 合法 auto-map 文件确认前不改变 cargo、取消后 revision 不变测试。
7. malformed v2、manual draft、服务端 POST schema 测试。
8. lazy reject → retry → resolve 测试。

### 阶段 B：删除旁路并统一状态边界

- 自动和手动统一进入唯一 finalizer；删除自动手工拼装。
- 保存/导出统一消费 `ActivePlanCompliance`，不再直接传 `manualIssues`。
- 历史恢复改为一个 session transaction。
- auto-map 和手动映射统一进入 pending import confirmation。
- 前后端共用等价 snapshot validator。

### 阶段 C：补齐交互安全

- modal 初始焦点、Tab trap、Escape、焦点恢复。
- 快捷键限制到 `activeNav === 'overview'` 且焦点位于手动工作区。
- 所有阻断命令要么 disabled，要么显示结构化失败信息，不能只抛 rejected Promise。

### 阶段 D：最后处理性能和基线

- 先解释 3D 首像素回退和五个 contract hash 变化。
- 不修改阈值、样本数、夹具或断言，不直接更新 baseline。
- 只有业务合同、bundle、3D timing 和全量 E2E 同时通过后，才重新审批 baseline。
- 生产部署和远程 E2E 必须放在本地全绿之后。

## 8. Fresh 验证记录

| 验证项 | 结果 |
| --- | --- |
| `npm run lint` | 通过 |
| `npm test` | 通过：84 个 unit 文件 / 653 项，packing-performance 2 文件 / 6 项 |
| `npm run build` | 通过；保留大 chunk warning |
| `npm run test:e2e` | 通过：120 passed / 0 failed |
| `npm run benchmark` | **失败**：5 个 contract hash mismatch；3D 首像素 median/P95 超门限 |
| 真实手动恢复复现 | **失败**：历史 cargo A 在当前 cargo B 计划下恢复为 0 箱 |
| 全局默认堆叠复现 | **失败**：manual validation 未报告应有的 max-stack issue |
| 诊断重复复现 | **失败**：单一 overlap 投影为两个 checklist error |
| 生产部署/远程 E2E | 未执行 |

## 9. 最终判断

本轮不是“所有整改完成后的复审通过”，而是“部分修复有效、核心合同仍分裂”的状态：

- 算法局部校验和 31 托流程已有有效进展；
- 只读登录审计和部分导入/标签功能方向正确；
- 结果终结、手动恢复、合规投影、导入确认、快照验证和懒加载恢复仍有 P1；
- benchmark 仍为 RED，不能发布或部署。

下一轮应先关闭上述 P1，并以代码路径删除和跨状态红测试证明关闭，而不是继续增加旁路补丁或更新 baseline。
