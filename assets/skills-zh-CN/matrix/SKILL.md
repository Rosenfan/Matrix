---
name: matrix
description: 启动或恢复面向任意用户目标的 Matrix 自主 Run，或驱动经典五阶段软件工作流。仅在用户显式调用 $matrix、要求开始/继续/查询 Matrix 工作、或继续 .matrix/ 中已存在的 Run 或变更时使用。闲聊提问、只读排查、单行笔误修正不要调用（直接回答或修复，不建 Run）。
---

# Matrix

Matrix 是唯一的工作流入口。其唯一事实来源是当前仓库的 `.matrix/`；绝不从聊天历史推断阶段或 Run 状态。

经典变更报告 `artifact_language` 时用它书写面向用户的正文；其余场景 Run 产物跟随仓库的既有工作语言。机器命令、标识符与 schema 字段保持英文。

## 首轮动作

运行随项目 Skill 捆绑的 Runtime，使项目兼容性权威优先于全局启动器：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect
```

按返回的 `default_workflow` 路由：

- `auto` → 执行下文的自主 Run 协议。
- `classic` → 执行 [references/classic-compat.md](references/classic-compat.md)（原有 `full` / `hotfix` / `tweak` 五阶段流程，支持可选 Arch 编排）。
- `NO_ACTIVE_CHANGE` 同样携带这两个字段；按同样方式路由。

## No-Run 快速路径

以下情况不建 Run：纯问答、只读排查、规划讨论、单行笔误修正。直接回答或修复。Run 的存在意义是为真实工作保存意图、证据与验收。

## 自主 Run 协议（`auto`）

协议细则见 [references/uaap-protocol.md](references/uaap-protocol.md)；工程准则见 [references/engineering-craft.md](references/engineering-craft.md)；各类任务的证据标准见 [references/domain-verification.md](references/domain-verification.md)。

### 1. 启动并理解

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run start --request "<用户请求原文>" [--id <kebab-id>] [--title "<标题>"]
```

`--request` 必须逐字携带用户的原话（长文本用 `--request-file <路径>`）。随后先调查再提问：阅读代码、文档、日志与 Git 历史，形成根因诊断，自主决定技术路线。只有三类边界值得打断用户：对目标存在实质不同的解读、无法自行查证的私有事实、不可逆或高可见的动作。只影响实现方式的决策由你拍板，写进 brief，不要变成问题。

### 2. 冻结边界

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run frame --goal "<一句话目标>" --accept "A1=<可观察的结果>" [--accept "A2=…"] --check "C1=<命令>" [--check "C2=…"] --expect-revision <n>
```

- `--check` 必须是真实可执行的验证命令（测试、构建、lint、脚本）。Matrix 会在提交时自行运行它们；不要传入你未验证过存在的命令。`--no-checks-reason "<文本>"` 只用于确实没有可执行检查的任务。
- 验收项必须能被你之外的人观察验证。
- 请求模糊、探索性强或改动面大时，传 `--require-confirmation`（或 `--wait "<问题>"`），Run 会暂停一次，只确认 goal + acceptance + checks。请求明确且有界时，不带这些参数调用 frame，并按返回的 `frame` 摘要向用户回显后继续。
- 通过 `--brief-file` 将已查明的精确目标文件路径/函数坐标、关键接口不变量与聚焦检查命令记入 `brief.md`，避免后续接续会话或子代理重新全仓摸排浪费 Token。
- execute 开始后，重新 frame 一律需要用户确认。

### 3. 执行与调整

自主推进。可以使用任何已装技能、MCP 工具或你自己的判断；任何外部技能都不得写 Matrix 状态、跳过 `run submit` 检查或自行宣布完成。
- **最小恢复集接续**：在新会话或切换 Agent 接续在途 Run 时，只读取 `run inspect` + `.matrix/runs/<id>/brief.md`（若刚失败过再看最新 `logs/` 尾部），直接按坐标定位文件施工，禁止盲目重扫全仓。
- **轻量模型子代理切片施工**：多切片编码任务且宿主支持指定轻量高性价比模型（如 `flash`、`haiku`、`sonnet`）拉起具备写权限的子代理时，可将有界代码修改与单测运行委派给指向 `brief.md` 的子代理；主代理独占 `run frame`、`run pivot`、`run submit`、`run verify` 与 `run close` 所有权，若同一切片连续两次受阻则由主代理直接接手。
- 方案变化但目标与验收不变时，记录而不是重来：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run pivot --reason "<原因>" [--scope "<新方案>"] --expect-revision <n>
```

pivot 会使本轮已有检查结果与验收结论失效。探索性诊断可用 `run check --cmd "<命令>"` 记录，但绝不计入验收。

### 4. 提交——由 Runtime 实跑检查

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run submit --summary "<本轮候选改了什么>" --expect-revision <n>
```

Matrix 在锁外执行全部冻结检查，把日志流式写入 `.matrix/runs/<id>/logs/`，只按退出码判定。失败会把 Run 退回 execute 并附带失败检查的输出；连续失败会暂停等用户。绝不自己转述检查结果——Runtime 的账本才是唯一有效记录。

### 5. 诚实验收

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run verify --reviewer <self|subagent|external> --result "A1=<passed|failed|blocked>[:<原因>]" [--result "A2=…"] [--summary "<文本>"] --expect-revision <n>
```

- 必须恰好覆盖每个验收 ID 各一次；缺失或重复 ID 会被拒绝。
- `--reviewer` 是来源声明，不是徽章：`self`（本会话复核）、`subagent`（独立的只读子 Agent 执行）、`external`（用户运行的另一个 Agent/会话）。只声明实际发生的情况。
- `failed` 将 Run 退回 execute（统计停滞）；`blocked` 暂停等用户；全部 `passed` 进入 close。

### 6. 收尾

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs run close --expect-revision <n>
```

Matrix 从 Run 状态渲染 `verification.md`，把 Run 原子归档到 `.matrix/archive/runs/<id>/`，并清空租约。验收之后工作区若又变化，Matrix 会拒绝归档并把 Run 退回 execute。退出时，把已验证的持久工程事实按本仓库既有惯例落盘（AGENTS.md / GLOSSARY.md / docs/adr/）——绝不写任务流水账。

### 多任务与安全

Run 是租约：每个工作区同一时刻至多一个执行中的 Run（`run list`、`run select <id>`、`run select --none`）。并行实施请使用独立 Git worktree。普通新请求绝不静默续接无关的在途 Run 或 classic 变更——先展示在途项并询问。

未经用户当场明确确认，绝不执行不可逆、高可见的动作（force push、改写历史、批量删除、对外发布、付款、发送消息）。需要专业资质的决定（法律、医疗、投资）只整理事实呈报——由用户决定。

## 规则

- 一切状态变更只通过上述 Runtime 命令；绝不手改 `.matrix/runs/`、`current-run.json`、`workflow.lock` 或 `transactions/`。命令返回 `WORKFLOW_RECOVERY_REQUIRED` 时，停止操作并运行 `node <matrix-skill-directory>/scripts/matrix-runtime.mjs doctor`，只使用它返回的精确修复命令。
- 从上一条命令的输出携带 `--expect-revision`；遇到 `REVISION_MISMATCH` 时重新 inspect，不要盲目重试。
- 缺少某个垂直能力时，告知用户存在 `npx skills find <关键词>`；绝不无人值守安装第三方技能。挂载前可用 `matrix skills audit <路径或名称>` 做冲突体检。
- classic 模式的操作规程在 [references/classic-compat.md](references/classic-compat.md)；绝不把它的阶段混入 auto Run。
