# Matrix Workflow

一个提供 Prim 与 Arch 编排的证据驱动开发工作流，灵感来自 [Comet](https://github.com/rpamis/comet)。Matrix 可以使用自身能力，也可以按事实调用已验证的 [Matt Pocock agent skills](https://github.com/mattpocock/skills)，但生命周期所有权始终由 Matrix 保持。

**[English](./README.md)** | 中文

<p align="center">
  <img src="./assets/matrix-workflow-poster-zh.svg" alt="Matrix Workflow" width="100%">
</p>

---

## 目录

- [为什么需要 Matrix](#为什么需要-matrix)
- [它做了什么](#它做了什么)
- [前置条件](#前置条件)
- [安装](#安装)
- [快速开始](#快速开始)
- [工作流阶段](#工作流阶段)
- [工作原理](#工作原理)
- [工作流类型](#工作流类型)
- [与 Matt Pocock Skills 的集成](#与-matt-pocock-skills-的集成)
- [许可证](#许可证)

---

## 为什么需要 Matrix

[Matt Pocock 的 skills](https://github.com/mattpocock/skills) 提供 `/grilling`、`/tdd`、`/code-review` 等聚焦能力。但缺少统一生命周期所有者时会导致常见问题：

- **无流程记忆**：你进行了 grilling，然后实现，但没有记录决策过程
- **阶段混乱**：设计完成了吗？我们在构建阶段吗？上下文丢失后很难判断
- **静默范围蔓延**：需求在构建过程中变更，却没有返回设计阶段
- **缺少证据**："看起来完成了"却没有验证证明

Matrix 通过唯一的确定性状态机解决这些问题 —— 包含明确的阶段、守卫条件和产物追踪。Skill 可以协助阶段，但生命周期始终由 Matrix 拥有。

---

## 它做了什么

Matrix 在集中定义的两种 workflow profile 上提供两种能力编排：

```
full：                    open → design → build → verify → archive
hotfix/tweak lightweight：open ─────────→ build → verify → archive

Prim：Matrix 使用自身能力
Arch：仅在任务事实满足触发条件时调用已验证的原子 Skill
```

恢复路径由 Runtime 受控执行：

```text
build  --design-gap--------------------> design
verify --verification-failed-----------> build
verify --acceptance-or-design-gap------> design
任意活动阶段 --abort-------------------> aborted
```

每个阶段：
- 有特定的交付物（产物）
- 有必须通过的守卫条件
- 记录所有转换
- 可承受上下文丢失（状态存储在磁盘上）

---

## 前置条件

- 已安装 [Claude Code](https://docs.anthropic.com/claude-code) 和/或 Codex，作为 Skill 宿主
- Node.js 18+，且 `npm` 已加入 PATH（用于 Matrix CLI）
- Python 仅在兼容窗口内的旧适配器路径使用；新安装使用内置 Node workflow runtime
- Git 仅在从 GitHub 安装或参与 Matrix 开发时需要

---

## 安装

只需全局安装一次 Matrix CLI：

```bash
npm install --global @rosenfan/matrix
```

之后在任意项目中初始化：

```bash
cd /path/to/your/project
matrix init
```

交互式初始化支持：

- 选择 Matrix Skill 发现入口安装到当前项目或全局
- 复制 skills（推荐）或为本地开发创建符号链接
- 安全地重新配置已有安装，并自动备份被替换的 Matrix 文件
- 审查 Matt Skills v1.2.3 官方 25 项角色，并在目标项目安装其中 23 项兼容 Skill
- 选择 Prim 或 Arch 作为项目默认值，且不禁用另一种可用模式

自动化或 CI 环境可以使用：

```bash
# 使用推荐的项目级默认值，不显示交互问题
matrix init --yes --with-mattpocock

# 显式选择项目默认编排
matrix init --yes --with-mattpocock --default-orchestration arch

# 只有明确授权备份后才替换被本地修改的 Matt Skills
matrix init --yes --with-mattpocock --force-matt

# 检查安装完整性和运行环境
matrix doctor
```

更新已经初始化的项目：

```bash
# 检查新版 Matrix CLI，确认计划后更新 CLI 并同步当前项目资产
matrix update

# 离线或本地开发：不访问 npm registry，只用当前 CLI 同步资产
matrix update --skip-self-update

# 已在自动化中明确授权写入
matrix update --yes
```

`matrix update` 会保留既有安装的 scope、平台、语言、mode 与 orchestration。它先隔离验证 npm 新包，再由新 CLI 同步 Matrix 资产。当本地 Matt Skills 不完整或过期时，交互式 `matrix update` 会询问一次，并在同一轮把 Matt 修复到受支持 release——CLI 升级、资产刷新、Matt 修复一条命令完成（`--with-mattpocock` 为自动化/CI 提供等价的非交互行为；`--force-matt` 可额外替换被本地修改的 Matt Skills，且必须与 `--with-mattpocock` 同传；`matrix update` 绝不删除 Matt Skills）。`--all` 可将更新扩展到全部已索引项目（`~/.matrix/projects.json`），各项目隔离更新，失效目录自动从索引清理。npm 与项目资产是两个事务：若 CLI 已更新但资产同步失败，可运行 `matrix update --skip-self-update` 重试。Windows 上自升级链路经 Node 调用 npm（不经 shell），一条命令升级无需手动步骤。

Matrix 0.1.5 固定对应 Matt Skills v1.2.3，commit 为 `6acc160e4e0cd062dbbbd7a1b26ae92855edf07e`。即使上游已有新版，`matrix init --with-mattpocock` 仍使用该确切 archive 与经过审查的 23 项兼容 manifest。官方角色中的 `implement` 与 raw `resolving-merge-conflicts` 不兼容，因此 Matrix 不安装也不管理它们。Matrix scope 只控制 Matrix Skill 的发现位置；Matt Skills 与 `.matrix/matt-installation.json` 始终属于目标项目。全局 Matt 副本会保留，但绝不用于补齐项目 readiness。

`matrix init` 选择的语言决定新 Matrix 产物的正文语言：`zh-CN` 使用中文、`en` 使用英文。Runtime 守卫依赖的 Markdown 英文标题 token 保持不变；每个 change 在创建时冻结该语言。

也可以直接从 GitHub 安装，而不是 npm：

```bash
npm install --global github:Rosenfan/Matrix
```

Matrix 将安装：
- `matrix/` — 入口点和状态管理
- `matrix-open/` — Open 阶段与 canonical proposal
- `matrix-design/` — Design、plan 与 Contract 批准
- `matrix-build/` — 有界实现与构建证据
- `matrix-verify/` — 测试和双轴审查证据
- `matrix-archive/` — 归档阶段
- `matrix-hotfix/` — 小型 Bug 快捷方式
- `matrix-tweak/` — 有界变更快捷方式
- `matrix-status/` — 检查当前状态
- `matrix-handoff/` — 可选：导出给任意实现 agent（Claude Code、opencode 等）

---

## 快速开始

在 Claude Code 中：

```
$matrix 我想给 API 添加用户认证
```

Matrix 将会：
1. 用工作流类型 `full` 和冻结的 `prim|arch` 编排初始化变更
2. 进入 `open`；Prim 直接处理，Arch 只调用已证明的需求触发能力
3. 创建 `proposal.md`，包含目标、范围、验收标准、风险
4. 守卫检查：所有章节是否内容充实？
5. 如果通过 → 转换到 `design`

---

## 工作流阶段

| 阶段 | Arch 能力（按事实触发，不是固定序列） | 交付物 | 守卫条件 |
|------|----------------------------------------|--------|----------|
| **open** | `/grilling`、`/domain-modeling` | `proposal.md`；可选仓库约定的 context/ADR 证据 | 目标、范围、验收标准、风险存在 |
| **design** | `/domain-modeling`、`/research`、`/prototype`、`/codebase-design`、条件触发的 `/writing-for-agents` | `design.md`、`plan.md` | 决策、测试点、步骤已记录 |
| **build** | `/tdd`、`/diagnosing-bugs`、条件触发的 `/writing-for-agents` 与仅生成的 `/wizard` | 代码、`verification.md` | 已批准的精确 Contract 匹配，且已记录构建证据 |
| **verify** | `/code-review` | 测试证据、双轴审查、Arch 回执 | 证据内容充分；Arch 回执匹配当前 Contract、审查正文和工作区 |
| **archive** | 无；两种模式均由 Matrix 拥有 | 归档记录 | 验证守卫通过 |

---

## 工作原理

状态存储在 `.matrix/` 目录：

```
.matrix/
├── active.json              # 当前变更 ID
├── config.yaml
├── changes/
│   └── <change-id>/
│       ├── matrix.yaml      # 唯一 workflow、orchestration、阶段、状态与 revision 事实
│       ├── workspace-baseline.json # lightweight 的实施顺序边界
│       ├── events.jsonl
│       └── artifacts/
│           ├── proposal.md
│           ├── design.md
│           ├── plan.md
│           ├── verification.md
│           └── evidence-history/
└── archive/
```

状态机强制执行转换：

```bash
# 检查守卫
matrix workflow guard open

# 推进（仅在守卫通过时）
matrix workflow transition design

# lightweight：确认紧凑 proposal 后进入 Build
matrix workflow transition build --confirmed

# 验证失败时返回 Build；旧证据保留在历史目录
matrix workflow return build --reason verification-failed

# 终止变更但保留产物，不撤销工作区代码
matrix workflow abort --reason requirement-cancelled

# 最终归档强制使用两步乐观提交
matrix workflow archive --dry-run
matrix workflow archive --expect-preflight <dry-run-返回的-sha256>
# hotfix/tweak 的提交命令还必须带 --confirmed

# 只读诊断中断的 Workflow
matrix workflow doctor

# 只恢复 doctor 明确报告的 transaction 或陈旧锁
matrix workflow doctor --repair --transaction <id> --strategy <continue|rollback>
matrix workflow doctor --repair --lock <id>
```

`matrix.yaml` 仍是 workflow、orchestration、阶段、状态与 revision 的唯一事实来源。full 批准 proposal/design/plan 的精确字节；lightweight 批准紧凑 proposal，要求明确确认，并与初始化工作区基线比较，阻止先实现后补方案。Contract 漂移会阻断后续阶段。最终 Archive 仍使用只读 dry-run 与 hash-bound commit，shortcut 还要求明确确认；所有多文件 mutation 继续受持久 journal 保护。

---

## 工作流类型

| 类型 | 使用场景 | 阶段 |
|------|----------|------|
| **full** | 新功能、架构变更 | 全部 5 个阶段 |
| **hotfix** | 可复现的小型 Bug | 简化：open → build → verify → archive |
| **tweak** | 有界变更，无 API/架构影响 | 简化：open → build → verify → archive |

hotfix 与 tweak 引用同一个内部 `lightweight` 迁移 profile，只在入口和证据上区分：hotfix 要求复现、根因、回归证据；tweak 要求行为边界、diff 与范围审查证据。

---

## 特别功能：matrix-handoff

**默认用法**：直接使用主流程即可。无论你用 Codex、Claude Code、zcode 还是 opencode，标准流程都适用：

```
$matrix → open → design → build → verify → archive
```

**何时使用 `$matrix-handoff`**：仅当你想**跨工具拆分工作**时 —— 用一个 agent 设计，交给另一个 agent 实现。

| 场景 | 操作 |
|------|------|
| 一个工具完成所有工作（默认） | 直接用 `$matrix`，无需额外步骤 |
| 同一 agent 设计 + 实现 | 标准流程：design → build → verify |
| Codex 设计 + Claude Code 实现 | design → build（批准 Contract）→ `$matrix-handoff` → `export --agent claude-code` → Claude Code → verify |
| zcode 设计 + opencode 实现 | design → build（批准 Contract）→ `$matrix-handoff` → `export --agent opencode` → opencode → verify |

### matrix-handoff 工作原理

1. 设计阶段完成，守卫通过，并在 design→build 决策点选择实现 agent
2. 运行 `$matrix-handoff` → 导出冻结 Contract 为 `artifacts/handoff-task-<task-id>.md`（`export --agent <agent-id>`；`--target generic` 为兼容的 Claude Code 旧形态，产出 `artifacts/claude-task.md`）
3. 实现 agent 读取任务包并实现
4. 实现 agent 在 `artifacts/verification.md` 中产生证据
5. 返回 Matrix：构建守卫 → 验证 → 归档

此 sidecar 不会改变 Matrix 状态。它只是纯粹的导出 —— 就像为另一个工具拍一张设计快照。

---

## 与 Matt Pocock Skills 的集成

Prim 使用 Matrix 自身能力。Matrix 会审查 Matt v1.2.3 官方 25 项角色，安装其中 23 项兼容 Skill，但 Arch 只自动调用以下十项经过审查的能力：

| 阶段 | 能力 | 触发条件 |
|---|---|---|
| open | `/grilling` | 存在重大歧义或用户明确要求压力测试 |
| open/design | `/domain-modeling` | 词汇、不变量或架构决定不清晰 |
| design | `/research` | 仓库内无法获得必需的外部事实 |
| design | `/prototype` | 重大设计问题需要一次性实验证据 |
| design | `/codebase-design` | 深模块、接口或测试接缝决定尚未完成 |
| design/build | `/writing-for-agents` | Contract 修改 agent-facing 指令或指针可达文档 |
| build | `/tdd` | 可测试接缝上的可观察行为发生变化 |
| build | `/diagnosing-bugs` | 存在真实失败且根因未知 |
| build | `/wizard` | Contract 需要生成人工执行的 shell 步骤；Matrix 不端到端运行 |
| verify | `/code-review` | 需要 Standards 与 Spec 双轴证据 |

Matrix 可以推荐但绝不嵌套以下 user-invoked handoff：`setup-matt-pocock-skills`、`improve-codebase-architecture`、`wayfinder`、`handoff`、`to-questionnaire`。它们由用户在活动阶段外显式运行，选中的结果可以再进入受治理 Change。

Arch 在 `code-review` 后记录由 Runtime 管理的审查回执，把 fixed point 与已提交的 HEAD diff 绑定到当前 Contract、审查正文和工作区。正常的 `code-review` 回执要求 Matrix 管理资产之外的候选工作区是干净的。无可用 Git 基线、已提交 diff 为空、仍存在 staged/unstaged/untracked 候选，或正确安装的 capability 真实失败时，Matrix 可为该 revision 执行一次明确标记的同能力 fallback；其中 `uncommitted-worktree` 会同时绑定 fixed point 与完整工作区候选的内容 hash。安装完整性失败不得 fallback。只有标题或自述、但没有匹配回执时，Verify 不能推进。

安装但保持 standalone 的 Skill 是 `ask-matt`、`grill-with-docs`、`triage`、`to-spec`、`to-tickets`、`grill-me`、`teach`、`wait-what`。`implement` 与 raw `resolving-merge-conflicts` 可能接管 Matrix 所有的 TDD、review、stage 或 commit 副作用，因此 0.1.5 不安装也不管理它们；已有副本会被保留并报告为未管理额外项。安装不代表自动调用；任何 companion 都不得推进、提交、归档、恢复或写 Matrix 状态。

---

**关键区别**：Matt Pocock 的 skills 是独立工具。Matrix 增加了：
- **状态持久化**：可承受上下文丢失
- **阶段强制**：full 不能跳过 Design；lightweight 不能在确认 Open Contract 前修改实现
- **证据要求**：守卫检查产物，而非断言
- **转换日志**：完整的阶段变更审计记录

---

## 许可证

[MIT](./LICENSE)
