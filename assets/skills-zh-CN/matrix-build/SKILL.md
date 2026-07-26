---
name: matrix-build
description: 用测试优先的纵向切片实现冻结的 Matrix 计划。
---

# Matrix Build

只实现冻结计划中的范围。使用 `implement` 与预先确认的 `tdd` 测试边界；持续记录 `artifacts/verification.md` 的 `## Build evidence`。如发现范围或设计变化，返回设计阶段。

```powershell
matrix workflow guard build
matrix workflow transition verify
```
