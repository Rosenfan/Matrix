---
name: matrix-claude
description: 将已批准的 Matrix Contract 导出为受边界约束的 Claude Code 任务包，不改变 Matrix 工作流状态。
---

# Matrix Claude Handoff

这是可选旁路，不是 Matrix phase。它不得执行 `transition`、`archive`，也不得写入 `matrix.yaml` 或 `events.jsonl`。

仅当变更已进入 Build、`design -> build` 已批准精确 Contract，并且用户明确选择 Claude Code 实现时使用。先检查：

```powershell
matrix workflow guard build
```

若结果为 `CONTRACT_CHANGED`、`CONTRACT_UNAPPROVED` 或 `CONTRACT_READ_FAILED`，回到 `$matrix-design`，修订后重新进入 Build 取得新批准。导出只读取批准快照中的 `proposal.md`、`design.md` 与 `plan.md`。

```powershell
# 通用项目：只导出 Matrix 产物
matrix workflow export --task-id <ID> --target generic

# FnSec：仅在 active.md 含有 NO_ACTIVE_OBJECTIVE 时更新看板
matrix workflow export --task-id <ID> --target fnsec --apply-fnsec-board
```

任务包包含批准的 Contract hash 与 revision，以及同一快照的 proposal、design、plan。导出本身不改变 Build 阶段；Claude 完成后，补齐 `## Build evidence`，然后继续：

```powershell
matrix workflow guard build
matrix workflow transition verify
```
