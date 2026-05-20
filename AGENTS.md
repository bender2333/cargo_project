# Repository Guidelines
## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. No LLM for Deterministic Work

**Use Claude for language. Use code for logic.**

Use Claude for: classification, drafting, summarization, extracting information from unstructured text.

Do NOT use Claude for: routing, retries, status code handling, deterministic transformations.

If a status code already answers the question, let regular code answer it. An LLM deciding whether to retry a 503 is an unstable if-else billed at $0.003/token.


## 7. Expose Conflicts, Don't Average Them

**When two patterns contradict, pick one. Don't blend.**

If two existing patterns in the codebase contradict each other:
- Choose one — prefer the newer or more tested pattern.
- State your reasoning.
- Flag the other pattern for future cleanup.

Code that tries to satisfy two conflicting rule sets simultaneously is worse than either pattern alone.

## 8. Read Before You Write

**Understand before you add.**

Before adding code to a file:
- Read the file's exports, its direct callers, and any obviously shared utilities it uses.
- If you don't understand why the existing code is structured the way it is, ask — don't just add.

"This seems unrelated to me" is the most dangerous sentence in a codebase.

## 9. Tests Must Encode Intent, Not Just Behavior

**A passing test suite is not proof of correctness.**

Every test must encode *why* the behavior matters, not just *what* it does.

`expect(getUserName()).toBe('John')` is worthless if the function receives a hardcoded ID.

If you cannot write a test that fails when business logic changes, the function itself is wrong.

Do not claim confidence from tests that only verify a function returns *something*.

## 10. Checkpoints on Long-Running Tasks

**Don't continue from a state you can't clearly describe.**

In multi-step tasks, after each step: summarize what was done, what was verified, and what remains.

If you've lost track of where things stand, stop and restate the current situation before proceeding.

A mistake at step 4 that gets built on by steps 5 and 6 costs more to unwind than restarting from scratch.

## 11. Convention Over Novelty

**Consistency beats correctness. Disagreement is a separate conversation.**

If the codebase uses `snake_case` and you prefer `camelCase`: use `snake_case`.  
If the codebase uses class-based components and you prefer hooks: use class-based components.

If you genuinely believe a convention is harmful, say so explicitly. Do not silently fork a second pattern into the codebase.

A second pattern — even a better one — is worse than one pattern applied consistently.

## 12. Fail Loudly, Never Silently

**A failure that looks like success is the most expensive kind.**

Do not say "migration complete" if 30 records were silently skipped.  
Do not say "tests passed" if any tests were skipped.  
Do not say "feature works" if you didn't verify the edge cases you were asked to verify.

Default to surfacing uncertainty. If you're not sure something succeeded, say so.

Silent failures — functions that run but return wrong data, migrations that skip rows, assertions that never actually assert — are the hardest bugs to find and the most avoidable.
## 长任务规则
1. 每个子任务完成后：git commit + 更新 CHANGELOG.md
2. Context > 50% 时：主动 /compact
3. Context 耗尽无法继续时：写好 CHANGELOG.md 当前状态，正常结束 session
   （不要循环重试，下一个 session 会读取 CHANGELOG.md 接手）
4. 大任务拆解：先列出子任务清单写入 CHANGELOG.md，再逐步执行
**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, clarifying questions come before implementation rather than after mistakes, and failures are visible the moment they happen rather than days later.

5. 对于小的独立的任务，尽量让subagent去完成做。保持合理的上下文
## 重构目标

本项目正在按 `PRD.md` 进行货柜装箱计算系统重构。目标是在保留当前 Vite + React + TypeScript 架构的基础上，参考 `archive/` 旧版工作台的样式、布局和功能组织方式，重建前端体验。

核心要求：

- 保留现有 3D 显示、标签、Excel 导入导出、装箱计算和中英文能力。
- 标签是核心业务能力，必须贯穿录入、导入、计算、2D、3D、分层、明细、导出和历史方案。
- 分层查看必须重构为真实装柜作业视角，表达货物如何从底层开始逐层堆叠，而不是简单按 `z` 高度过滤。
- 暂不实现多用户、权限、账号、许可证、在线协作等管理类功能。

## 项目结构

- `src/`：React + TypeScript 源码。
- `src/lib/`：装箱计算、分层、导入解析等可测试业务逻辑。
- `src/components/`：UI 与 3D/2D 展示组件。
- `src/data/`：柜型、示例数据等静态业务数据。
- `e2e/`：Playwright 浏览器自动化测试。
- `test-data/`：Excel 等测试夹具。
- `archive/`：旧版功能和样式参考，不直接依赖旧版 bundle。
- `PRD.md`：重构需求主文档。
- `decision.md`：模糊点、取舍和重要技术决策记录。

## 开发原则

- 小步快走，避免一次性大改。
- 每个提交只解决一个清晰问题，例如布局骨架、标签模型、分层计算、3D 接入或某个 bug。
- 不把计算逻辑写死在 UI 组件中；装箱、标签统计、分层和导入解析应优先放入可测试模块。
- 新功能必须围绕 `PackingResult`、标签和层级数据保持一致，避免 2D、3D、明细表各自计算。
- 旧版 `archive` 只作为产品和视觉参考，不能把旧版静态产物作为新架构依赖。

## 决策记录

遇到以下情况必须写入 `decision.md`：

- PRD 未明确的业务规则。
- 标签、分层、支撑关系、装柜顺序等存在多种合理实现。
- 需要在旧版行为和当前实现之间做取舍。
- 需要暂缓、降级或改变某项 PRD 要求。
- 发现当前数据模型无法支撑需求，需要调整架构。

记录格式建议：

```md
## YYYY-MM-DD 决策标题

- 背景：
- 选项：
- 决策：
- 影响：
- 后续：
```

# 单元测试
核心的算法和功能部分必须要单元测试完整，确保场景覆盖齐全

## 验证要求

每次功能修改后至少运行相关验证：

- `npm run lint`
- `npm test`
- `npm run build`

涉及 UI、3D、2D、分层、导入导出或用户流程时，必须运行浏览器自动化测试：
测试的目的不是通过，而是为了确认功能的状态，如果不通过，优先将不通过的点记录下来，到 `decision.md`. 不要为了测试通过而修改测试用例

- `npm run test:e2e`

若测试暂时无法运行，必须在提交或交付说明中写明原因、影响范围和后续补救。

## Git 工作纪律

- 每次修改完毕，请及时进行 `git commit`，确保工作记录正常。
- 小 bug 修复完成后迅速提交，避免混入无关改动。
- 提交前检查 `git status --short`，只提交本次任务相关文件。
- 不回滚、不删除用户已有改动，除非用户明确要求。
- 提交信息使用简洁的命令式描述，例如：
  - `docs: add refactor agent guidelines`
  - `feat(layers): add support relationship model`
  - `fix(import): preserve cargo labels from excel`

# code

- 每次修改完毕，请记得及时进行 `git commit`，确保工作区干净，工作记录正常。
- 小步快走，小 bug 修复完毕迅速进行 `commit`。
- 需要进行浏览器自动化测试进行完整的验证。
