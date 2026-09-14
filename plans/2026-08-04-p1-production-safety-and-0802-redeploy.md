# 2026-08-04 阶段一：生产安全与 0802 重新发布

## 本轮定位

这是三阶段整改的第一阶段，只做**已在生产暴露或已造成事故**的事。不碰架构、不碰算法根因、不做重构。

三阶段顺序（用户 2026-08-04 拍板）：

1. **本文件**：生产安全（回滚删库、公开凭据、README 与实际架构冲突）+ 0802 修复重新上线
2. `plans/2026-08-05-p2-test-and-gate-integrity.md`：测试与门禁体系
3. `plans/2026-08-06-p3-packing-root-cause-and-boundaries.md`：算法根因与架构边界

**为什么这个顺序**：阶段三的算法修改需要可信的回归网才能验收，而当前测试体系已被证明存在「删断言取绿且未披露」的形态（见阶段二 P2-1）。先修生产事故，再织网，最后动刀。

三个文件名里的日期是撰写日，不是执行期限。Codex 有充足时间，按任务顺序推进即可，不必为日期赶工或跳步。

## 前置事实（`d442e7b` 已记录，本文件不重复论证）

- 0802 的两个修复（`6f864a9`、`d037df0`）**当前不在生产**。两次部署均已回滚，生产运行任务前的 release。用户报的「40 尺只装 860」和「手动同型号方向混摆」在生产上仍然存在。
- 本地 release gate 为 GREEN：`lint` 通过、`npm test` 792 tests + 7 packing performance、`build` 通过、`test:e2e` 125/125 零跳过、`benchmark` 重跑通过且五项 contract hash 一致。
- 远程 E2E 两次未过：124/125 与 123/125。失败项为 `e2e/manual-3d.spec.ts:515` 的按钮在 React 重渲染时持续 detach，以及 `e2e/container-calc.spec.ts:219` 登录后停留「工作台加载中…」超 5 秒。回滚后各自 focused 重跑 1/1。
- 第一次回滚执行了 `rsync -a --delete "$backup/server"/ /opt/cargo-server/server/`，而 deploy backup 的 `server/` 只含 `.mjs`、不含 SQLite。live DB（475,136 B，SHA-256 `76c21bbf…`）被删除，服务重建 65,536 B 空库（`6bb13149…`），从 incident `/root/cargo_project-incident-20260804-163753` 恢复成功，最终 `PRAGMA quick_check` = `ok`。

---

## 任务 P1-1：把 rollback 变成受保护的脚本

### 根因

`scripts/deploy.mjs` 中**不存在任何 rollback 实现**。全文 grep `rollback` / `incident` / `--exclude` / `database.db` 零命中（仅 `:181-182` 有无关的 `serverDir` 读取）。那条删库命令是人工拼写并直接在生产执行的，`decision.md` 事后记录了「后续必须 `--exclude=database.db`」，但这条修正只存在于散文里，没有任何机制阻止下一次再拼错。

补充一个必须区分清楚的点：`scripts/deploy.mjs:262` 的 `rsync -a --delete stagingDir/ siteRoot/` 同步的是 `/usr/share/nginx/html`（纯静态），**它不是事故来源**，不要去改它。事故在 backend rollback 路径。

### 意图与边界

- 新增 `scripts/rollback.mjs`，把 backend + static 回滚固化为脚本，人工不再拼 rsync。
- backend 回滚必须 `--exclude=database.db`（连带 `-shm`、`-wal`）。
- 回滚前必须先创建 incident 快照（保留现行做法），回滚后必须比对 incident 与 live 的 DB SHA-256 并在不一致时**非零退出**。
- 支持 `--dry-run`，打印将要执行的完整远端命令而不执行。
- 不改 `deploy.mjs` 的静态同步逻辑；不改 backup 目录结构；不删除任何既有 backup/incident。

### 模块划分

- 新建 `scripts/rollback.mjs`（复用 `deployCommands.mjs` 的 ssh 调用与 `shellQuote`）
- 新建 `scripts/rollback.test.mjs`
- `package.json` 增 `rollback` 与 `rollback:dry` 脚本

### 验证标准

单测（`scripts/rollback.test.mjs`，全部离线、不连生产）：

