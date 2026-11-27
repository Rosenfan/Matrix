---
name: matrix-design
description: 在实现前设计并冻结活动 Matrix 变更。
---

# Matrix Design

Design 只用于 full 和可恢复的旧 shortcut change。新的 lightweight hotfix/tweak 从 Open 直接进入 Build，不得为满足 full guard 补写 Design 产物。

design 和 plan 正文使用 `node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect` 的 `artifact_language`；Runtime 所需英文标题 token 保持不变。

读取 `node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect`、proposal 与冻结 `orchestration`，写入 `design.md`（`## Decisions`、`## Boundaries`、`## Test seams`、`## Risks`）与 `plan.md`（`## Steps`、`## Validation`、`## Stop conditions`）。在 `plan.md` 中写明精确目标文件路径、关键接缝不变量与聚焦验证命令，使 Build 无需重扫全仓。

- **Prim**：使用 Matrix 自身能力调查并设计。
- **Arch**：仅按事实触发 `domain-modeling`、`research`、`prototype`、`codebase-design`；当 Contract 修改 Skill、`AGENTS.md`、`CLAUDE.md` 或 agent 指针可达文档时触发 `writing-for-agents`。不得机械执行固定序列；每次调用前说明能力与原因。

长期有效的领域、ADR 或研究产物遵循仓库约定，关键结论必须同步进入 Matrix design/plan。prototype 默认写入系统临时目录。companion 不得拥有 Matrix 状态或创建竞争计划。重大范围或架构决策须先由用户确认。

`wayfinder` 与 `improve-codebase-architecture` 只能作为活动 Design 外的显式 handoff；说明原因后由用户调用，选中的结果可另行进入受治理 Change。

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard design
```

## 执行主体确认点（Build 前）

`guard design` 通过后、`transition build` 之前，必须暂停并向用户确认执行主体，未确认不得推进。该闸门由 Runtime 强制执行：`transition build` 未携带所记录的选择时报 `EXECUTOR_CONFIRMATION_REQUIRED`，选择会以 `implementation_actor` 写入 change 状态：

- **选项 A：当前 agent / 原模型继续（默认）**——直接推进：
  ```powershell
  node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition build --executor current
  ```
  随后进入 `$matrix-build` 在本会话内实现。
- **选项 B：派生轻量模型子代理施工**——若宿主支持指定高性价比模型（如 `flash`、`haiku`、`sonnet`）拉起写权限子代理，以 `--executor subagent` 批准推进 Build，将有界切片编码、单测与 `artifacts/verification.md` 的 `## Build evidence` 编写委派给直接读取 `design.md` + `plan.md` 的子代理；主代理保留 `guard build`、`transition verify` 与 `$matrix-verify` 控制权。
- **选项 C：切换模型、保留本 agent**——用户在自己的客户端完成模型切换（例如设计用强模型、实现用高性价比模型），回到会话确认后以 `--executor model` 推进。Matrix 无法感知客户端模型，只提供强制暂停点。
- **选项 D：切换同一工作区的执行 agent**——先以 `--executor handoff:<agent-id>` 记录所选 agent 并推进 Build 批准冻结 Contract；目标 agent 在同一工作区运行 `$matrix`，直接按 `design.md` 与 `plan.md` 锁定的坐标实现并补齐 `## Build evidence`（无需单独导出任务文件），完成后回到验证：
  ```powershell
  node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard build
  node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition verify
  ```

所选选项必须写入 `design.md` 的 `## Decisions`，随 Contract 冻结。
