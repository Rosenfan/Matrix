---
name: matrix-open
description: 将开发请求澄清为有证据的 Matrix 提案。
---

# Matrix Open

读取 `matrix workflow inspect` 的活动变更。使用 `grill-with-docs` 澄清完整工作流请求；写入 `artifacts/proposal.md`，必须包含 `## Goal`、`## Scope`、`## Non-goals`、`## Acceptance`、`## Risks`。

```powershell
matrix workflow guard open
matrix workflow transition design
```
