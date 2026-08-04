# 0802 问题分析（证据复核与根因边界）

- 日期：2026-08-03
- 复核对象：`issues/0802/issue.txt`、两个货物快照、PNG 截图、当前 HEAD `ccc15f135458bdad864c29861a3811e15650e73e`、当前源码、测试与 `decision.md`。
- 本文只做根因定位、证据分级和待验证项，不是产品实施计划。
- 本次复核不修改产品代码；工作区已有的 `.serena/project.yml`、`decision.md` 和 `issues/0802/` 其他材料均须保留。

---

## 证据边界

`issues/0802/issue.txt:1-3` 明确包含两项用户反馈：

1. 越南 40 尺自动排布从用户所述的 873 变为 860，仍有货物未装完。
2. 手动排布同一个产品型号时方向混摆，不能自动对齐。

旋转箭头一项不是 `issue.txt` 中的用户反馈。它来自本分析的代码推断；PNG 只展示自动结果和底部空隙，没有选中箱体或旋转 gizmo；两个快照没有序列化箭头几何或渲染帧；附加 MP4 当前工具无法读取帧。因此旋转箭头只能标为**候选显示缺陷**，不能标为本轮已确认用户问题。

本次证据分三类：

- **当前已证实**：快照直接记录的输入/输出，当前源码的路由和参数流，当前已有测试覆盖的合同。
- **历史实验记录**：原分析中提到的 7/22 detached worktree、临时脚本及其 873/842/855/877 数值。原分析说明脚本和 worktree 已删除，仓库没有可独立复跑的实验产物，因此不能当作当前门禁或提交级证明。
- **未验证**：99 与 `groundOnly` 的上游来源、混合 `groundOnly` 时的块选择修法、浏览器中的 CW/CCW 外观，以及手动快照中的箱子是否均由 quick-place 产生。

---

## 摘要

| # | 用户反馈 | 当前证据支持的根因 | 性质 | 状态 |
|---|---|---|---|---|
| 1 | 越南 40 尺自动排布只装 860，用户称 7/22 为 873 | 当前输入属性使块引擎关闭；当前快照输出 860/877 | 输入/路由交互；7/22 差异仍是历史实验记录 | **实施后聚焦复核已通过；873 仍为历史记录，见「2026-08-04 实施复核」** |
| 2 | 手动同型号方向混摆 | `quickPlaceCargo` 调用 `placementScore` 时未传 `committedOrientation` | 代码缺陷 | **实施后聚焦单测与 Chromium 流程已通过，见「2026-08-04 实施复核」** |
| 3 | 旋转箭头左右都显示顺时针 | `HANDLE_SPECS` 两个相对手柄都按正向角度扫掠，存在静态非镜像风险 | 候选显示缺陷 | **静态结构已证实；用户报告和屏幕方向未验证** |

补充结论：当前代码确实要求所有型号同时满足「非 `groundOnly`、可堆叠、`maxStackLayers === undefined`」才进入块引擎。是否应扩大该门槛，必须分别验证有限堆叠上限和 `groundOnly` 地面选择；不能把“全部强制走块引擎”当作无条件修复。

---

## 复现环境与当前快照事实

两个 `issues/0802/cargo-debug-snapshot*.json` 的排序后 `cargo.items` 和自动结果摘要一致。快照 `(5)(2)` 另外包含手动草稿，不能把它的手动箱体数量与快照 `(4)(3)` 的空手动草稿混用。

- 柜型：40HQ，`12030 × 2350 × 2690 mm`，`maxWeight 29600`，三个 gap 均为 0。
- 装载模式：`quantity`。
- 货物：28 个型号，数量合计 877 箱。
- 每个快照中的型号都有 `maxStackLayers: 99`。
- 只有型号 27（`TC-F02-EV_v1.0`，`390×335×310`，28 箱）为 `groundOnly: true`；其他型号为 false。
- 两个快照的自动结果都是 `placedCount=860`、`totalCargoCount=877`。
- 未装入清单为：标签 3 数量 4、标签 25 数量 6、标签 18 数量 4、标签 10 数量 3；全部为 `reasonCode=no-space`，合计 17 箱。
- 截图中的 860、8897 kg、30.1% 重量利用率、78.2% 体积利用率及红框空隙与上述自动快照相符。
- 快照 `(5)(2)` 的手动草稿共有 162 箱；其中 `cargo-ms2n5q2z-l2gk97no`、标签 13 的 36 箱方向分布为 `LWH:13`、`WHL:4`、`WLH:19`。这证明手动草稿存在混合方向，但快照不记录这些箱子是 quick-place、拖拽还是显式旋转产生的。