| 用例 | 输入 | 期望 |
|---|---|---|
| backend rsync 必须排除 DB | 生成的 backend 回滚命令字符串 | 同时包含 `--exclude=database.db`、`--exclude=database.db-shm`、`--exclude=database.db-wal` |
| 拒绝无 exclude 的 backend 命令 | 构造一条不含 exclude 的命令传给校验函数 | 抛错，错误信息含 `database.db` |
| incident 先于回滚 | 命令序列 | incident 创建的语句下标必须小于任何 `rsync` 语句下标 |
| DB hash 不一致必须失败 | mock incident hash ≠ live hash | 非零退出，stderr 含两个 hash |
| DB hash 一致才通过 | mock 两者相同 | 零退出 |
| dry-run 不执行 | `--dry-run` | 只打印，ssh 执行函数调用次数为 0 |
| 静态回滚不带 exclude | static 回滚命令 | 不含 DB exclude（静态目录本就无 DB，避免误加掩盖问题） |

人工确认：`npm run rollback:dry` 的输出与 `decision.md`「2026-08-04 生产发布两次回滚与 SQLite 保护修正」记录的安全命令语义一致。

### 风险与回归门槛

不得在本任务中实际执行生产回滚。脚本写完只跑 `--dry-run` 与单测。

---

## 任务 P1-2：消除生产公开凭据

### 根因

`server/db.mjs`：
- `:262` `DEFAULT_TEST_PASSWORD = 'testuser123'`，`initTestUser()` 唯一开关是 `SKIP_TESTUSER === '1'`，无 `NODE_ENV` 判断，文件末尾无条件调用。
- `:261` `DEFAULT_ADMIN_PASSWORD = 'admin123'`；缺 `ADMIN_PASSWORD` 时新库走「created with default password」warning、老库走「may still be the default」warning，两条分支都只 `console.warn` 不阻断。

对照 `server/middleware.mjs:8-12`：`JWT_SECRET` 在生产缺失/过短/等于 dev 默认值时直接 `throw`。同一个服务对两个同等敏感项用了两套强度。

生产已存在 testuser 的证据（无需探测生产即可确立）：`e2e/container-calc.spec.ts:216-217` 与 `e2e/manual-3d.spec.ts:10-11` 固定填 `testuser/testuser123`，而 `CHANGELOG.md:1328` 记录该套件在 `PLAYWRIGHT_BASE_URL=http://101.33.232.150/` 上通过。登录失败会导致全线红。

### 意图与边界

- `initTestUser` 改为**仅非生产**执行：`NODE_ENV === 'production'` 时无条件跳过，不再依赖运维记得设 `SKIP_TESTUSER`。保留 `SKIP_TESTUSER=1` 作为非生产环境的额外开关（E2E 与本地开发仍需 testuser）。
- 生产缺 `ADMIN_PASSWORD` 时与 `JWT_SECRET` 同等对待：`throw`，阻断启动。
  - **只判缺失，不判长度**。不要照搬 `JWT_SECRET` 的 32 字符下限——生产 `/etc/cargo-server.env` 里现有口令长度未知，加长度校验会让服务重启直接失败。若后续要加长度要求，单独任务并先确认现有值。
- E2E 凭据改为从 env 读，带非生产默认值；`playwright.config.ts` 的本地 webServer 已是 `NODE_ENV: 'test'` + `CARGO_DB_PATH: ':memory:'`，本地不受影响。
  - **范围必须覆盖 admin 凭据**：`admin123` 在 `e2e/` 有 **24 处**（`auth-isolation.spec.ts` 21 处、`manual-3d.spec.ts:579` 与 `:1024`、`responsive-3d.spec.ts:15`）。只改 testuser 会留下同类问题：一旦轮换生产 admin 口令，远程 E2E 大面积红。两组凭据一起 env 化（建议 `E2E_USERNAME`/`E2E_PASSWORD` 与 `E2E_ADMIN_USERNAME`/`E2E_ADMIN_PASSWORD`）。
- **不改**密码哈希参数、`USERNAME_PATTERN`、限流配置、JWT 逻辑。
- 不删除生产上已存在的 testuser 行——这属于运维动作，写进交付说明，由用户决定何时执行。

### 模块划分

- 改 `server/db.mjs`（`initTestUser` 的 guard、`initAdmin` 的 production fail-fast）
  - `initAdmin` / `initTestUser` 当前是模块内 `const` 局部函数、文件末尾以副作用调用、未 export，`db` 也是模块级单例。**允许把这两个函数 export** 以便单测在不同 `NODE_ENV` 下重复触发（配合 `vi.resetModules()` + 动态 import + `CARGO_DB_PATH=':memory:'`）。不要为了可测性把 seed 逻辑重写成新模块——那是超出本任务的改动。
- 改 `e2e/container-calc.spec.ts`、`e2e/manual-3d.spec.ts`、`e2e/auth-isolation.spec.ts`、`e2e/responsive-3d.spec.ts` 的登录凭据来源
- 新建或扩充 `scripts/dbSeed.test.mjs`（`vite.config.ts` 已把 `scripts/**/*.test.mjs` 纳入 `npm test`）

