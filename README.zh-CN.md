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

Matrix 在同一条工作流上提供两种能力编排：

```
open → design → build → verify → archive

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

- 已安装 [Claude Code](https://docs.anthropic.com/claude-code)
- Node.js 18+（用于运行安装器）
- Python 3.8+ 已添加到 PATH

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

- 选择安装到当前项目或全局
- 复制 skills（推荐）或为本地开发创建符号链接
- 更新已有安装，并自动备份被替换的 Matrix 文件
- 在同一流程中安装 Matt Pocock 的配套 skills
- 选择 Prim 或 Arch 作为项目默认值，且不禁用另一种可用模式

自动化或 CI 环境可以使用：

```bash
# 使用推荐的项目级默认值，不显示交互问题
matrix init --yes --with-mattpocock

# 显式选择项目默认编排
matrix init --yes --with-mattpocock --default-orchestration arch

# 检查安装完整性和运行环境
matrix doctor
```

npm 包正式发布前，也可以直接从 GitHub 安装：

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
- `matrix-claude/` — 可选：导出供 Claude Code 使用

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
| **design** | `/domain-modeling`、`/research`、`/wayfinder`、`/prototype`、`/codebase-design` | `design.md`、`plan.md` | 决策、测试点、步骤已记录 |
| **build** | `/tdd`、`/diagnosing-bugs`、`/resolving-merge-conflicts` | 代码、`verification.md` | 已批准的精确 Contract 匹配，且已记录构建证据 |
| **verify** | `/code-review` | 测试和审查证据 | 测试和审查证据存在 |
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

# 验证失败时返回 Build；旧证据保留在历史目录
matrix workflow return build --reason verification-failed

# 终止变更但保留产物，不撤销工作区代码
matrix workflow abort --reason requirement-cancelled

# 最终归档强制使用两步乐观提交
matrix workflow archive --dry-run
matrix workflow archive --expect-preflight <dry-run-返回的-sha256>

# 只读诊断中断的 Workflow
matrix workflow doctor

# 只恢复 doctor 明确报告的 transaction 或陈旧锁
matrix workflow doctor --repair --transaction <id> --strategy <continue|rollback>
matrix workflow doctor --repair --lock <id>
```

`matrix.yaml` 是 workflow、orchestration、阶段、状态与 revision 的唯一事实来源，schema 为 `matrix/change/v2`；初始化解析出的 `prim|arch` 在整个 change 中冻结。旧 schema 会被拒绝且不会发生写入。`design -> build` 会记录 `proposal.md`、`design.md`、`plan.md` 精确字节的 SHA-256 身份；任一字节改动都会阻断 Build、Verify、Archive 和 Claude 导出，必须受控 Return 到 Design 后重新批准。最终 Archive 必须先只读 dry-run，再携带该 hash 提交；Runtime 在 Archive 事务边界内重算整个受保护 change 目录 manifest，发生漂移即拒绝。所有多文件 Workflow mutation 都由 `.matrix/transactions/` 下的持久 journal 保护；`matrix workflow doctor` 始终只读，恢复必须显式绑定其报告的 transaction/strategy 或 lock identity。终态 journal 会收缩为有界审计 receipt，未完成或冲突 journal 永不自动删除。

---

## 工作流类型

| 类型 | 使用场景 | 阶段 |
|------|----------|------|
| **full** | 新功能、架构变更 | 全部 5 个阶段 |
| **hotfix** | 可复现的小型 Bug | 简化：open → build → verify → archive |
| **tweak** | 有界变更，无 API/架构影响 | 简化：open → build → verify → archive |

---

## 特别功能：matrix-claude

**默认用法**：直接使用主流程即可。无论你用 Codex 还是 Claude Code，标准流程都适用：

```
$matrix → open → design → build → verify → archive
```

**何时使用 `$matrix-claude`**：仅当你想**跨工具拆分工作**时 —— 用 Codex 设计，然后交给 Claude Code 实现。

| 场景 | 操作 |
|------|------|
| 一个工具完成所有工作（默认） | 直接用 `$matrix`，无需额外步骤 |
| Codex 设计 + Codex 实现 | 标准流程：design → build → verify |
| Codex 设计 + Claude Code 实现 | design → build（批准 Contract）→ `$matrix-claude` → Claude Code → verify |

### matrix-claude 工作原理

1. 设计阶段完成，守卫通过
2. 运行 `$matrix-claude` → 导出冻结的设计为 `artifacts/claude-task.md`
3. Claude Code 读取任务包并实现
4. Claude Code 在 `artifacts/verification.md` 中产生证据
5. 返回 Matrix：构建守卫 → 验证 → 归档

此 sidecar 不会改变 Matrix 状态。它只是纯粹的导出 —— 就像为另一个工具拍一张设计快照。

---

## 与 Matt Pocock Skills 的集成

Prim 使用 Matrix 自身能力。Arch 使用初始化时验证的十项原子能力：

| 阶段 | 能力 | 触发条件 |
|---|---|---|
| open | `/grilling` | 存在重大歧义或用户明确要求压力测试 |
| open/design | `/domain-modeling` | 词汇、不变量或架构决定不清晰 |
| design | `/research` | 仓库内无法获得必需的外部事实 |
| design | `/wayfinder` | 模块归属或依赖接缝未知 |
| design | `/prototype` | 重大设计问题需要一次性实验证据 |
| design | `/codebase-design` | 深模块、接口或测试接缝决定尚未完成 |
| build | `/tdd` | 可测试接缝上的可观察行为发生变化 |
| build | `/diagnosing-bugs` | 存在真实失败且根因未知 |
| build | `/resolving-merge-conflicts` | 正在发生 merge/rebase 冲突 |
| verify | `/code-review` | 需要 Standards 与 Spec 双轴证据 |

`grill-with-docs`、`implement`、`improve-codebase-architecture` 不受 Matrix 管理，也不会自动调用。用户已安装的副本会作为非受管额外 Skill 保留。companion 不得推进、提交、归档或写 Matrix 状态。

---

**关键区别**：Matt Pocock 的 skills 是独立工具。Matrix 增加了：
- **状态持久化**：可承受上下文丢失
- **阶段强制**：不能跳过设计直接进入构建
- **证据要求**：守卫检查产物，而非断言
- **转换日志**：完整的阶段变更审计记录

---

## 许可证

[MIT](./LICENSE)
