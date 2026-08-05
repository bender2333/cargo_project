# 货柜装箱计算系统

这是一个由 Vite + React + TypeScript 前端工作台和 Express + SQLite 服务端组成的货柜装箱系统，用于录入或导入货物数据，计算装柜方案，并通过 2D、3D、分层、明细、诊断和导出能力支持装柜作业复核。

系统保留浏览器端单页应用形态，并提供账号注册/登录、JWT 认证以及普通用户/管理员基础身份。当前范围不包含在线协作、复杂权限模型或许可证管理。

## 功能概览

- 货柜参数：支持预设柜型、自定义柜型、最大载重、柜门预留、顶部余量和左右预留。
- 货物录入：支持名称、标签、尺寸、重量、数量、颜色、旋转和堆叠限制。
- 标签贯穿：标签用于录入、导入、计算、2D、3D、分层、明细、导出和历史方案。
- 装箱计算：根据有效货柜空间、载重、旋转、堆叠和支撑关系生成 `PackingResult`。
- 分层查看：按真实支撑关系生成物理层级，而不是单纯按 `z` 高度过滤。
- 可视化：提供 3D 轴测/俯视/正视/侧视视角，以及 2D 俯视/正视/侧视投影。
- 导入导出：支持 XLSX/XLS/CSV 导入，导出包含装箱结果的 Excel 明细，支持导出当前 2D/3D 视图。
- 诊断与历史：提供边界、载重、重叠、支撑、堆叠和未装入诊断；认证用户的历史方案由服务端持久化到 SQLite。
- 服务端持久化：历史方案、自定义柜型、自定义货物、导入模板和导出模板均通过受 JWT 保护的 API 按用户保存。
- 中英文界面：工作台内置中文和英文文案切换。

## 技术栈

- React 18
- TypeScript 6
- Vite 8
- Tailwind CSS 4
- Three.js
- Express 5
- SQLite（better-sqlite3）
- JWT（jsonwebtoken）
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

分别启动 Express API 和 Vite 前端。`vite.config.ts` 默认把 `/api` 代理到 `127.0.0.1:3010`：

```bash
# 终端 1（POSIX shell）
PORT=3010 npm run start:server

# 终端 2
npm run dev
```

PowerShell 中启动 API 时使用 `$env:PORT='3010'; npm run start:server`。未设置 `CARGO_DB_PATH` 时，本地服务使用 `server/database.db`；Playwright 的本地配置则自动启动端口 `3010` 的 API，并使用内存数据库。

## 常用脚本

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | 执行 TypeScript 项目构建并输出生产包 |
| `npm run preview` | 本地预览 `dist/` 生产构建结果 |
| `npm run lint` | 运行 ESLint |
| `npm test` | 运行 Vitest 单元测试 |
| `npm run test:e2e` | 运行 Playwright 浏览器自动化测试 |
| `npm run start:server` | 启动 Express API 服务 |
| `npm run deploy` | 构建并同步前端、后端模块后重启生产服务 |
| `npm run rollback -- --backup <path>` | 使用指定部署备份执行受保护回滚 |

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

生产运行时不是单独的静态站点，而是以下四部分：

- Nginx 从 `/usr/share/nginx/html` 提供 `dist/` 前端资源，并把 `/api/` 反向代理到 Express 的 `PORT`。当前 `server/index.mjs` 调用 `app.listen(PORT)` 时未指定 host，可能监听所有接口；在代码另行收紧绑定前，主机防火墙和云安全组必须拒绝外部访问该 API 端口，只允许经 Nginx 入口访问。
- `/opt/cargo-server/server/*.mjs` 是后端模块，`/opt/cargo-server/package*.json` 描述后端运行依赖。
- `cargo-server.service` 启动 `/opt/cargo-server/server/index.mjs`，并读取 `/etc/cargo-server.env`。
- SQLite 默认位于后端模块旁的 `/opt/cargo-server/server/database.db`；生产应通过 `CARGO_DB_PATH` 显式固定该路径。

### 首次配置生产主机

`scripts/deploy.mjs` 只更新已经完成基础配置的主机；它不会安装 Node.js、Nginx、systemd unit、SQLite CLI 或 npm 依赖。首次部署前需要：

