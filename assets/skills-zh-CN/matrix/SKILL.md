---
name: matrix
description: 启动、恢复并治理持久化的 Matrix 开发工作流。
---

# Matrix

以当前仓库的 `.matrix/` 为唯一状态来源；不得从聊天记录推断阶段。

先执行：

```powershell
matrix workflow inspect
```

只有系统明确报告 `matrix` 命令不存在时，才使用当前 Matrix Skill 目录中的 bundled runtime：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect
```

有活动变更时，报告其 phase、冻结的 `orchestration` 以及 Arch 安装完整性，再按 Runtime 结果进入 `next_skill`。没有活动变更时，为开发请求创建简短 kebab-case ID：

```powershell
matrix workflow init <change-id> --workflow <full|hotfix|tweak> --orchestration <prim|arch> --title "<title>"
```

显式模式优先，否则使用项目 `default_orchestration`。解析后的模式在整个 change 生命周期中不可切换。

## 编排模式

- **Prim**：各阶段使用 Matrix 自身能力，不依赖 Matt Skills。
- **Arch**：仅在任务事实满足触发条件时，调用初始化阶段已验证的十项原子能力。

两种模式共用同一套 Matrix phase graph、产物、守卫、Return/Abort、Contract、事务与归档协议。Arch 能力不得写 Matrix 状态、推进阶段、提交、归档或创建竞争工作流。调用前说明能力与触发原因，无需重复请求 Skill 权限。

正确安装的 Arch 能力执行失败时，最多允许一次同能力的 Matrix fallback，并记录失败与证据。缺失、修改或不完整的 Arch 安装必须通过 `matrix init --with-mattpocock` 修复，不得切换活动 change 到 Prim。

## 恢复

只能通过 Runtime 恢复，不得手工修改状态：

```powershell
matrix workflow return design --reason design-gap
matrix workflow return build --reason verification-failed
matrix workflow return design --reason acceptance-or-design-gap
matrix workflow abort --reason <requirement-cancelled|superseded|no-longer-valuable|blocked|other>
```

Return 会把当前 `verification.md` 轮换至按 revision 编号的证据历史。Archive 等待确认期间若验收或设计改变，只能使用 `archive -> design` 的 `acceptance-or-design-gap` Return。Abort 将终态变更移入 `.matrix/archive/`，但不会撤销工作区代码。

任何 mutation 返回 `WORKFLOW_RECOVERY_REQUIRED` 时，停止正常阶段操作并先执行只读诊断：

```powershell
matrix workflow doctor
```

不得推断恢复目标或策略，只能执行 doctor 返回的精确命令：

```powershell
matrix workflow doctor --repair --transaction <id> --strategy <continue|rollback>
matrix workflow doctor --repair --lock <id>
```

## 精确 Contract

`design -> build` 会批准 `proposal.md`、`design.md`、`plan.md` 的精确字节 SHA-256 身份。任何后续字节变动都会阻断 Build、Verify、Archive 和 Claude 导出；必须受控 Return 至 Design 后重新批准。旧 schema 会被拒绝且不发生写入。

## 可选 Claude 交接

`$matrix-claude` 只在已批准的 Build 中使用，导出同一 Contract 快照给 Claude Code。它不拥有阶段推进或验收；直接由 Codex 实现仍使用原有 Matrix 主流程。
只有用户明确选择“Codex 设计、Claude Code 实现”时才使用，不得自动插入标准流程。

## 规则

- 阶段只能经 `matrix workflow transition` 正向推进。
- 只能经上述明确的 `matrix workflow return` 反向推进。
- 成功 Archive 必须使用两步乐观提交：先运行 `matrix workflow archive --dry-run`，再将其精确 hash 传给 `matrix workflow archive --expect-preflight <sha256>`；不得绕过预演。
- `matrix workflow doctor` 始终只读；transaction 与陈旧锁 repair 必须显式绑定 doctor 报告的 identity，不得手工编辑或删除 `.matrix/transactions/`、`.matrix/workflow.lock`。
- 重大架构/范围决定和 archive/commit 前应暂停等待用户确认。
