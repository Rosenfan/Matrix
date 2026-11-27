# UAAP 协议（auto 工作流）

UAAP（Universal Autonomous Agent Protocol，通用自主 Agent 工作理念）是 `auto` 工作流的工作模型：用户表达意图，Agent 负责理解、探索、判断、执行和验证。所有 Runtime 命令一律以 `node <matrix-skill-directory>/scripts/matrix-runtime.mjs <args>` 运行。证据规则见 `domain-verification.md`，工程判断见 `engineering-craft.md`。`inspect` 返回 `default_workflow: classic` 时，改按 `classic-compat.md` 执行。

## 每个请求的开始

1. 执行 `inspect`。它返回 `default_workflow`、`autonomy_level` 以及在途的 Run 或 classic 变更；`NO_ACTIVE_CHANGE` 表示没有任何在途项。
2. 应用不建 Run 的快速路径：纯问答、只读排查、单文件极小笔误修改，直接解答或完成，不创建 Run。
3. 其余请求都启动一个 Run，并原样保留用户的话：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run start --request "<text>"
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run start --request-file <path> --id <run-id> --title "<text>" --domain "<label>"
```

长文本用 `--request-file`。`--id` 可省略；`--domain` 只是提示标签。

## 重构模糊意图

模糊的请求（"感觉不太对，你看看"）要的是一个结果，不是一份选项清单。先调查到能说出真正的问题为止——它未必是用户报告的那个。确定方向，把目标、发现和你做出的决定写进 brief（`--brief-file`），然后告诉用户你发现了什么、准备做什么。

## 先探索，后提问

提问之前，先把能查的都查一遍：仓库（代码、测试、`AGENTS.md`、`CLAUDE.md`、`GLOSSARY.md`、`docs/adr/`）、Matrix 状态与归档、日志与命令输出、Git 历史（`git log`、`git status`）。

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run check --cmd "<command>" --expect-revision <n>
```

`run check` 把诊断命令留在记录里。它只支撑你的推理，永远不算验收结果。

## 仅有的三种可以打断用户的情况

1. 实质性结果歧义：不同的理解会导致目标、范围或验收项出现实质差异。
2. 缺少外部私有信息：只有用户掌握、环境又无法提供的事实（凭据、截止时间、由他人负责的决定）。
3. 不可逆或高危的对外动作：删除数据、改写 Git 历史、付款、对外发布、以用户身份发送消息。

此清单之外还有一条限制：需要专业资质的现实决定（法律、医疗、投资）永远不替用户做。把事实、选项和风险整理清楚，然后停下。

其余一切由 Agent 自己决定——结构、库、命名、测试策略、工作顺序。做出决定，把理由写进 brief，不要发起技术投票。

## 框定（frame）

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run frame --goal "<text>" --accept "A1=<text>" --accept "A2=<text>" --check "C1=<command>" --scope "<text>" --expect-revision <n>
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run frame --goal "<text>" --accept "A1=<text>" --no-checks-reason "<text>" --require-confirmation --expect-revision <n>
```

- `run frame` 冻结 `goal`、`acceptance[]` 与 `required_checks[]`（或 `no_checks_reason`）。它至少需要一条 `--accept`，以及 `--check` 或 `--no-checks-reason` 二者之一，不能同时给。理解之后只框定一次。`--goal` 和短 flag 走 argv，长文本走 `--brief-file`。
- 在 `brief.md`（`--brief-file`）中锁定探索坐标：写明精确目标文件/函数位置、上下游契约不变量与聚焦检查命令，使后续接续会话、切换 Agent 或施工子代理无需重新全仓扫描。
- 请求明确且有界：框定时不带 `--wait` 或 `--require-confirmation`。Runtime 直接进入 `execute` 并返回摘要；把它回显给用户，然后继续。
- 请求模糊、带探索性质或范围很大：先调查，再加 `--require-confirmation`。确认只针对目标、验收项和检查，从不涉及技术选项。
- 当上述边界迫使你提问时，用 `--wait "<question>"` 让 Run 停在 `await-user`。`autonomy_level: strict` 的项目一律等待确认。
- `execute` 开始后，重新 `run frame` 一律需要用户确认；修改目标或验收项永远不是内部决定。

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run resolve --answer "<text>" --confirmed --extend-budget <n> --expect-revision <n>
```

