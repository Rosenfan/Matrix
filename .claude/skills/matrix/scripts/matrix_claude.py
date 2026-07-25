#!/usr/bin/env python3
"""Export a frozen Matrix design to a Claude Code task package without changing Matrix state."""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from matrix_state import active_path, artifact, get_active, guard, parse_flow, root


def fail(message: str) -> None:
    print(f"MATRIX CLAUDE ERROR: {message}", file=sys.stderr)
    raise SystemExit(2)


def read_artifact(change: str, name: str) -> str:
    path = artifact(change, name)
    if not path.exists():
        fail(f"Required Matrix artifact is missing: {path}")
    return path.read_text(encoding="utf-8").strip()


def task_content(change: str, task_id: str, proposal: str, design: str, plan: str, result_path: str) -> str:
    return f"""# Claude Code 执行任务包：{task_id}

## 元数据

| 字段 | 内容 |
| --- | --- |
| 状态 | CLAUDE_QUEUED |
| Codex 决策人 | Codex |
| Claude Code 执行人 | Claude Code |
| Matrix Change | `{change}` |
| 回执 | `{result_path}` |

## 目标

以下目标来自已冻结的 Matrix proposal，不得扩展：

{proposal}

## 范围

### 允许修改

- 仅修改为完成下列 Matrix 设计与计划所必需的文件。
- 先阅读仓库级指令与现有测试，再开始实施。

### 禁止修改

- 不得修改 Matrix 状态文件或推进 Matrix phase。
- 不得自行改变架构、公开接口、数据模型、依赖或任务范围。
- 不得执行未获授权的网络、部署、破坏性或外部副作用动作。

## 禁止事项

- 不得把设计外的发现直接实现为额外功能。
- 遇到范围扩大、设计冲突或验收不清时必须停止并写 `NEEDS_DECISION`。

## 已冻结的设计决定

{design}

## 执行步骤

{plan}

## 验收

- 执行 `plan.md` 中的全部验证命令。
- 为每项行为变化提供测试或可复现验证证据。
- 完成后保留可供 Codex 固定基线审查的 diff。

## 停止并上报的条件

- 需要修改范围外文件或改变冻结设计。
- 验收失败且不能在既定范围内修复。
- 发现安全、授权或项目指令冲突。

## 回执路径

在 `{result_path}` 创建结构化回执，至少包含：

- `## 元数据`：执行状态与任务 ID。
- `## 改动清单`：实际改动文件和理由。
- `## 测试结果`：命令与输出摘要。
- `## 边界确认`：未越界声明，或 `NEEDS_DECISION`。
- `## 未解决项`：如有。

Codex 才能验收；Claude Code 不得自行宣告任务已接受或完成。
"""


def active_board(task_id: str, task_path: str, result_path: str, change: str) -> str:
    return f"""# 活跃任务看板

> 这里是唯一实时任务面板：只放当前任务的状态、执行主体、范围、完成条件和下一步。

## 当前状态

| 字段 | 内容 |
| --- | --- |
| ID | {task_id} |
| 状态 | CLAUDE_QUEUED |
| 执行主体 | Claude Code（由用户通过 `$matrix-claude` 明确选择） |
| 目标 | 执行 Matrix Change `{change}` 的冻结任务包。 |
| 冻结设计 | `.matrix/changes/{change}/artifacts/{{proposal,design,plan}}.md` |
| 任务包 | `{task_path}` |
| 回执 | `{result_path}` |
| 完成条件 | 任务包验收命令通过、Claude 回执齐全，并经 Codex 审查实际 diff 和证据。 |
| 下一步 | Claude Code 按冻结任务包实施；范围冲突时写 `NEEDS_DECISION`。 |
"""


def export(args: argparse.Namespace) -> None:
    change = get_active()
    flow = parse_flow(root() / "changes" / change / "matrix.yaml")
    if flow.get("phase") != "design":
        fail(f"Matrix change '{change}' is in phase '{flow.get('phase')}', not design.")
    if not guard(change, "design", output=True):
        fail("Design guard failed; no Claude task package was written.")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]*", args.task_id):
        fail("Task id must use letters, digits, and hyphens.")
    proposal, design, plan = (read_artifact(change, n) for n in ("proposal.md", "design.md", "plan.md"))

    if args.target == "generic":
        output = artifact(change, "claude-task.md")
        result = artifact(change, "claude-result.md")
        output.write_text(task_content(change, args.task_id, proposal, design, plan, str(result.relative_to(Path.cwd())).replace("\\", "/")), encoding="utf-8")
        print(output)
        return

    tasks = Path.cwd() / "docs" / "tasks"
    if not tasks.is_dir() or not (tasks / "active.md").is_file():
        fail("FnSec target requires docs/tasks/active.md in the current project.")
    output = tasks / f"claude-task-{args.task_id}.md"
    result = tasks / f"claude-result-{args.task_id}.md"
    if output.exists() or result.exists():
        fail(f"FnSec task or result path already exists for {args.task_id}.")
    output.write_text(task_content(change, args.task_id, proposal, design, plan, str(result.relative_to(Path.cwd())).replace("\\", "/")), encoding="utf-8")
    if args.apply_fnsec_board:
        board = tasks / "active.md"
        current = board.read_text(encoding="utf-8")
        if "NO_ACTIVE_OBJECTIVE" not in current:
            output.unlink()
            fail("FnSec active.md already has an objective; refused to overwrite it.")
        board.write_text(active_board(args.task_id, str(output.relative_to(Path.cwd())).replace("\\", "/"), str(result.relative_to(Path.cwd())).replace("\\", "/"), change), encoding="utf-8")
    print(output)


def main() -> None:
    parser = argparse.ArgumentParser()
    subs = parser.add_subparsers(dest="command", required=True)
    command = subs.add_parser("export")
    command.add_argument("--task-id", required=True)
    command.add_argument("--target", choices=("generic", "fnsec"), default="generic")
    command.add_argument("--apply-fnsec-board", action="store_true")
    command.set_defaults(func=export)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
