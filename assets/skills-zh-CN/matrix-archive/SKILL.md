---
name: matrix-archive
description: 关闭并归档已经验证的 Matrix 变更。
---

# Matrix Archive

这是 Matrix 最终阶段。读取 proposal、plan 与验证证据，汇总行为变化、验证结果、残留风险和后续工作；提交归档前必须取得用户明确确认。

归档摘要和 handoff 正文使用 `artifact_language`；Runtime 所需英文标题 token 保持不变。

Prim 与 Arch 的 Archive 均完全由 Matrix 拥有；本阶段不调用 companion 实现、审查或架构能力。

## 强制两步归档

先运行只读预演并复核影响摘要，再原样提交该次预演返回的 hash：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs archive --dry-run
node <matrix-skill-directory>/scripts/matrix-runtime.mjs archive --expect-preflight <dry-run-返回的-sha256>
```

裸 Archive 会被拒绝。Runtime 会重新取得项目 Archive 互斥权，并在提交前重算整个受保护 change 目录 manifest。
hotfix/tweak 在复核 preflight 后必须再次取得用户明确确认，并执行 Runtime 返回的带 `--confirmed` 命令；缺少确认会被拒绝。

- `ARCHIVE_PREFLIGHT_CHANGED`：重新 dry-run 并复核新摘要。
- `ARCHIVE_BUSY`：稍后重试；不得移除或接管锁，陈旧锁恢复属于后续 doctor/repair change。
- Guard 或 Contract 失败：使用 Runtime 返回的恢复命令，不得提交。

若最终确认前发现验收或设计需要调整，使用唯一 Archive 回退路径：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs return design --reason acceptance-or-design-gap
```

提交成功后，变更位于 `.matrix/archive/`，工作流完成。
