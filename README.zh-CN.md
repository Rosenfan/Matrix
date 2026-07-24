# Matrix Workflow

一个基于 [Matt Pocock 的 Claude Code skills](https://github.com/mattpocock/skills) 的结构化工作流编排器，灵感来自 [Comet](https://github.com/anthropics/comet)。它通过强制执行基于证据的阶段转换，规范使用这些 skills 时的开发流程。

**[English](./README.md)** | 中文

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

[Matt Pocock 的 skills](https://github.com/mattpocock/skills) 是优秀的独立工具 —— `/grill-with-docs` 用于需求澄清，`/tdd` 用于测试驱动开发，`/implement` 用于执行实现。但单独使用它们会导致常见问题：

- **无流程记忆**：你进行了 grilling，然后实现，但没有记录决策过程
- **阶段混乱**：设计完成了吗？我们在构建阶段吗？上下文丢失后很难判断
- **静默范围蔓延**：需求在构建过程中变更，却没有返回设计阶段
- **缺少证据**："看起来完成了"却没有验证证明

Matrix 通过将这些 skills 封装到确定性状态机中来解决这些问题 —— 包含明确的阶段、守卫条件和产物追踪。灵感来自 [Comet](https://github.com/anthropics/comet) 的阶段式方法。

---

## 它做了什么

Matrix 将 Matt Pocock 的 skills 编排成结构化工作流：

```
open → design → build → verify → archive
(开放)  (设计)   (构建)   (验证)   (归档)
  ↓       ↓        ↓        ↓        ↓
grill   plan    implement  tdd    commit
        design            review
```

每个阶段：
- 有特定的交付物（产物）
- 有必须通过的守卫条件
- 记录所有转换
- 可承受上下文丢失（状态存储在磁盘上）

---

## 前置条件

- 已安装 [Claude Code](https://docs.anthropic.com/claude-code)
- 已在项目中安装 [Matt Pocock 的 skills](https://github.com/mattpocock/skills)
- Python 3.8+ 已添加到 PATH

---

## 安装

### 1. 先安装 Matt Pocock 的 Skills

```bash
npx skills@latest add mattpocock/skills
```

### 2. 安装 Matrix Workflow

将 matrix skills 复制到项目的 `.claude/skills/` 目录：

```bash
# 克隆本仓库
git clone https://github.com/yourusername/matrix-workflow.git /tmp/matrix-workflow

# 复制 matrix skills 到你的项目
cp -r /tmp/matrix-workflow/.claude/skills/matrix* /path/to/your/project/.claude/skills/
```

这将安装：
- `matrix/` — 入口点和状态管理
- `matrix-open/` — 开放阶段（使用 `/grill-with-docs`）
- `matrix-design/` — 设计阶段（使用 `/prototype`、`/research`）
- `matrix-build/` — 构建阶段（使用 `/implement`、`/tdd`）
- `matrix-verify/` — 验证阶段（使用 `/code-review`）
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
1. 用工作流类型 `full` 初始化一个变更
2. 进入 `open` 阶段 → 调用 `/grill-with-docs` 澄清需求
3. 创建 `proposal.md`，包含目标、范围、验收标准、风险
4. 守卫检查：所有章节是否内容充实？
5. 如果通过 → 转换到 `design`

---

## 工作流阶段

| 阶段 | 使用的 Matt Pocock Skill | 交付物 | 守卫条件 |
|------|--------------------------|--------|----------|
| **open** | `/grill-with-docs`、`/grill-me` | `proposal.md` | 目标、范围、验收标准、风险存在 |
| **design** | `/prototype`、`/research`、`/domain-modeling` | `design.md`、`plan.md` | 决策、测试点、步骤已记录 |
| **build** | `/implement`、`/tdd`、`/diagnosing-bugs` | 代码、`verification.md` | 计划存在，构建证据已记录 |
| **verify** | `/code-review`、`/improve-codebase-architecture` | 测试和审查证据 | 测试和审查证据存在 |
| **archive** | — | Git commit | 验证守卫通过 |

---

## 工作原理

状态存储在 `.codex/matrix/` 目录：

```
.codex/matrix/
├── active.json              # 当前变更 ID
├── config.yaml
├── changes/
│   └── <change-id>/
│       ├── matrix.yaml      # 阶段、工作流、时间戳
│       ├── run-state.json
│       ├── events.jsonl
│       └── artifacts/
│           ├── proposal.md
│           ├── design.md
│           ├── plan.md
│           └── verification.md
└── archive/
```

状态机强制执行转换：

```bash
# 检查守卫
python .claude/skills/matrix/scripts/matrix_state.py guard open

# 推进（仅在守卫通过时）
python .claude/skills/matrix/scripts/matrix_state.py transition design
```

---

## 工作流类型

| 类型 | 使用场景 | 阶段 |
|------|----------|------|
| **full** | 新功能、架构变更 | 全部 5 个阶段 |
| **hotfix** | 可复现的小型 Bug | 简化：open → build → verify → archive |
| **tweak** | 有界变更，无 API/架构影响 | 简化：open → build → verify → archive |

---

## 与 Matt Pocock Skills 的集成

Matrix 设计为**在 Matt Pocock 的 skills 之上工作**，而非替代它们。以下是映射关系：

| Matrix 阶段 | Matt Pocock Skill | Matrix 如何使用 |
|-------------|-------------------|-----------------|
| `open` | `/grill-with-docs` | 将需求澄清为 `proposal.md` |
| `design` | `/prototype` | 用可运行的实验验证设计问题 |
| `design` | `/research` | 调查外部 API 和规范 |
| `build` | `/implement` | 执行实现任务 |
| `build` | `/tdd` | 在确认的接缝处进行红绿重构循环 |
| `build` | `/diagnosing-bugs` | 系统性调试失败 |
| `verify` | `/code-review` | 基于基线审查代码 |
| `verify` | `/improve-codebase-architecture` | 可选：发现浅模块机会 |

**关键区别**：Matt Pocock 的 skills 是独立工具。Matrix 增加了：
- **状态持久化**：可承受上下文丢失
- **阶段强制**：不能跳过设计直接进入构建
- **证据要求**：守卫检查产物，而非断言
- **转换日志**：完整的阶段变更审计记录

---

## 许可证

[MIT](./LICENSE)