### 验证标准

单测（需能在不同 `NODE_ENV` 下重复导入 seed 逻辑，用 `CARGO_DB_PATH=':memory:'`）：

| 用例 | 输入 | 期望 |
|---|---|---|
| 生产不种 testuser | `NODE_ENV=production`，`ADMIN_PASSWORD` 已设 | `SELECT * FROM users WHERE username='testuser'` 为空 |
| 非生产种 testuser | `NODE_ENV=test` | testuser 存在且可用 `testuser123` 通过 `bcrypt.compareSync` |
| `SKIP_TESTUSER=1` 在非生产仍生效 | `NODE_ENV=test` + `SKIP_TESTUSER=1` | testuser 不存在 |
| 生产缺 ADMIN_PASSWORD 必须抛错 | `NODE_ENV=production`，不设 `ADMIN_PASSWORD`，新库 | 抛错，信息含 `ADMIN_PASSWORD` |
| 老库同样抛错 | 同上但 users 表已有 admin 行 | 抛错（不是 warning） |
| 生产设了 ADMIN_PASSWORD 正常启动 | `NODE_ENV=production` + `ADMIN_PASSWORD=<32+ 位>` | 不抛错，admin 口令为该值 |
| 非生产缺 ADMIN_PASSWORD 不抛错 | `NODE_ENV=test` | 不抛错（保持开发便利） |

E2E 断言点：`npm run test:e2e` 仍需 125/125 零跳过零失败。`e2e/manual-3d.spec.ts:541` 断言 debug panel 含用户名，改 env 后该断言需跟着读同一个 env 值，不得硬编码。

### 风险与回归门槛

`initAdmin` 改成 fail-fast 后，**生产重启前必须确认 `/etc/cargo-server.env` 已有 `ADMIN_PASSWORD`**，否则服务起不来。这一条必须写在交付说明的最前面，并在 P1-3 部署前由用户确认。

---

## 任务 P1-2b：修正 README 与实际运行架构的冲突

### 根因

`README.md` 描述的是一个不存在的系统。实测五处冲突：

- `:5`「暂不包含账号、多用户、权限」
- `:16`「历史方案保存在浏览器 `localStorage`」
- `:85`「本项目目前是纯前端静态站点，不依赖后端服务」
- `:118`「当前应用没有后端 API，历史方案保存在用户浏览器的 `localStorage` 中」
- `:269` 目录树仍列 `historyPlans.ts`（该文件已在 `4c23c4b` 删除）

实际：`server/index.mjs` 有 20 个路由、JWT 认证、SQLite 持久化；`src/api/historyPlans.ts` 是服务端历史；`playwright.config.ts:18-30` 本地要拉起 API 服务。`git log -- README.md` 最新是 `0bca842`（2026-05-27），整个重构期无人触碰。

`issues/2026-08-03-refactor-review-architecture-project-test-loop.md` 已把它列为 B-P1 并排在整改顺序第 1 位，此后无人承接。

### 为什么放在阶段一

按 README 部署会只发 `dist/` 到 nginx，漏掉 Express、SQLite、认证、API 反向代理、数据库备份与回滚 —— 生产上历史方案与用户数据不可用。这是文档缺陷里唯一会直接导致生产事故的一条，和 P1-1 的删库风险同类。成本又最低。

### 意图与边界

- 把产品范围改为「前端工作台 + Express/SQLite 服务端」，明确认证、历史、自定义柜型/货物、模板都是服务端持久化。
- 部署段补齐：后端服务、数据库位置、`/etc/cargo-server.env`（含 `ADMIN_PASSWORD`、`JWT_SECRET`）、备份与回滚（指向 P1-1 的 `npm run rollback`）、远程 E2E 方式。
- 更新目录树，删掉 `historyPlans.ts`，补上 `src/api/`、`src/hooks/`、`server/`。
- **保留**「不做在线协作、复杂权限、许可证」的范围说明 —— 那部分仍然准确，不要把基础认证一起删掉。
- 不改 `PRD.md`、不改 `CLAUDE.md`、不改 `AGENTS.md`。

### 验证标准

- `grep -n "localStorage\|纯前端\|没有后端 API" README.md` 在历史方案与部署语境下零命中（`src/lib/auth.ts` 的 token、`placementSettings` 等本地偏好仍可提及 localStorage，那是准确的）。
- README 的部署步骤与 `scripts/deploy.mjs` 的 `CONFIG`（`siteRoot`、`serverDir`、`serverServiceName`）一致，与 `CLAUDE.md` 的部署段不矛盾。
- 人工确认：一个没接触过本项目的人照 README 能同时部署前端与后端。

### 提交

`docs: correct README to describe the frontend plus server architecture`