1. 安装 Node.js/npm、Nginx、`rsync` 和 `sqlite3`，创建 `/opt/cargo-server/server` 与 `/usr/share/nginx/html`。
2. 创建专用 `cargo-server` 用户和同名组；该账号必须是不可登录的 system account，不得复用 root 或部署 SSH 账号。部署 SSH 身份及其同步/重启权限与应用运行身份分开管理。
3. 在 `/opt/cargo-server` 按 `package-lock.json` 执行 `npm ci --omit=dev`。部署脚本会同步 `package*.json`，但不会执行依赖安装；锁文件变化时也必须先更新远端依赖。
4. 配置 `cargo-server.service`，至少设置 `User=cargo-server`、`Group=cargo-server`、`WorkingDirectory=/opt/cargo-server`、`EnvironmentFile=/etc/cargo-server.env` 和 `ExecStart=/usr/bin/node /opt/cargo-server/server/index.mjs`。
5. 权限必须使 `.mjs`、`package*.json` 和静态资源保持 root 所有且应用账号不可写；当前 DB 又与 `.mjs` 同处 `server/`，因此普通 group-writable 目录**不安全**（目录写权限可删除/替换 root 所有文件）。在不修改 rollback 脚本所要求 DB 路径的前提下，使用仅含服务账号的专用组、sticky group-writable 目录、root-owned 模块和 service-owned SQLite 文件，并在 unit 中设置 `UMask=0077`：

   ```bash
   sudo systemctl stop cargo-server.service
   sudo chown root:cargo-server /opt/cargo-server/server
   sudo chmod 1770 /opt/cargo-server/server
   sudo find /opt/cargo-server/server -maxdepth 1 -type f -name '*.mjs' -exec chown root:root {} + -exec chmod 0644 {} +
   sudo find /opt/cargo-server/server -maxdepth 1 -type f -name 'database.db*' -exec chown cargo-server:cargo-server {} + -exec chmod 0600 {} +
   ```

   应在 `cargo-server.service` 停止状态下应用或重验这些权限，避免 SQLite sidecar 同时变化；完成环境文件和 Nginx 配置后再启动服务。sticky bit 防止 `cargo-server` 删除/重命名不属于它的现有 `.mjs`，文件 mode 防止内容改写，同时允许 SQLite 创建/删除自身 WAL/SHM/journal。`cargo-server` 组不得加入部署 SSH 用户或其他账号；部署后必须重新确认 `.mjs` 为 `root:root 0644`、DB family 为 `cargo-server:cargo-server 0600`。此布局仍允许受侵服务在共享目录创建新文件，需用 systemd 文件系统限制/磁盘配额作纵深防御；当前 rollback 固定检查 `server/database.db*`，因此不能只改 `CARGO_DB_PATH` 或在本任务中推荐未受 rollback 保护的状态目录。
6. 在启用 TLS 的 Nginx server block 中提供 SPA fallback，并将 `/api/` 代理到 `/etc/cargo-server.env` 中 `PORT` 对应的端口。公开登录入口必须使用 HTTPS。

`/etc/cargo-server.env` 必须设为 `root:cargo-server`、mode `0640`，不得提交到仓库。使用 root-only 编辑流程创建或更新它，而不是把秘密写进命令参数或 shell 历史：

```bash
sudo touch /etc/cargo-server.env
sudo chown root:cargo-server /etc/cargo-server.env
sudo chmod 0640 /etc/cargo-server.env
sudoedit /etc/cargo-server.env
```

文件必须设置 `NODE_ENV=production`、与 Nginx upstream 一致的 `PORT`（当前部署为 `3100`）、`CARGO_DB_PATH=/opt/cargo-server/server/database.db`、`ADMIN_PASSWORD` 和 `JWT_SECRET`。通过密码管理器/secret manager 生成管理员口令；JWT secret 可用 `openssl rand -hex 32` 生成后在 root-only 编辑器中粘贴，不要把生成值拼进命令。生产缺少 `ADMIN_PASSWORD` 会直接启动失败；`JWT_SECRET` 必须至少 32 个字符且不能使用开发默认值。

修改后先以 `stat` 确认 owner/group/mode，确认变量名存在且值非空，再重启 `cargo-server.service`；验证命令不得打印 secret 值。基础反向代理形态如下，端口必须与环境文件一致：

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:3100;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}

