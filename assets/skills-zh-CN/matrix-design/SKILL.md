---
name: matrix-design
description: 在实现前设计并冻结活动 Matrix 变更。
---

# Matrix Design

Design 只用于 full 和可恢复的旧 shortcut change。新的 lightweight hotfix/tweak 从 Open 直接进入 Build，不得为满足 full guard 补写 Design 产物。

design 和 plan 正文使用 `node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect` 的 `artifact_language`；Runtime 所需英文标题 token 保持不变。

读取 `node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect`、proposal 与冻结 `orchestration`，写入 `design.md`（`## Decisions`、`## Boundaries`、`## Test seams`、`## Risks`）与 `plan.md`（`## Steps`、`## Validation`、`## Stop conditions`）。

- **Prim**：使用 Matrix 自身能力调查并设计。
- **Arch**：仅按事实触发 `domain-modeling`、`research`、`prototype`、`codebase-design`；当 Contract 修改 Skill、`AGENTS.md`、`CLAUDE.md` 或 agent 指针可达文档时触发 `writing-for-agents`。不得机械执行固定序列；每次调用前说明能力与原因。

长期有效的领域、ADR 或研究产物遵循仓库约定，关键结论必须同步进入 Matrix design/plan。prototype 默认写入系统临时目录。companion 不得拥有 Matrix 状态或创建竞争计划。重大范围或架构决策须先由用户确认。

`wayfinder` 与 `improve-codebase-architecture` 只能作为活动 Design 外的显式 handoff；说明原因后由用户调用，选中的结果可另行进入受治理 Change。

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard design
```

## 执行主体确认点（Build 前）

`guard design` 通过后、`transition build` 之前，必须暂停并向用户确认执行主体，未确认不得推进：

- **选项 A：当前 agent / 原模型继续（默认）**——直接推进：
  ```powershell
  node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition build
  ```
  随后进入 `$matrix-build` 在本会话内实现。
- **选项 B：切换模型、保留本 agent**——用户在自己的客户端完成模型切换（例如设计用强模型、实现用高性价比模型），回到会话确认后按选项 A 推进。Matrix 无法感知客户端模型，只提供强制暂停点。
- **选项 C：切换执行 agent**——先推进进 Build 批准冻结 Contract，再用 `$matrix-handoff` 为目标 agent 导出有界任务包（例如 Codex 设计、Claude Code 实现，或 zcode 设计、opencode 实现）。实现 agent 完成并补齐 `## Build evidence` 后：
  ```powershell
  node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard build
  node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition verify
  ```

所选选项必须写入 `design.md` 的 `## Decisions`，随 Contract 冻结。
