---
name: matrix-handoff
description: 将已批准的 Matrix Contract 导出为受边界约束的通用 agent 任务包（Claude Code、opencode 或其他 agent），不改变 Matrix 工作流状态。
---

# Matrix Handoff（Implementation Handoff）

这是可选旁路，不是 Matrix phase。它不得执行 `transition`、`archive`，也不得写入 `matrix.yaml` 或 `events.jsonl`。它只支持匹配的 full 或 legacy-full 三产物 Contract；新的 lightweight hotfix/tweak 不支持导出。

人类可读 handoff 内容使用 inspect 的 `artifact_language`；稳定的机器可读标题和 metadata key 保持不变。

## 何时使用

满足以下条件时使用 `$matrix-handoff`：

- 变更已进入 Build，且 `design -> build` 已批准精确 Contract；
- 你希望由另一个 agent 实现冻结的设计——例如 Codex 设计、Claude Code 实现，或 zcode 设计、opencode 实现；
- 你需要一份带全部实现细节的有界任务包。

## 前置条件

导出器写任何内容前先做只读检查：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard build
```

若结果为 `CONTRACT_CHANGED`、`CONTRACT_UNAPPROVED` 或 `CONTRACT_READ_FAILED`，回到 `$matrix-design`，修订后重新进入 Build 取得新批准。导出只读取批准快照中的 `proposal.md`、`design.md` 与 `plan.md`。

## 导出

实现 agent 由用户显式选择，通过 `--agent <agent-id>`（kebab-case）传入；可用 `--from <agent-id>` 标注设计方 agent。

```powershell
# 通用 agent 交接：写入 artifacts/handoff-task-<ID>.md
node <matrix-skill-directory>/scripts/matrix-runtime.mjs export --task-id <ID> --agent opencode
node <matrix-skill-directory>/scripts/matrix-runtime.mjs export --task-id <ID> --agent claude-code --from codex

# 兼容形态（Claude Code）：写入 artifacts/claude-task.md
node <matrix-skill-directory>/scripts/matrix-runtime.mjs export --task-id <ID> --target generic

# FnSec：仅在 active.md 含有 NO_ACTIVE_OBJECTIVE 时更新看板
node <matrix-skill-directory>/scripts/matrix-runtime.mjs export --task-id <ID> --target fnsec --apply-fnsec-board
```

`--agent` 与 `--target` 互斥。新交接推荐 `--agent`；`--target generic` 仅为兼容保留。

## 任务包内容

导出包（`artifacts/handoff-task-<task-id>.md`）的元数据记录 `Implementation actor`（`--agent` 值）与 `Decision owner`（`--from` 值，缺省为 "Matrix change owner"），并包含批准的 Contract hash 与 revision，以及同一冻结快照的 proposal、design、plan。Objective、Allowed/Prohibited work 与 Stop conditions 原样携带——它们与具体 agent 无关。

## 实现 agent 完成后

继续 `$matrix-verify` 前先核对以下证据：

- [ ] `artifacts/verification.md` 存在且含 `## Build evidence`
- [ ] Build evidence 含具体命令与结果
- [ ] plan 的 Validation 命令全部执行
- [ ] `NEEDS_DECISION` 项已解决或已记录

证据缺失时，让实现 agent 补齐后再继续。

## 恢复 Matrix 工作流

实现 agent 完成且证据齐备后：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard build
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition verify
```

guard 失败则退回实现 agent 补齐缺失证据；通过后进入 `$matrix-verify` 继续验证流程。

## 重要约束

- 本旁路不改变 Matrix 阶段、workflow 或 guard 结果
- Matrix 状态停留在 `build`；导出本身不推进阶段
- 实现 agent 产出的证据必须满足 build guard 条件
- 成功 transition 到 verify 后，走正常验证流程
