---
name: matrix-design
description: 在实现前设计并冻结活动 Matrix 变更。
---

# Matrix Design

Design 只用于 full 和可恢复的旧 shortcut change。新的 lightweight hotfix/tweak 从 Open 直接进入 Build，不得为满足 full guard 补写 Design 产物。

design 和 plan 正文使用 `matrix workflow inspect` 的 `artifact_language`；Runtime 所需英文标题 token 保持不变。

读取 `matrix workflow inspect`、proposal 与冻结 `orchestration`，写入 `design.md`（`## Decisions`、`## Boundaries`、`## Test seams`、`## Risks`）与 `plan.md`（`## Steps`、`## Validation`、`## Stop conditions`）。

- **Prim**：使用 Matrix 自身能力调查并设计。
- **Arch**：仅按事实触发 `domain-modeling`、`research`、`wayfinder`、`prototype`、`codebase-design`，不得机械执行固定序列。每次调用前说明能力与原因。

长期有效的领域、ADR 或研究产物遵循仓库约定，关键结论必须同步进入 Matrix design/plan。prototype 默认写入系统临时目录。companion 不得拥有 Matrix 状态或创建竞争计划。重大范围或架构决策须先由用户确认。

```powershell
matrix workflow guard design
matrix workflow transition build
```