`run resolve` 结束 `await-user`。`--confirmed` 表示用户批准了等待中的确认。`--answer` 在 Run 等待回答时必须是用户的原话（长文本用 `--answer-file`）。等待中的 Run 返回的 `continuation` 会指明该用哪种形式。

## 执行、转向与提交

- 任务需要哪个已安装的 Skill 就用哪个，没有任何一个是必须的。按能产生可观察证据的最小切片推进。
- **最小恢复集与轻量子代理切片**：跨会话或跨 Agent 接续在途 Run 时，只读 `run inspect` + `.matrix/runs/<run-id>/brief.md`（若有失败再看最新 `logs/` 尾部），直接定位目标文件。多切片任务且宿主支持拉起轻量高性价比模型（如 `flash`、`haiku`、`sonnet`）写权限子代理时，主代理可将有界代码修改与单测运行委派给读取 `brief.md` 的干净子代理，但所有 `run *` 状态命令由主代理独占（同一切片连续两次受阻时由主代理直接接手）。
- 方法变更用 pivot，Run 处于 `execute` 或 `verify` 时可用。它保留目标与验收项，并使本轮已有的提交与评审结论失效，因此必须重新 `run submit`：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run pivot --reason "<text>" --expect-revision <n>
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run submit --summary "<text>" --expect-revision <n>
```

- 检查通过的唯一起点是 `run submit`：Runtime 在不持锁的情况下亲自执行每一条冻结的检查命令，把输出流式写入 `.matrix/runs/<run-id>/logs/`，并记录退出状态（默认超时 120 秒，`--timeout <ms>` 可覆盖）。绝不自行宣称某项检查通过。
- 全部通过后 Run 进入 `verify`。有检查失败则留在 `execute`：修复原因，然后再次提交。

## 可观察、可验证的验收项与检查命令

- 验收项（`A<n>=`）写一个可观察的结果：涉及哪个文件、接口、命令或行为，以及什么算成立。"运行良好""代码干净""已处理"都不是验收项。
- 检查（`C<n>=<command>`）是一条以退出码为裁定的命令：`0` 为通过，其余为失败。它不应需要交互输入，路径相对项目根目录书写。优先使用仓库已有的命令——测试、lint、类型检查或构建——或一个聚焦的脚本。冻结之前先跑一遍，并把每个可执行的验收项都对应到一条检查。
- 命令与操作系统相关。Windows 上命令经 Windows shell 执行，`NODE_ENV=test cmd` 与 `export VAR=...` 会失败；把环境放进命令所调用的脚本里。
- 绝不在命令里写凭据：Runtime 会拒绝携带字面凭据的命令（`--token`、`Bearer `、`user:pass@`、`KEY=`），而不是把它存下来。`state.json` 不保存命令输出，但流式日志会保留命令打印的内容。密钥从环境变量读取。
- `--no-checks-reason "<text>"` 只在没有任何命令能如实判定结果时用来替代 `--check`——调研报告、架构评估、产品分析。绝不用它跳过失败或缓慢的测试。改动代码的 Run 至少需要一条可执行的检查；声明了 `no_checks_reason` 而 `.matrix/` 之外的代码又有改动时，`run submit` 会给出警告 `CODE_CHANGED_WITHOUT_CHECKS`。

## 验证（verify）

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run verify --reviewer <self|subagent|external> --result "A1=<passed|failed|blocked>[:<reason>]" --expect-revision <n>
```

