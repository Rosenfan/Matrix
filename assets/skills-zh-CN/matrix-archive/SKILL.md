---
name: matrix-archive
description: 关闭并归档已经验证的 Matrix 变更。
---

# Matrix Archive

这是 Matrix 最终阶段。读取 proposal、plan 与验证证据，汇总行为变化、验证结果、残留风险和后续工作；提交归档前必须取得用户明确确认。

Prim 与 Arch 的 Archive 均完全由 Matrix 拥有；本阶段不调用 companion 实现、审查或架构能力。

## 强制两步归档

先运行只读预演并复核影响摘要，再原样提交该次预演返回的 hash：

```powershell
matrix workflow archive --dry-run
matrix workflow archive --expect-preflight <dry-run-返回的-sha256>
```

裸 Archive 会被拒绝。Runtime 会重新取得项目 Archive 互斥权，并在提交前重算整个受保护 change 目录 manifest。

- `ARCHIVE_PREFLIGHT_CHANGED`：重新 dry-run 并复核新摘要。
- `ARCHIVE_BUSY`：稍后重试；不得移除或接管锁，陈旧锁恢复属于后续 doctor/repair change。
- Guard 或 Contract 失败：使用 Runtime 返回的恢复命令，不得提交。

若最终确认前发现验收或设计需要调整，使用唯一 Archive 回退路径：

```powershell
matrix workflow return design --reason acceptance-or-design-gap
```

提交成功后，变更位于 `.matrix/archive/`，工作流完成。
