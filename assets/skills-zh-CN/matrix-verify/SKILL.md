---
name: matrix-verify
description: 依据计划验证 Matrix 变更并审查差异。
---

# Matrix Verify

运行已批准 Contract 的验证命令，在 `verification.md` 写入 `## Test evidence`。hotfix 另写 `## Regression evidence`；tweak 另写 `## Scope review evidence`。所有模式都必须写入 `## Review evidence`，并在其中保留内容充分的 `### Standards` 与 `### Spec` 两个子节。读取冻结 `orchestration`：

验证正文使用 `artifact_language`；上述 Runtime 所需英文证据标题保持不变。

- **Prim**：Matrix 自行完成 Standards 与 Spec 双轴审查。
- **Arch**：调用 `code-review` 产生双轴证据，并说明调用原因。

审查结果只是 Matrix Verify 的输入；companion 不得决定阶段结果、扩大已批准架构、推进或归档。不得调用事后架构改进 wrapper。正确安装的审查能力失败时最多执行一次同能力 Matrix fallback；安装完整性问题必须停止。

Arch 正常执行 `code-review` 后，使用项目 Runtime 把 fixed point、HEAD/diff、Contract、审查正文和工作区绑定为当前 revision 的回执：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs review --source code-review --fixed-point <ref> --standards <passed|failed> --spec <passed|failed>
```

只有在无 Git 基线、已提交的 HEAD diff 为空、仍存在 staged/unstaged/untracked 候选，或 capability 真实执行失败时，才记录限制并使用一次有界 fallback：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs review --source matrix-fallback --reason <git-baseline-unavailable|empty-head-diff|uncommitted-worktree|capability-execution-failed> [--fixed-point <ref-for-empty-head-diff-or-uncommitted-worktree>] --standards <passed|failed> --spec <passed|failed>
```

不得把 fallback 写成 `code-review` 成功。`empty-head-diff` 必须提供 fixed point，由 Runtime 核实三点 diff 确实为空。`uncommitted-worktree` 也必须提供 fixed point，Runtime 会把 staged、unstaged 与 untracked 候选内容绑定为 `candidate_hash`，之后任意变化都会使回执过期。当前 revision 已有回执或任一审查轴失败时，必须先受控 Return，不能覆盖回执后继续。

失败时使用受控 Return：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs return build --reason verification-failed
node <matrix-skill-directory>/scripts/matrix-runtime.mjs return design --reason acceptance-or-design-gap
```

Return 会轮换旧 `verification.md`；不得把旧结论直接复制为新的当前证据。

Arch 的 Return 也会轮换 `review-receipt.json`；新 revision 必须重新审查并生成新回执。仅有 Markdown 标题、旧回执或与当前工作区不匹配的回执都不能通过 guard。

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard verify
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition archive
```
