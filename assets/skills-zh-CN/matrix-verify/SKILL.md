---
name: matrix-verify
description: 依据计划验证 Matrix 变更并审查差异。
---

# Matrix Verify

运行计划的验证命令，在 `verification.md` 写入 `## Test evidence`。使用 `code-review` 完成标准与规格双轴审查，并在 `## Review evidence` 记录结论。失败时回到产生问题的阶段。

```powershell
matrix workflow guard verify
matrix workflow transition archive
```
