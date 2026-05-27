# 货柜装箱计算系统

这是一个基于 Vite + React + TypeScript 的货柜装箱工作台，用于录入或导入货物数据，计算装柜方案，并通过 2D、3D、分层、明细、诊断和导出能力支持装柜作业复核。

当前项目是按 `PRD.md` 进行的前端重构版本。系统保留浏览器端单页应用形态，暂不包含账号、多用户、权限、许可证或在线协作等管理能力。

## 功能概览

- 货柜参数：支持预设柜型、自定义柜型、最大载重、柜门预留、顶部余量和左右预留。
- 货物录入：支持名称、标签、尺寸、重量、数量、颜色、旋转和堆叠限制。
- 标签贯穿：标签用于录入、导入、计算、2D、3D、分层、明细、导出和历史方案。
- 装箱计算：根据有效货柜空间、载重、旋转、堆叠和支撑关系生成 `PackingResult`。
- 分层查看：按真实支撑关系生成物理层级，而不是单纯按 `z` 高度过滤。
- 可视化：提供 3D 轴测/俯视/正视/侧视视角，以及 2D 俯视/正视/侧视投影。
- 导入导出：支持 XLSX/XLS/CSV 导入，导出包含装箱结果的 Excel 明细，支持导出当前 2D/3D 视图。
- 诊断与历史：提供边界、载重、重叠、支撑、堆叠和未装入诊断；历史方案保存在浏览器 `localStorage`。
- 中英文界面：工作台内置中文和英文文案切换。

## 技术栈

- React 18
- TypeScript 6
- Vite 8
- Tailwind CSS 4
- Three.js
- XLSX
- Vitest
- Playwright

## 快速开始

环境要求：

- Node.js：建议使用当前 LTS 版本或与 `package-lock.json` 兼容的版本。
- npm：随 Node.js 安装。

安装依赖：

```bash
npm ci
```

启动开发服务器：

```bash
npm run dev
```

Vite 会在终端输出本地访问地址，通常是 `http://localhost:5173/`。

## 常用脚本

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | 执行 TypeScript 项目构建并输出生产包 |
| `npm run preview` | 本地预览 `dist/` 生产构建结果 |
| `npm run lint` | 运行 ESLint |
| `npm test` | 运行 Vitest 单元测试 |
| `npm run test:e2e` | 运行 Playwright 浏览器自动化测试 |

## 构建

生产构建：

```bash
npm run build
```

构建产物输出到 `dist/`。构建命令包含两步：

1. `tsc -b`：检查 TypeScript 项目引用和类型。
2. `vite build`：打包前端静态资源。

本地预览生产包：

```bash
npm run preview
```

当前构建可能出现 Vite 的 chunk-size 提醒，原因是 Three.js 和 XLSX 会进入前端 bundle。只要命令退出码为 0，构建即成功；后续如需优化首屏体积，可以考虑动态导入 XLSX、拆分 Three.js 视图或增加 vendor chunk 策略。

## 部署

本项目目前是纯前端静态站点，不依赖后端服务。部署步骤：

```bash
npm ci
npm run build
```

然后将 `dist/` 目录部署到任意静态资源服务，例如：

- Nginx
- GitHub Pages
- Netlify
- Vercel 静态输出
- 对象存储 + CDN

Nginx 示例：

```nginx
server {
  listen 80;
  server_name example.com;

  root /var/www/container-calc/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

部署注意事项：

- 当前应用没有后端 API，历史方案保存在用户浏览器的 `localStorage` 中。
- 如果未来增加前端路由，静态服务器需要把未知路径回退到 `index.html`。
- 如果部署到非站点根路径，需要同步配置 Vite `base`，否则静态资源路径可能不正确。
- 导入导出在浏览器端完成，用户文件不会上传到服务器。

### 当前远端服务器

当前生产静态站点部署在 `cargo-server`：

| 项目 | 值 |
| --- | --- |
| SSH 主机别名 | `cargo-server` |
| 服务器 | `VM-0-12-opencloudos` |
| 部署用户 | `root` |
| 访问地址 | `http://101.33.232.150/` |
| Web 服务 | Nginx |
| 站点根目录 | `/usr/share/nginx/html` |
| 备份目录格式 | `/root/cargo_project-backup-YYYYMMDD-HHMMSS` |

当前远端 Nginx 直接从 `/usr/share/nginx/html` 提供静态文件。部署时先在本地构建，再上传 `dist/` 内容并覆盖站点根目录。

#### 一键部署

推荐使用脚本 `scripts/deploy.mjs`，对应的 npm 命令是 `npm run deploy`。脚本会按顺序执行：本地构建 → 远端备份当前站点 → 上传 `dist/*` 到远端 `/tmp/cargo-dist/` 暂存目录 → `rsync -a --delete` 同步到 `/usr/share/nginx/html/` → 重置 owner 和权限 → 远端本地健康检查 `curl -fsS http://127.0.0.1/`。