- 每个验收 id 恰好覆盖一次；原因里含 `:` 或 `=` 时改用 `--result-file <path>`。评审发现写入 `--findings-file <path>`。
- `--reviewer` 声明实际由谁评审，不是对可信度的声明。`self` 是诚实的默认值。只有当独立的评审者确实产出了结果时，才声明 `subagent` 或 `external`（见 `domain-verification.md`）。
- 全部 `passed` 后 Run 进入 `close`。有 `failed` 则回到 `execute`：修复原因并再次提交。有 `blocked` 则进入 `await-user`。

## 预算与 await-user

| 计数器 | 何时累加 | 默认上限 |
|---|---|---|
| `iteration` | 一次 submit 的全部检查通过 | 5 |
| `submit_failures` | 一次 submit 有检查失败 | 5 |
| 停滞（stagnation） | verify 对同一批未解决项报告 `failed` | 连续 2 轮，或累计 5 轮 |
| `verifier_attempt` | verify 结果格式错误或 verifier 失败 | 3（不计入停滞） |

- Run 进入 `await-user` 时停下。不要重试、重新框定或修改状态。向用户说明冻结的目标与验收项、已经尝试过什么及其证据、是哪个计数器触顶。
- 等用户做出决定，再用 `run resolve` 传入；返回的 `continuation` 要求时加上 `--extend-budget <n>`。越过上限继续是用户的决定；绝不擅自延展预算。

## 收尾（close）

- 验证通过后执行 `run close --expect-revision <n>`。Runtime 把 Run 归档到 `.matrix/archive/runs/<run-id>/`，并从状态生成 `verification.md`。若 HEAD、已跟踪的 diff 或 `.matrix/` 之外的未跟踪文件与已验证的状态不一致，则拒绝关闭并把 Run 退回 `execute`（`CANDIDATE_CHANGED`）；`run verify` 对已提交的状态做同样的检查。提交通过到关闭之间，不要修改实现。
- 关闭前，提议把经验证的持久事实按仓库既有的位置沉淀（`AGENTS.md`、`CLAUDE.md`、`GLOSSARY.md`、`docs/adr/`）。不要另建平行的记忆存储。
- `run close --abort --reason "<text>"` 终止一个不应继续的 Run。归档保留记录，工作区保持原样。

## 租约、多任务与并行

- 一个工作区只有一份租约，记录在 `.matrix/current-run.json`。所有变更类 `run` 命令都必须针对持有租约的 Run，并携带上一次 `continuation` 给出的 `--expect-revision <n>`；否则 Runtime 返回 `LEASE_NOT_HELD`。
- 每条命令的输出都带 `continuation`，即下一步的确切命令。照它执行，不要凭记忆拼命令。遇到 `REVISION_MISMATCH` 时，执行 `run inspect` 并使用它返回的 `continuation`。
- 要继续另一个 Run，先列出再选择。`run select --none` 释放租约：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run list
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run select <run-id>
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run inspect <run-id>
```

- 离开一个处于 `execute` 的 Run 时，若 `.matrix/` 之外还有未提交的改动，会返回警告 `WORKTREE_DIRTY_ON_LEASE_SWITCH`：请先提交或暂存。
- 绝不在同一个工作区里同时推进两个 Run。需要并行实施时，为每个任务使用独立的 `git worktree`。
- Run 与 classic 变更共用同一个预写日志闸门，任一方未完成的事务都会阻挡另一方的变更。按 `classic-compat.md` 的说明用 `doctor` 处理。

## 不续接无关的工作

`inspect` 与 `run inspect` 把在途的 Run 与 classic 变更作为候选连同状态一并列出。把在途项报告给用户。普通的新请求不续接无关的 Run 或 classic 变更。只有用户要求继续、或请求明显就是在说它时才继续：Run 用 `run select <run-id>`，classic 变更进入对应阶段的 Skill。

## 缺少专有能力时

如果没有已安装的 Skill 能覆盖任务所需，如实说明并建议 `npx skills find <keyword>`。装什么由用户决定：绝不无人值守地安装、升级或移除 Skill，也绝不在主流程里运行 `find-skills`。`matrix skills audit <path-or-name>` 以只读静态扫描报告一个外部 Skill 的冲突风险，不执行该 Skill 的任何脚本。