---

## 问题一：860 vs 873

### 1. 当前源码能确认的路由

`src/lib/packing.ts:864-870` 的 `shouldUseBlockEngine` 要求：

```ts
export function shouldUseBlockEngine(cargoItems: CargoItem[], loadingMode: LoadingMode): boolean {
  const totalCargoCount = cargoItems.reduce((sum, item) => sum + item.quantity, 0)
  return (loadingMode === 'quantity' || loadingMode === 'volume')
    && cargoItems.length >= 2
    && totalCargoCount >= 100
    && cargoItems.every((item) => !item.groundOnly && item.stackable && item.maxStackLayers === undefined)
}
```

当前快照同时违反了两个门槛条件：所有型号显式带有限 `maxStackLayers:99`，并且型号 27 为 `groundOnly:true`。因此当前代码会进入非块路径；这是当前源码和快照共同证明的事实。它不能单独证明用户所述的 7/22 输出，也不能单独证明 13 箱差量只由 `groundOnly` 造成。

`src/lib/blocks.ts:31-85` 已经在候选生成时处理有限堆叠上限，并把 `groundOnly`/不可堆叠候选限制为 `nz=1`。`src/lib/packing.ts:330-348` 的 `canPlace` 以及 `:1053-1064` 的块暂存流程仍会检查越界、重叠、支撑率和堆叠/落地约束。因此问题不是导入器把约束字段清掉，而是块路径的适用边界和候选选择尚未覆盖这类混合输入。

### 2. 7/22 对照表的证据等级

原分析记录了以下临时实验：

| 数据变体 | 块引擎 | 7/22 代码 | 当前代码 |
|---|---|---:|---:|
| 原样，99 + 型号 27 `groundOnly:true` | 关 | 860 | 860 |
| 仅型号 27 `groundOnly:false` | 关 | 873 | 873 |
| 全部 `maxStackLayers:undefined`，保留 groundOnly | 关 | 858 | 858 |
| `maxStackLayers:undefined` 且无 groundOnly | 开 | 877 | 877 |

这组数据可以作为**历史实验记录**保留，但不是当前仓库可独立复跑的门禁：临时脚本和 `.worktrees/at-0722` 已删除，两个 supplied snapshot 都只包含 860，没有 873；仓库也没有同一份 877 箱输入与 old/current runner 的提交产物。当前 HEAD 相对 `a2432a3` 的 `src/lib/packing.ts` 存在实质改动，所以“7/22 至今零影响”只能限定为“原实验声称对该输入输出相同”，不能泛化为当前代码不存在算法回归。

同样，原分析中的强制块引擎 `842/855/877`、地面覆盖率 `82.04%` 和“所有诊断 clean”均是已删除实验的历史数值，不是当前仓库证据，不能直接作为修法验收阈值。

### 3. 属性来源尚未闭环

当前 `src/lib/importCargo.ts:196-345` 的 `parseCargoRows` 会读取行字段；`src/lib/importCargo.ts:424-456` 的模板路径还会在源单元格空缺时应用已保存模板默认值，再交给同一解析器。快照只保存解析后的 `CargoItem`，没有保存源工作簿、字段映射、模板 ID/defaults、历史来源或手动/自定义货物来源。

因此：

- `groundOnly:true` 不能证明“只能来自型号 27 的 Excel 单元格”；它可能来自行值、模板默认/映射组合，或快照未记录的其他货物路径。
- `maxStackLayers:99` 的来源同样未闭环。仓库未发现一个能从当前快照证明来源的上游材料。
- 不能因为 `groundOnly` 恰好只有一行 true，就排除模板、历史或其他写入路径。

`99` 还是有限数值，`undefined` 表示无限上限。对于本次 40HQ 和这些尺寸，99 可能达不到，但这只是本输入的物理等价性假设；不能对任意柜高/箱高/数量宣称 99 与 undefined 一般等价。需要在接近实际最大层数的有限值矩阵上验证后，才能定义“实际不构成约束”的块引擎资格。

### 4. 当前可作出的修法边界

`decision.md:713-719` 已记录过：无条件扩大块引擎曾导致 `groundOnly`、不可堆叠、有限 `maxStackLayers`、托盘和小样本语义回归，因此现行策略保守保留这些场景在旧路径。

当前不能定稿以下任何一种算法：

- 先为 `groundOnly` 货物预留地面；
- 在块选择中优先 `groundOnly` 单层块；
- 先地面预布局，再让块引擎填余量。