```bash
# 真正执行部署
npm run deploy

# 只打印命令、不连接远端（用于自检）
npm run deploy -- --dry-run

# 查看完整帮助
npm run deploy -- --help
```

脚本不会硬编码任何密码或私钥，SSH 鉴权完全复用本机的 SSH agent 或 `~/.ssh/config` 中 `cargo-server` 主机别名对应的私钥。

常用环境变量（全部带默认值，平时无需设置）：

| 变量 | 作用 | 默认值 |
| --- | --- | --- |
| `DEPLOY_SSH_HOST` | SSH 主机别名 | `cargo-server` |
| `DEPLOY_REMOTE_USER` | 显式的 `user@host`，覆盖主机别名 | 未设置 |
| `DEPLOY_SITE_ROOT` | 远端站点目录 | `/usr/share/nginx/html` |
| `DEPLOY_BACKUP_BASE` | 远端备份目录前缀 | `/root/cargo_project-backup` |
| `DEPLOY_STAGING_DIR` | 远端暂存目录 | `/tmp/cargo-dist` |
| `DEPLOY_HEALTHCHECK` | 健康检查 URL | `http://127.0.0.1/` |
| `DEPLOY_OWNER` | 站点目录 chown 目标 | `root:root` |
| `DEPLOY_SKIP_BUILD` | 设为 `1` 跳过本地构建 | 未设置 |

部署成功后，脚本会在终端打印本次备份的远端路径，例如：

```
Backup saved at: /root/cargo_project-backup-20260520-192916
Deployment complete. Backup: /root/cargo_project-backup-20260520-192916
```

请把这一行记入运维日志，下面的「回滚」步骤会用到。

#### 手动部署（保留参考）

不依赖 `scripts/deploy.mjs` 时，也可以直接拼接 SSH/SCP 命令完成部署：

```bash
npm run build

ssh cargo-server 'set -e; ts=$(date +%Y%m%d-%H%M%S); backup=/root/cargo_project-backup-$ts; mkdir -p "$backup"; cp -a /usr/share/nginx/html/. "$backup"/; echo "$backup"'
ssh cargo-server 'rm -rf /tmp/cargo-dist && mkdir -p /tmp/cargo-dist'
scp -r dist/* cargo-server:/tmp/cargo-dist/
ssh cargo-server 'rsync -a --delete /tmp/cargo-dist/ /usr/share/nginx/html/ && chown -R root:root /usr/share/nginx/html && chmod -R a+rX /usr/share/nginx/html'
ssh cargo-server 'curl -fsS http://127.0.0.1/ >/dev/null && echo deployed'
```

部署后从本机验证公网访问：

```bash
curl -I http://101.33.232.150/
```

最近一次部署备份目录：`/root/cargo_project-backup-20260520-192916`。

#### 回滚到上一次备份

如果新版本上线后发现回归，可以快速回滚到任意一次备份。先在远端列出可用备份：

```bash
ssh cargo-server 'ls -1dt /root/cargo_project-backup-* | head -n 5'
```

确认目标备份目录后，按以下步骤恢复站点：

```bash
# 1) 把当前线上目录另存为应急备份，便于事后排查
ssh cargo-server 'set -e; ts=$(date +%Y%m%d-%H%M%S); incident=/root/cargo_project-incident-$ts; mkdir -p "$incident"; cp -a /usr/share/nginx/html/. "$incident"/; echo "$incident"'

# 2) 用 rsync 把备份目录覆盖回站点根目录，并修正权限
ssh cargo-server 'rsync -a --delete /root/cargo_project-backup-20260520-192916/ /usr/share/nginx/html/ && chown -R root:root /usr/share/nginx/html && chmod -R a+rX /usr/share/nginx/html'

# 3) 远端健康检查
ssh cargo-server 'curl -fsS http://127.0.0.1/ >/dev/null && echo rolled-back'

# 4) 本机验证公网访问
curl -I http://101.33.232.150/
```

请将示例中的 `20260520-192916` 替换为你实际要恢复的备份时间戳。

#### 备份恢复步骤

“回滚”是把整套站点切换回旧版本；如果只是误删了少量文件，或者需要从备份目录中取出单个资源，可以参考下面的步骤：

```bash
# 查看备份目录内容
ssh cargo-server 'ls -la /root/cargo_project-backup-20260520-192916/'

# 把备份打成 tarball 拉到本机审查
ssh cargo-server 'tar -C /root/cargo_project-backup-20260520-192916 -czf /tmp/cargo-backup.tgz .'
scp cargo-server:/tmp/cargo-backup.tgz ./cargo-backup-20260520-192916.tgz

# 把单个文件恢复回线上目录
ssh cargo-server 'install -m 0644 /root/cargo_project-backup-20260520-192916/index.html /usr/share/nginx/html/index.html && chown root:root /usr/share/nginx/html/index.html'
```

清理过旧的备份（保留最近 5 份）：

```bash
ssh cargo-server "ls -1dt /root/cargo_project-backup-* | tail -n +6 | xargs -r rm -rf"
```

