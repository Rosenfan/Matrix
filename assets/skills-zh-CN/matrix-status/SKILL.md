---
name: matrix-status
description: 检查活动 Matrix 工作流的磁盘状态、守卫与恢复命令。
---

# Matrix Status

执行：

```powershell
matrix workflow inspect
matrix workflow doctor
```

报告变更 ID、工作流、冻结 `orchestration`、阶段、守卫结果、`next_skill`、Workflow health、未完成 transaction、可用策略和精确恢复命令。Arch 完整性失败时列出平台/Skill 事实并报告 `matrix init --with-mattpocock`，不得把 change 解释为 Prim。两条命令都只读；不得推断恢复策略、运行 `--repair` 或修改状态。