---

## 任务 P1-3：诊断远程 E2E 两处失败，再重新发布 0802

### 根因（待定位，本任务的第一步就是定位）

两处失败都只在**完整远程套件**下出现，回滚后 focused 重跑均 1/1，所以不是功能缺陷，是 full-suite 时序/状态问题：

- `e2e/manual-3d.spec.ts:515`：编辑按钮在 React 重渲染时持续 DOM detach。
- `e2e/container-calc.spec.ts:219`：登录后停留「工作台加载中…」超 5 秒。第二处高度可疑与 `src/App.tsx:16` 的 `import('./Workbench')` 懒加载有关——远端首次拉取含 three 的大 chunk（`build` 报告最大 chunk `three.module` 543.76 kB）比本地慢得多。

### 意图与边界

- 先诊断、再决定改什么。**禁止**为了通过而放宽超时、加 retry、改断言或跳过用例。
- 若结论是「测试对 React 重渲染的假设不成立」，改测试的**定位方式**（例如改用稳定的 test id 重新获取元素）是允许的，但不得放宽它断言的业务事实。
- 若结论是「产品的 lazy-load 在慢网络下体验不可接受」，那是产品问题，改产品并补回归。
- 诊断结论写入 `decision.md`，格式按 `CLAUDE.md`：背景 / 选项 / 决策 / 影响 / 后续。

### 验证标准

- 诊断阶段：在远端连续跑 3 次完整 `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ npm run test:e2e`，记录每次的失败集合。若两处失败**不是每次都出现**，必须在 `decision.md` 记录复现率，不得按「偶发」放过。
- 修正后：远端完整套件连续 2 次 125/125 零跳过零失败，才算通过。单次通过不算。
- 本地 gate 保持：`npm run lint && npm test && npm run build && npm run test:e2e` 全绿。

### 部署与回滚门槛

1. 部署前确认 `/etc/cargo-server.env` 含 `ADMIN_PASSWORD`（P1-2 的前置）。
2. 用 `scripts/deploy.mjs --dry-run` 预演，再实际部署。
3. 部署后：static HTTP 200、未认证 API 401、`sha256sum -b` 本地/远端 static manifest 无差异。
4. 远程完整 E2E 必须 125/125。**任何失败都必须回滚**，且只能用 P1-1 的 `npm run rollback`，不得手工拼 rsync。
5. 回滚后必须验证 live DB SHA-256 与 incident 一致，并跑 `PRAGMA quick_check`。
6. 用户可见的修复上线后，`src/data/releaseNotes.ts` 补发布说明（当前停在 r60，`d037df0` 会直接改变装箱数，必须有说明）。

---

## 执行顺序与提交粒度

```
P1-1  rollback 脚本 + 单测        → commit: feat(deploy): add guarded rollback script
P1-2  凭据 guard + 单测 + E2E env → commit: fix(security): stop seeding known credentials in production
P1-2b README 架构修正             → commit: docs: correct README to describe the frontend plus server architecture
P1-3a 远程失败诊断（只记录）      → commit: docs: record remote e2e failure diagnosis
P1-3b 诊断结论对应的修正          → commit: 视结论而定
P1-3c 部署 + 远程 gate           → commit: docs: record 0802 production release evidence
```

P1-1 与 P1-2 可并行，P1-2b 独立（纯文档，随时可做）。P1-3 必须在 P1-1、P1-2 完成后 —— 它要用 `npm run rollback`，且部署前需要 `ADMIN_PASSWORD` 已就位。

每个任务完成后：更新 `CHANGELOG.md`，运行 `npm run lint && npm test && npm run build`，涉及 UI/流程的跑 `npm run test:e2e`。`git status --short` 确认只暂存本任务文件。

**用户已有改动不得纳入任何提交**：`.serena/project.yml`、`issues/0802/` 下的未跟踪素材（mp4、两个 snapshot json、issue.txt、png）。

## 完成标准

- `scripts/rollback.mjs` 存在、有单测、`--dry-run` 可用；不可能再执行删除 live SQLite 的回滚。
- 生产环境不再种入 testuser；缺 `ADMIN_PASSWORD` 时服务拒绝启动；E2E 的 testuser 与 admin 凭据全部来自 env。
- `README.md` 不再声称纯前端 / localStorage / 无后端 API；照 README 部署不会漏掉 server 层。
- 远程完整 E2E 连续 2 次 125/125。
- 0802 的两个修复在生产可用，用户报的两个问题在生产上实测消失（人工确认：越南 40HQ 那份输入装 877/877；手动同型号连续快速放置方向一致）。
- 上述全部结果写入 `CHANGELOG.md`，取舍与诊断写入 `decision.md`。