location / {
  try_files $uri $uri/ /index.html;
}
```

TLS 证书与续期、HTTP → HTTPS 重定向、HSTS 和适合当前前端资源的 CSP 都由公开 Nginx/边缘层负责；这里不提供未经部署验证的 CSP 模板。API 端口仍必须由主机防火墙和云安全组阻断公网访问。

### 使用部署脚本

当前 `scripts/deploy.mjs` 默认配置与生产目录如下：

| 项目 | 默认值 |
| --- | --- |
| SSH 目标 | `cargo-server` |
| 前端站点根目录 | `/usr/share/nginx/html` |
| 后端应用根目录 | `/opt/cargo-server` |
| systemd 服务 | `cargo-server.service` |
| 静态暂存目录 | `/tmp/cargo-dist` |
| 部署备份前缀 | `/root/cargo_project-backup` |
| 远端健康检查 | `http://127.0.0.1/` |

脚本会依次执行本地构建、备份当前静态文件和后端 `.mjs` 模块、上传并同步 `dist/`、同步 `server/*.mjs` 与 `package*.json`、重启服务、修正静态目录权限，最后在服务器本机以 `curl -fsS` 确认首页请求成功（不返回 4xx/5xx），并确认未认证 API 的状态码严格为 401。

```bash
# 先检查将执行的命令，不连接或修改远端
npm run deploy -- --dry-run

# 确认环境文件、数据库备份和依赖均已就绪后再部署
npm run deploy
```

常用覆盖变量均来自 `scripts/deploy.mjs`：

| 变量 | 作用 | 默认值 |
| --- | --- | --- |
| `DEPLOY_SSH_HOST` | SSH 主机别名 | `cargo-server` |
| `DEPLOY_REMOTE_USER` | 显式 `user@host`，覆盖主机别名 | 未设置 |
| `DEPLOY_SITE_ROOT` | 前端站点目录 | `/usr/share/nginx/html` |
| `DEPLOY_APP_ROOT` | 后端应用目录 | `/opt/cargo-server` |
| `DEPLOY_SERVICE` | systemd 服务名 | `cargo-server.service` |
| `DEPLOY_BACKUP_BASE` | 部署备份目录前缀 | `/root/cargo_project-backup` |
| `DEPLOY_STAGING_DIR` | 前端暂存目录 | `/tmp/cargo-dist` |
| `DEPLOY_HEALTHCHECK` | 远端本机健康检查 URL | `http://127.0.0.1/` |
| `DEPLOY_OWNER` | 前端目录 owner | `root:root` |
| `DEPLOY_SKIP_BUILD` | 设为 `1` 跳过本地构建 | 未设置 |

SSH 鉴权复用本机 agent 或 `~/.ssh/config`，脚本不保存密码或私钥。部署成功时会打印本次 `/root/cargo_project-backup-YYYYMMDD-HHMMSS` 路径；必须记录该路径供回滚使用。

### SQLite 备份与受保护回滚

部署备份只包含静态文件和后端 `.mjs`，**不包含 SQLite**。每次部署前必须单独创建并校验数据库备份，例如：

```bash
ssh cargo-server 'set -eu; umask 077; ts=$(date -u +%Y%m%d-%H%M%S); backup=/root/cargo-database-$ts.db; sqlite3 /opt/cargo-server/server/database.db ".backup $backup"; test "$(stat -c %a "$backup")" = 600; test "$(sqlite3 "$backup" "PRAGMA quick_check;")" = ok; echo "$backup"'
```

应用版本回滚只能使用受保护脚本，不要手工对 `/opt/cargo-server/server` 执行带 `--delete` 的同步：

```bash
# 先预演；把路径替换为部署成功时打印的备份目录
npm run rollback -- --backup /root/cargo_project-backup-YYYYMMDD-HHMMSS --dry-run

# 执行同一目标的回滚
npm run rollback -- --backup /root/cargo_project-backup-YYYYMMDD-HHMMSS
```

`scripts/rollback.mjs` 会先创建 incident 快照，只恢复静态文件和 `.mjs` 模块，显式排除 `database.db` 及其 journal/WAL/SHM 文件，并验证数据库哈希、`PRAGMA quick_check`、服务状态、静态 200 和未认证 API 401。它不会把部署备份当作数据库备份；真正的数据库恢复必须使用已验证的独立 SQLite 备份并按事故流程处理。

### 部署后远程 E2E

设置 `PLAYWRIGHT_BASE_URL` 后，`playwright.config.ts` 不会启动本地 Vite/API；四个远程凭据变量 `E2E_USERNAME`、`E2E_PASSWORD`、`E2E_ADMIN_USERNAME`、`E2E_ADMIN_PASSWORD` 都必须已设置。允许的远端入口只有 HTTPS，或经 SSH 转发后的回环 HTTP。

