---
name: matrix-build
description: 用测试优先的纵向切片实现冻结的 Matrix 计划。仅在活动 Matrix 阶段为 build 时使用。
---

# Matrix Build

读取 `node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect` 与已批准 Contract。full/legacy-full 读取 proposal/design/plan；lightweight 只读取紧凑 proposal，不补写 Design 产物。

Build 证据与面向用户的说明使用 `artifact_language`；Runtime 所需英文标题 token 保持不变。

## 编排

- **Prim**：使用 Matrix 自身实现与测试能力。
- **Arch**：可测试行为变化时调用 `tdd`；真实失败且根因未知时调用 `diagnosing-bugs`；批准 Contract 修改 agent-facing 指令时调用 `writing-for-agents`；只有 Contract 需要人工执行 shell 步骤时，才用 `wizard` 生成并静态验证脚本，绝不端到端执行或收集秘密。

进行中的 merge/rebase 冲突由 Matrix 自身治理，不调用会 stage、continue 或 commit 的 raw `resolving-merge-conflicts`。活动 Change 内不得调用 `implement`。

调用前说明能力与原因。companion 不得 commit、review、transition、archive 或扩大范围。正确安装的能力失败时最多执行一次同能力 Matrix fallback，并记录调用、失败、fallback 与证据；安装完整性问题必须停止并修复。

## 范围纪律

若实现暴露范围或设计变化，停止并执行：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs return design --reason design-gap
```

回到 Design 会清除既有 Contract 批准并轮换当前验证证据；重新进入 Build 必须生成新的批准与新证据。

## 流程

1. 对可测试的行为变化使用 `tdd` 纵向切片；纯文档或不可观察的机械变更使用相称的静态检查。
2. 在 `## Build evidence` 记录共同事实；hotfix 另写 `## Reproduction evidence`、`## Root cause`，tweak 另写 `## Scope evidence`。
3. 运行 Build guard；它同时确认批准的 Contract 仍精确匹配。
4. 通过后推进至 Verify，并进入 `$matrix-verify`。

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard build
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition verify
```
