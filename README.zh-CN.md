# Matrix Workflow

一个用于 Claude Code 的结构化开发工作流，通过提案、设计、构建、验证和归档阶段，强制执行基于证据的阶段转换。

**[English](./README.md)** | 中文

---

## 目录

- [什么是 Matrix](#什么是-matrix)
- [安装](#安装)
  - [前置条件](#前置条件)
  - [安装 Skills](#安装-skills)
- [使用方法](#使用方法)
  - [开始新的变更](#开始新的变更)
  - [阶段工作流](#阶段工作流)
  - [查看状态](#查看状态)
  - [恢复中断的工作](#恢复中断的工作)
- [工作原理](#工作原理)
- [工作流类型](#工作流类型)
- [可选：Claude Code 交接](#可选claude-code-交接)
- [配套 Skills](#配套-skills)
- [设计理念](#设计理念)
- [许可证](#许可证)

---

## 什么是 Matrix

Matrix 是一套 Claude Code skill 集合，将软件开发管理为确定性状态机。每个变更经历五个阶段，每个阶段都有明确的守卫条件，必须通过才能推进：

```
open → design → build → verify → archive
(开放)  (设计)   (构建)   (验证)   (归档)
```

不能跳过任何阶段。没有证据就不能推进。这防止了"看起来完成了"的情况，强制要求严格的完成跟踪。

---

## 安装

### 前置条件

- 已安装并配置 [Claude Code](https://docs.anthropic.com/claude-code)
- Python 3.8+ 已添加到 PATH

### 安装 Skills

将 `.claude/skills/matrix*` 目录复制到你项目的 `.claude/skills/` 目录：

```bash
# 在项目根目录下执行
cp -r /path/to/matrix-workflow/.claude/skills/matrix* .claude/skills/
```

这将安装以下 skills：

| Skill | 说明 |
|-------|------|
| `matrix/` | 主入口和状态管理脚本 |
| `matrix-open/` | 开放阶段：将需求澄清为提案 |
| `matrix-design/` | 设计阶段：冻结架构和计划 |
| `matrix-build/` | 构建阶段：以测试优先的方式实现 |
| `matrix-verify/` | 验证阶段：运行测试和代码审查 |
| `matrix-archive/` | 归档阶段：关闭并归档变更 |
| `matrix-hotfix/` | 快捷方式：小型 Bug 修复 |
| `matrix-tweak/` | 快捷方式：有界的小变更 |
| `matrix-status/` | 检查当前工作流状态 |
| `matrix-claude/` | 可选：导出设计供 Claude Code 实现 |

---

## 使用方法

### 开始新的变更

在 Claude Code 中调用 matrix skill：

```
$matrix
```

或者描述你的需求，让 Claude 自动路由：

```
我想给 API 添加用户认证功能
```

Matrix 将会：
1. 对你的请求进行分类（完整工作流、热修复或小调整）
2. 用唯一 ID 初始化一个变更
3. 进入 `open` 阶段来澄清需求

### 阶段工作流

每个阶段有特定的交付物和守卫条件：

| 阶段 | 交付物 | 守卫条件 |
|------|--------|----------|
| **open** | `proposal.md`，包含目标、范围、验收标准、风险 | 所有章节存在且内容充实 |
| **design** | `design.md`，包含决策、测试点；`plan.md`，包含步骤 | 文档存在且包含必需章节 |
| **build** | 实现代码、`verification.md`，包含构建证据 | 计划存在，构建证据已记录 |
| **verify** | 测试结果、`verification.md` 中的代码审查 | 测试和审查证据存在 |
| **archive** | 最终摘要、git commit | 验证守卫通过 |

### 查看状态

```
$matrix-status
```

报告当前阶段、守卫结果和下一步操作。

### 恢复中断的工作

如果上下文丢失或你稍后返回项目：

```
$matrix
```

Matrix 会读取状态文件并从当前阶段恢复。

---

## 工作原理

Matrix 在项目的 `.codex/matrix/` 目录下存储状态：

```
.codex/matrix/
├── active.json              # 当前变更 ID
├── config.yaml              # 工作流配置
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
└── archive/                 # 已完成的变更
```

`matrix_state.py` 脚本强制执行阶段转换：

```bash
# 检查当前阶段守卫是否通过
python .claude/skills/matrix/scripts/matrix_state.py guard open

# 推进到下一阶段（仅在守卫通过时）
python .claude/skills/matrix/scripts/matrix_state.py transition design
```

---

## 工作流类型

| 类型 | 使用场景 | 阶段 |
|------|----------|------|
| **full** | 新功能、架构变更 | 全部 5 个阶段 |
| **hotfix** | 可复现的小型 Bug | 简化的 open → build → verify → archive |
| **tweak** | 有界变更，无 API/架构影响 | 简化的 open → build → verify → archive |

---

## 可选：Claude Code 交接

`matrix-claude` skill 将冻结的设计导出为 Claude Code 任务包。当你希望 Codex 设计而 Claude Code 实现时使用：

```
$matrix-claude
```

这会创建一个有界的任务规范，而不改变 Matrix 状态。

---

## 配套 Skills

以下来自 [Matt Pocock 的 skill 集合](https://github.com/mattpocock/claude-code-skills) 的 skills 与 Matrix 配合良好：

| Skill | 说明 |
|-------|------|
| `grilling` | 通过连续提问来压力测试计划 |
| `implement` | 执行实现任务 |
| `tdd` | 测试驱动开发循环 |
| `code-review` | 基于基线进行代码审查 |
| `diagnose` | 系统性调试失败 |
| `prototype` | 构建 UI 原型 |

**这些 skills 不包含在本仓库中。** 请从 [Matt Pocock 的仓库](https://github.com/mattpocock/claude-code-skills) 单独安装。Matrix 在需要时会引用它们，但没有它们也能使用内置替代方案运行。

---

## 设计理念

Matrix 强制执行几项工程纪律原则：

| 原则 | 说明 |
|------|------|
| **证据优于断言** | "完成"意味着守卫条件通过，而不是某人说完成了 |
| **无静默范围蔓延** | 范围变更返回设计阶段 |
| **显式转换** | 每个阶段变更都被记录且确定性的 |
| **冻结计划** | 构建实现的是设计的内容，不多不少 |
| **上下文弹性** | 状态持久化在磁盘上，可承受会话中断 |

---

## 许可证

[MIT](./LICENSE)