当前配置没有启用 Playwright retries（默认 `0`）；带生产 secret 的远程运行必须保持零重试。`trace: 'on-first-retry'` 只有在启用 retry 后才会产出 trace，因此不要为远程运行打开 retry/trace；任何可能含凭据的 trace、截图或日志都不得上传或分享，必须先删除或完成脱敏审查。

HTTPS 入口：

```bash
export PLAYWRIGHT_BASE_URL=https://cargo.example.com/
export E2E_USERNAME E2E_PASSWORD E2E_ADMIN_USERNAME E2E_ADMIN_PASSWORD
npm run test:e2e
```

生产尚未配置 TLS 时，开两个终端，通过 SSH 把本机回环端口转发到服务器的 Nginx；凭据不会经过公网明文 HTTP：

```bash
# 终端 1：保持隧道运行
ssh -o ExitOnForwardFailure=yes -N -L 127.0.0.1:8080:127.0.0.1:80 cargo-server

# 终端 2
export PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080/
export E2E_USERNAME E2E_PASSWORD E2E_ADMIN_USERNAME E2E_ADMIN_PASSWORD
npm run test:e2e
```

绝不能把带真实账号密码的 E2E 指向 `http://<公网地址>`。`e2e/credentials.ts` 也会拒绝非回环的 HTTP `PLAYWRIGHT_BASE_URL`。

## 架构设计

项目采用“React 工作台 + 受认证 API + SQLite 持久化”的运行时结构，同时将装箱核心逻辑与 React 组件分离以便测试。

```text
src/
  App.tsx                       # 登录/注册壳、JWT 会话和工作台入口
  Workbench.tsx                 # 主工作台：状态、交互、导入导出和中英文文案
  types.ts                      # 核心类型契约，包括 PackingResult
  api/
    client.ts                   # 携带 JWT 的统一 API 请求边界
    historyPlans.ts             # 服务端历史方案读写
    customContainers.ts         # 自定义柜型 API
    customCargo.ts              # 自定义货物 API
    importTemplates.ts          # 导入模板 API
    exportTemplates.ts          # 导出模板 API
  hooks/                        # 历史、模板、货物库和装箱会话编排
  data/
    containers.ts               # 柜型预设、有效尺寸和体积计算
  lib/
    packing.ts                  # 装箱算法、支撑关系、诊断和 PackingResult 生成
    layers.ts                   # 基于支撑关系聚合物理层
    labels.ts                   # 标签颜色归一化
    importCargo.ts              # Excel/CSV 行解析、字段映射和单位换算
    exportPlan.ts               # 结果明细导出数据
  components/
    ContainerScene.tsx          # Three.js 3D 货柜视图
    ContainerPlan2D.tsx         # SVG 2D 投影视图
server/
  index.mjs                     # Express 入口、受保护资源路由和静态 fallback
  auth.mjs                      # 注册、登录和修改密码
  middleware.mjs                # JWT 签发、校验和管理员守卫
  db.mjs                        # SQLite 连接、迁移和账号初始化
  historyRoutes.mjs             # 用户级历史快照路由
scripts/
  deploy.mjs                    # 前端/后端生产部署
  rollback.mjs                  # 保留 SQLite 的受保护回滚
e2e/                            # Playwright 浏览器工作流测试
test-data/excel/                # 真实业务 Excel 夹具
archive/                        # 旧版样式和功能参考，不作为运行时依赖
```

### 核心数据流

1. `App` 通过 `/api/auth` 注册或登录，后续 API 请求携带 JWT。
2. `Workbench` 通过 `src/api/` 与 `src/hooks/` 加载当前用户的历史、自定义柜型/货物和模板。
3. 用户在 `Workbench` 中录入货物，或通过 XLSX/XLS/CSV 导入货物。
4. `parseCargoRows` 将表格行转换为 `CargoItem[]`，并返回映射摘要、警告和错误。
5. `normalizeCargoLabelColors` 保证同一业务标签使用一致颜色。
6. `calculatePacking` 根据柜型、货物和装载模式生成 `PackingResult`。
7. `PackingResult` 驱动 2D、3D、分层、明细、诊断和导出；保存历史时，完整快照经受认证 API 写入 SQLite。

JWT token、语言、放置设置和最近使用的导入配置等客户端会话/界面偏好可以保存在浏览器 `localStorage`；历史方案、自定义柜型、自定义货物及导入/导出模板不以它作为持久化来源。

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
