---
name: matrix
description: 启动、恢复并治理持久化的 Matrix 开发工作流。
---

# Matrix

以当前仓库的 `.matrix/` 为唯一状态来源；不得从聊天记录推断阶段。

读取 `node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect` 的 `artifact_language`。规范 Markdown 标题 token 必须保持不变；面向用户的产物正文、说明和 handoff 在 `zh-CN` 时写中文，在 `en` 时写英文。

所有 workflow 命令都先执行当前项目 Matrix Skill 自带的 Runtime，使项目兼容性权威优先于不同版本的全局启动器：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect
```

全局 `matrix` 命令只负责 init、update 和 bootstrap。受信任的 0.1.4 启动器只会自动委派给版本与 hash 都精确匹配的 0.1.4 项目 Runtime。项目 Runtime 属于不同版本或无法识别版本时仍是项目权威，但必须执行启动器返回的精确直连命令；旧版启动器不具备这项跨版本检查，不能作为项目 workflow 入口。

有活动变更时，报告其 phase、冻结的 `orchestration` 以及 Arch 安装完整性，再按 Runtime 结果进入 `next_skill`。没有活动变更时，为开发请求创建简短 kebab-case ID：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs init <change-id> --workflow <full|hotfix|tweak> --orchestration <prim|arch> --title "<title>"
```

显式模式优先，否则使用项目 `default_orchestration`。解析后的模式在整个 change 生命周期中不可切换。

## 编排模式

- **Prim**：各阶段使用 Matrix 自身能力，不依赖 Matt Skills。
- **Arch**：仅在任务事实满足触发条件时，调用活动 Change 冻结的十项自动能力。Matrix 0.1.4 审查 Matt Skills v1.2.3 官方 25 项角色，只把其中 23 项兼容 Skill 安装在项目本地；排除 `implement` 与 raw `resolving-merge-conflicts`。

两种编排模式使用已选定的 workflow profile：`full` 走 `open → design → build → verify → archive`；`hotfix` 与 `tweak` 共用内部 `lightweight` profile，走 `open → build → verify → archive`，仅证据策略不同。Arch 能力不得写 Matrix 状态、推进阶段、提交、归档或创建竞争工作流。

正确安装的 Arch 能力执行失败时，最多允许一次同能力的 Matrix fallback，并记录失败与证据。缺失、修改或不完整的 Arch 安装必须通过 `matrix init --with-mattpocock` 修复，不得切换活动 change 到 Prim。

## 恢复

只能通过 Runtime 恢复，不得手工修改状态：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs return design --reason design-gap
node <matrix-skill-directory>/scripts/matrix-runtime.mjs return build --reason verification-failed
node <matrix-skill-directory>/scripts/matrix-runtime.mjs return design --reason acceptance-or-design-gap
node <matrix-skill-directory>/scripts/matrix-runtime.mjs abort --reason <requirement-cancelled|superseded|no-longer-valuable|blocked|other>
```

Return 会把当前 `verification.md` 轮换至按 revision 编号的证据历史。Archive 等待确认期间若验收或设计改变，只能使用 `archive -> design` 的 `acceptance-or-design-gap` Return。Abort 将终态变更移入 `.matrix/archive/`，但不会撤销工作区代码。

任何 mutation 返回 `WORKFLOW_RECOVERY_REQUIRED` 时，停止正常阶段操作并先执行只读诊断：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs doctor
```

不得推断恢复目标或策略，只能执行 doctor 返回的精确命令：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs doctor --repair --transaction <id> --strategy <continue|rollback>
node <matrix-skill-directory>/scripts/matrix-runtime.mjs doctor --repair --lock <id>
```

## 精确 Contract

full 的 `design -> build` 会批准 proposal/design/plan；lightweight 的 `open -> build --confirmed` 只批准紧凑 proposal，并拒绝初始化后、批准前发生的项目实现改动。Contract 后续漂移都会阻断推进。

## 可选 Claude 交接

`$matrix-claude` 只在已批准的 Build 中使用，导出同一 Contract 快照给 Claude Code。它不拥有阶段推进或验收；直接由 Codex 实现仍使用原有 Matrix 主流程。
只有用户明确选择“Codex 设计、Claude Code 实现”时才使用，不得自动插入标准流程。

## 显式 Matt handoff

Matrix 不嵌套 user-invoked Skill。适用时只解释原因，并让用户显式调用：一次性配置使用 `setup-matt-pocock-skills`，工作流外架构扫描使用 `improve-codebase-architecture`，独立大型候选生成使用 `wayfinder`，上下文边界使用 `handoff`，他人掌握阻塞事实时使用 `to-questionnaire`。`ask-matt`、`grill-with-docs`、`triage`、`to-spec`、`to-tickets`、`grill-me`、`teach`、`wait-what` 保持 standalone。Matrix 不安装也不管理 `implement` 或 raw `resolving-merge-conflicts`；已有副本保留为未管理额外项，活动 Change 内不得建议使用。

## 规则

- 阶段只能经 `node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition` 正向推进。
- 只能经上述明确的 `node <matrix-skill-directory>/scripts/matrix-runtime.mjs return` 反向推进。
- 成功 Archive 必须使用两步乐观提交：先运行 `node <matrix-skill-directory>/scripts/matrix-runtime.mjs archive --dry-run`，再将其精确 hash 传给 `node <matrix-skill-directory>/scripts/matrix-runtime.mjs archive --expect-preflight <sha256>`；不得绕过预演。
- `node <matrix-skill-directory>/scripts/matrix-runtime.mjs doctor` 始终只读；transaction 与陈旧锁 repair 必须显式绑定 doctor 报告的 identity，不得手工编辑或删除 `.matrix/transactions/`、`.matrix/workflow.lock`。
- 重大架构/范围决定和 archive/commit 前应暂停等待用户确认。
- shortcut 范围扩大时执行 `node <matrix-skill-directory>/scripts/matrix-runtime.mjs return design --reason design-gap`；Runtime 将其升级为 full。
