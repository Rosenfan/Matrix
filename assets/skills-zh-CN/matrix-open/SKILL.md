---
name: matrix-open
description: 将开发请求澄清为有证据的 Matrix 提案。
---

# Matrix Open

读取 `matrix workflow inspect` 的活动变更与冻结 `orchestration`；写入 `artifacts/proposal.md`，必须包含 `## Goal`、`## Scope`、`## Non-goals`、`## Acceptance`、`## Risks`。

- **Prim**：使用 Matrix 自身能力澄清并编写提案。
- **Arch**：仅在存在重大歧义或用户要求压力测试时调用 `grilling`；仅在领域词汇、不变量或架构决定不清晰时调用 `domain-modeling`。调用前说明能力与原因。

companion 输出只能作为当前 proposal 的证据，不得创建第二套工作流、提案、确认状态或阶段转换。正确安装的能力失败时最多执行一次同能力 Matrix fallback；安装完整性问题必须修复。

```powershell
matrix workflow guard open
matrix workflow transition design
```