这些方案都需要可执行实验，并同时验证数量、所有 `groundOnly` 箱体 `z=0`、越界/重叠/支撑/堆叠诊断，以及俄罗斯、越南 20GP/40HQ、stack-fill 和容量约束回归。当前正确动作是保留输入约束、补齐可复跑 fixture/runner，再决定路由；不是清洗 99/true，也不是裸放开门槛。

---

## 问题二：手动同型号朝向不齐

### 根因

`src/lib/quickPlace.ts:120-145` 的 `quickPlaceCargo` 将当前草稿映射为 `placedForScore`，但调用：

```ts
score: placementScore(input.cargo, box, point, placedForScore, input.container),
```

没有传入 `committedOrientation`。自动路径在 `src/lib/packing.ts:877` 建立按 `cargoId` 的承诺，并在 `placeEntry` `:998-1000` 记录第一个正立箱朝向，再由 `:1142`、`:1194`、`:1261` 传入评分。当前手动 quick-place 没有同等状态传递，因此同型号的 snap/same-label 评分会随邻居布局变化选择不同朝向。

这是**源码级已证实的缺口**。但原分析中的“连续 40 次得到 `LWH:6/WLH:34`”来自已删除 scratch 脚本，不是当前测试。快照中的标签 13 混合方向可佐证症状，不能证明全部 36 箱都是 quick-place 产生的。

### 修法边界

可行且最小的方向是：从当前 draft 中按 `cargoId` 找到已有箱子的第一个 `orientationKey`，作为 `placementScore` 的第六个参数；没有同型号箱子时不传承诺。该参数是强惩罚而非硬过滤：承诺朝向无法合法放置时，仍须允许合法的其他朝向，不能为了“对齐”而制造 no-space 或非法箱体。此方向应先由确定性 RED 单测证明，再另起实施提交；当前分析不把它冒充为已经修复。

---

## 问题三候选：旋转箭头方向

### 证据状态

- `issue.txt` 没有旋转箭头反馈。
- PNG 是自动 860 结果截图，没有选中箱体和 gizmo。
- 两个快照没有箭头几何、相机帧或 pointer 操作记录。
- 附加 MP4 当前工具无法读取，不能从中声称已观察到 CW/CCW。

### 当前源码的静态观察

`src/lib/rotationGizmo.ts:42-47` 中 right/left 和 up/down 的 `end` 都大于 `start`。`buildRotationGizmo:119-139` 按扫掠方向计算 `tangentSign` 并把锥体朝向该切线，因此每个相对手柄对在数学角度上有非镜像风险。`src/components/containerScene/interactions.ts:106-122` 只设置位置和 `rotation.set(0,0,0)`，没有后续镜像。

这证明了**静态几何缺陷候选**，不证明用户在屏幕上看到的“一左一右都顺时针”。屏幕 CW/CCW 取决于默认 ISO 相机、投影和用户 OrbitControls 视角；应先在浏览器中观察，再决定是否反转哪一个手柄。pitch 是否同样需要修复也不能从本轮两项反馈中擅自扩大。

底层 `rotateBoxRight90`/`rotateBoxLeft90` 在 `src/lib/manualPlacement.ts:293-319` 使用相反 yaw 方向，已有手动/方向测试覆盖其姿态元数据。不能把“命令语义相反”与“箭头视觉方向已证实”混为一谈。

状态：**候选显示缺陷；静态结构高置信；用户反馈、屏幕方向、影响轴和具体反转对象均未验证。**

---

## 待验证项

1. 获取原始 Excel、模板映射/defaults 或历史/自定义货物记录，分别闭环 `groundOnly` 和 `maxStackLayers` 的来源。
2. 将 877 箱输入与 old/current runner 固化为可复跑证据；在没有该 artifact 前，不把 873 和 counterfactual 数值当作当前门禁。
3. 对有限 `maxStackLayers` 做接近实际最大物理层数的阈值矩阵；保留小层数约束，不把所有显式值当作 unlimited。
4. 为混合 `groundOnly` 块选择候选分别测数量、地面约束、几何/支撑诊断和既有回归；未通过前保持现有保守路由。
5. 为 quick-place 增加 repeated same-cargo orientation 行为测试，并在真实手动流程中断言方向值，而不是只断言点击成功或箱数增加。
6. 若用户/MP4确认 gizmo 问题，在默认 ISO 和相关视角下观察箭头，再添加切线镜像不变量与浏览器证据；未确认前不改 gizmo。

## 当前决策