注意事项：

- 当前站点目录只存放静态资源，不包含数据库或用户上传内容，因此 `rsync --delete` 和回滚操作都不会破坏生产数据。
- 如果将来引入服务器端数据，请先在 `scripts/deploy.mjs` 中拓展备份范围，再启用 `--delete` 风格的同步。

## 架构设计

项目采用“UI 组合层 + 可测试业务逻辑 + 可视化组件”的结构，避免把核心装箱逻辑写死在 React 组件中。

```text
src/
  Workbench.tsx                 # 主工作台：状态、交互、导入导出、历史方案和中英文文案
  types.ts                      # 核心类型契约，包括 PackingResult
  data/
    containers.ts               # 柜型预设、有效尺寸和体积计算
  lib/
    packing.ts                  # 装箱算法、支撑关系、诊断和 PackingResult 生成
    layers.ts                   # 基于支撑关系聚合物理层
    labels.ts                   # 标签颜色归一化
    importCargo.ts              # Excel/CSV 行解析、字段映射和单位换算
    exportPlan.ts               # 结果明细导出数据
    historyPlans.ts             # localStorage 历史方案
  components/
    ContainerScene.tsx          # Three.js 3D 货柜视图
    ContainerPlan2D.tsx         # SVG 2D 投影视图
e2e/
  container-calc.spec.ts        # 浏览器工作流测试
test-data/
  excel/                        # 真实业务 Excel 夹具
archive/                        # 旧版样式和功能参考，不作为运行时依赖
```

### 核心数据流

1. 用户在 `Workbench` 中录入货物，或通过 XLSX/XLS/CSV 导入货物。
2. `parseCargoRows` 将表格行转换为 `CargoItem[]`，并返回映射摘要、警告和错误。
3. `normalizeCargoLabelColors` 保证同一业务标签使用一致颜色。
4. `calculatePacking` 根据柜型、货物和装载模式生成 `PackingResult`。
5. `PackingResult` 作为统一数据源驱动 2D、3D、分层、明细、诊断、导出和历史方案。

核心契约是 `PackingResult`，包含：

- `placed`：已装入箱体的位置、尺寸、标签、物理层、作业步骤和支撑来源。
- `unplaced`：未装入货物及失败原因。
- `layers`：基于支撑关系聚合的物理层统计。
- `workSteps`：装柜作业顺序。
- `labelStats`：按标签汇总的计划、已装、未装和层级信息。
- `diagnostics`：边界、载重、重叠、支撑、堆叠和优化诊断。
- 利用率数据：体积、载重、总数和已装数量。

### 装箱与分层原则

- 算法使用有效货柜尺寸，预留间隙会先从柜型尺寸中扣除。
- 货物可按体积优先或录入顺序装载。
- 可旋转货物会尝试合法朝向；不可旋转货物只使用原始朝向。
- 堆叠货物必须满足支撑面积阈值，且不能压在不可堆叠货物上。
- 物理层级来自支撑链：底层为第 1 层，被第 1 层支撑的箱体进入第 2 层，以此类推。
- 2D、3D、明细和导出不各自重新计算层级，统一消费 `PackingResult`。

## 导入导出

导入支持 `.xlsx`、`.xls` 和 `.csv`。解析逻辑在 `src/lib/importCargo.ts` 中，采用确定性字段映射：

- 识别名称、标签、长、宽、高、重量、数量、颜色、旋转和堆叠字段。
- 支持中文业务表头。
- 对厘米尺寸做毫米换算，并在导入摘要中提示换算行数。
- 行级错误和警告会显示在工作台，不会静默吞掉。

导出逻辑在 `src/lib/exportPlan.ts` 中，导出的 Excel 明细包含标签、原始尺寸、实际朝向、重量、计划数量、已装数量、未装数量、层级、作业步骤和失败原因。

## 测试与质量门禁

核心算法和功能需要有单元测试覆盖。提交功能变更前至少运行：

```bash
npm run lint
npm test
npm run build
```

涉及 UI、3D、2D、分层、导入导出或用户流程时，还需要运行：

```bash
npm run test:e2e
```

测试分布：

- `src/lib/*.test.ts`：装箱、分层、标签、导入、导出和历史方案等可测试业务逻辑。
- `e2e/container-calc.spec.ts`：浏览器端用户流程，包括导入、装箱、视图、明细、历史和导出。
- `test-data/excel/俄罗斯整托装柜尺寸.xlsx`：真实业务工作簿夹具。

## 开发约束

- `archive/` 只作为旧版产品和视觉参考，不能把旧版静态产物作为新架构依赖。
- 标签是核心业务能力，新增功能应优先确认标签是否贯穿录入、计算、展示和导出。
- 装箱、标签统计、分层和导入解析优先放在 `src/lib/`，便于单元测试。
- 需要做业务取舍、降级、暂缓或架构调整时，记录到 `decision.md`。
- 每次提交前检查 `git status --short`，只提交本次任务相关文件。
