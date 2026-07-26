---
name: matrix-claude
description: 将冻结的 Matrix 设计导出为受边界约束的 Claude Code 任务包，不改变 Matrix 工作流状态。
---

# Matrix Claude Handoff

这是可选的旁路操作，而不是 Matrix phase。它不得执行 `transition`、`archive`，也不得写入 `matrix.yaml`、`run-state.json` 或 `events.jsonl`。

仅当设计阶段守卫已通过，并且用户明确选择由 Claude Code 实现时使用。先检查：

```powershell
matrix workflow guard design
```

如果主命令确实不在 PATH 中，才使用已安装根 Matrix Skill 中的 bundled runtime；主命令已启动但返回业务错误时不得回退。

导出通用任务包：

```powershell
matrix workflow export --task-id <ID> --target generic
```

导出 FnSec 任务包时，只有在 `docs/tasks/active.md` 包含 `NO_ACTIVE_OBJECTIVE` 时才可使用 `--apply-fnsec-board`；现有任务绝不覆盖：

```powershell
matrix workflow export --task-id <ID> --target fnsec --apply-fnsec-board
```

任务包会包含冻结的 proposal、design、plan，以及 Claude Code 回执所需的改动、验证、边界确认和 `NEEDS_DECISION` 项目。
