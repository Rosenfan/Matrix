---
name: matrix-build
description: 用测试优先的纵向切片实现冻结的 Matrix 计划。仅在活动 Matrix 阶段为 build 时使用。
---

# Matrix Build

读取 `matrix workflow inspect`、`plan.md`、`design.md`、已批准 Contract 与仓库指令，只实现冻结范围。

## 编排

- **Prim**：使用 Matrix 自身实现与测试能力。
- **Arch**：可测试行为变化时调用 `tdd`；真实失败且根因未知时调用 `diagnosing-bugs`；仅在进行中的 merge/rebase 冲突时调用 `resolving-merge-conflicts`。

调用前说明能力与原因。companion 不得 commit、review、transition、archive 或扩大范围。正确安装的能力失败时最多执行一次同能力 Matrix fallback，并记录调用、失败、fallback 与证据；安装完整性问题必须停止并修复。

## 范围纪律

若实现暴露范围或设计变化，停止并执行：

```powershell
matrix workflow return design --reason design-gap
```

回到 Design 会清除既有 Contract 批准并轮换当前验证证据；重新进入 Build 必须生成新的批准与新证据。

## 流程

1. 用 `tdd` 以纵向切片实现。
2. 在 `artifacts/verification.md` 的 `## Build evidence` 记录具体命令和结果。
3. 运行 Build guard；它同时确认批准的 Contract 仍精确匹配。
4. 通过后推进至 Verify，并进入 `$matrix-verify`。

```powershell
matrix workflow guard build
matrix workflow transition verify
```
