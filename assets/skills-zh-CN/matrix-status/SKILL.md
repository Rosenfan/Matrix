---
name: matrix-status
description: 检查活动 Matrix Run 或 classic 变更的磁盘状态、预算、租约与恢复命令。
---

# Matrix Status

运行与主入口相同的状态内核，然后汇报磁盘上的事实——绝不依据聊天历史。

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect
node <matrix-skill-directory>/scripts/matrix-runtime.mjs doctor
```

按 `default_workflow` 汇报：

- **auto**：持有租约的 Run（`run_id`、phase、status、revision），预算余量（`iteration`/`submit_failures`/`stagnation`/`verifier_attempt` 相对各自上限），待处理的等待，以及确切的 `continuation.next_command`。从 `runs` 列出其余挂起的 Run 并注明租约归属。Run 详情用 `node <matrix-skill-directory>/scripts/matrix-runtime.mjs run inspect <run-id>`。
- **classic**：变更 ID、工作流、`profile`、阶段、守卫结果、`next_skill`，以及 Arch 完整性发现（用 `matrix init --with-mattpocock` 修复；不得把变更解释为 Prim）。
- **两者皆无**（`NO_ACTIVE_CHANGE`）：如实说明，并按报告的 `default_workflow` 给出下一步。

两条命令都只读。不得从会话历史推断状态、运行 `--repair` 或修改状态。守卫或检查失败时，指出缺失的证据并指向入口技能（auto Run 用 `$matrix`，classic 用对应阶段技能）。doctor 报告 `WORKFLOW_RECOVERY_REQUIRED` 或异主机锁时，转述它的精确修复命令与人工核对提示，不要自行发挥。