- 不清除、不归一化、不静默改写用户的 `groundOnly` 或 `maxStackLayers`；实施后的有限上限资格判定仍消费这些约束，见「2026-08-04 实施复核」。
- 7/22 的 873 和已删除 scratch/worktree 数值仍是历史记录，快照输入来源仍未闭环；本次实施复核不回写这些早期证据边界。
- quick-place 缺少朝向承诺的根因已由提交 `6f864a9` 修复并通过聚焦证明；当前语义与结果见「2026-08-04 实施复核」。
- 有限上限 gate 与混合 `groundOnly` 块路径已由提交 `d037df0` 修复并通过聚焦证明；旋转 gizmo 仍未验证且不在本次实施范围。

## 2026-08-04 实施复核

本节只记录实施前证据复核提交 `bd806f835e4c80b88bbc48ff4b99be8dd93e7027` 之后、已提交的两项产品修复及其 fresh 聚焦证据，不把结果倒写成上文分析时点已经存在的事实。上文的 873、已删除 scratch/worktree 实验及其数值继续只属于历史记录；两个快照没有闭环原始 Excel、mapping、模板 defaults、历史或自定义货物来源，输入 provenance 仍未解决；旋转 gizmo 仍是未验证候选且不在本次范围。

### 手动 quick-place：提交 `6f864a9`

- 实施语义：按草稿顺序取首个同 `cargoId` 箱体的正立 `LWH`/`WLH` 语义朝向作为承诺；候选评分值仍按既有 `placementScore` 计算，但排序比较时先比较是否匹配承诺朝向，再比较评分；既有循环按此顺序逐个校验合法性，全部承诺朝向候选均不合法时自然继续尝试其余按分数排序的候选；聚焦 `600×400×400` 合同证明第三次放置回退到了另一正立朝向。
- focused RED：`src/lib/quickPlace.test.ts` 9 项中 3 项失败，其中重复放置得到 `Set { 'WLH', 'LWH' }`，另两项分别暴露过早切换与低分承诺候选未被采用。
- focused GREEN：同一 Vitest 文件 **9/9** 通过；Chromium 聚焦 E2E **1/1** 通过。
- 浏览器场景 fresh 观察：同一货物连续操作后场景箱数 **1 → 2 → 3**，目标剩余数为 **0** 且按钮禁用；2D 中恰有三个无 issue 箱体，全部正立且只有一种朝向。

### 自动装箱约束：提交 `d037df0`

- 固化的最小精确 fixture 来自 `issues/0802/cargo-debug-snapshot(4)(3).json`：**28 SKUs / 877 boxes**，全部 `maxStackLayers:99`，其中一个 `groundOnly` SKU 数量 **28**。
- gate 采用保守的整批 fitting-height ceil：显式有限上限必须为正且对整批物理可达层数不构成约束；effective container 和 default stack limit 均参与判定。块路径在共享 EMS 上先执行仅落地货物阶段，再执行非落地阶段；未放下的 `groundOnly` 货物不进入后续 fallback。
- 修复前同一 fixture 的 gate 为 `false`，结果 **860/877**、`no-space` **17**。修复后走块路径并得到 **877/877**、unplaced **0**；`groundOnly` **28/28** 均为 `z=0`；全部 **877** 箱保留 `maxStackLayers:99`；error diagnostics、geometry violations、stack violations 均为 **0**；观察到 packing elapsed **4371 ms**。
- 0629 post-fix 对照：quantity **188/283**，volume **156/283**；两种模式下 label-C **84/84** 均为 `z=0`，error diagnostics、geometry violations、stack violations 均为 **0**。
- focused Chromium E2E **1/1**：真实 XLSX mapping/import、自定义柜型均实际经过浏览器流程，页面显示 `Loaded 877 / 877`，utilization **80.3%**。
- 既有 70/70 聚焦组中的五项 canonical contract assertion 均通过，期望 hash 保持不变：Russia `313549443068a5df3e87a5850d86a959ff56fe8ec4bd315f895c17c360c6b25f`；Vietnam 20GP quantity `59cfb38d7f6cde158d0e994edbb7d94cbcdcf73ecc9855b5ede53f0404051d43`；Vietnam 20GP volume `995b3b5a116547dc7af4944da8981ad552a2db7bbbd2c8281acaedaa95c525d6`；Vietnam 40HQ quantity `e1d660e1fe5333fcddece8fa9c3a2edd3e1b40782fb2bc6535b0f71c8851a10f`；Vietnam 40HQ volume `bd278dca258ea212822e75b75d43ed3a9ea39ec458fd76ca242afc53b8bd6a21`。

### 当前边界

上述证据只证明两个提交对应的 focused unit/contract/browser 场景；尚未执行或证明完整本地 gate、正式 benchmark、部署或远程 E2E，因此不作 release/deployment GREEN 声明。
