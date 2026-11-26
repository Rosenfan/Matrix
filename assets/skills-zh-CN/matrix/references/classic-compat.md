# classic 工作流兼容

`classic` 是 0.2.0 之前的 Matrix 工作流，保持不变：`matrix/change/v2` 状态机、五个阶段、两种编排模式、守卫条件、Return 与 Abort 恢复，以及两步归档。`inspect` 返回 `default_workflow: classic` 时，或用户要求在 `auto` 项目里继续一个 classic 变更时，按本文件执行。各阶段的命令与证据仍以对应阶段的 Skill 为准；命令以 `node <matrix-skill-directory>/scripts/matrix-runtime.mjs <args>` 运行。

## classic 适用的场景

- 0.2.0 之前初始化、且未切换到 `auto` 的项目。
- `config.yaml` 中没有 `default_workflow` 的项目，按 `classic` 解析（先看 `config.yaml`，再看 `installation.json` 的 `workflow`，最后落到 `classic`）。
- 必须在 `Arch`（冻结于 v1.3.1 的 Matt Skills 能力集）下运行的工作。
- 已在 `.matrix/changes/` 中立项的在途变更。

`matrix update` 从不改变工作流。切换之后要回到 classic，执行 `matrix init --default-workflow classic`；要离开 classic，执行 `matrix init --default-workflow auto`。

## 工作流 profile

| 工作流 | 阶段 | 适用 |
|---|---|---|
| `full` | `open → design → build → verify → archive` | 涉及架构、公共 API 或 schema 的功能与变更 |
| `hotfix` | `open → build → verify → archive`（共用 `lightweight` profile） | 可复现的小型 Bug，不涉及架构、API、schema 或多模块协同 |
| `tweak` | `open → build → verify → archive`（共用 `lightweight` profile） | 有界的小改动，不涉及 schema、公共 API、架构或跨模块协同 |

没有活动变更时，为请求分类，并以简短的 kebab-case ID 与准确的标题初始化。除非明确适用快捷方式，否则从 `full` 开始：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs init <change-id> --workflow <full|hotfix|tweak> --orchestration <prim|arch> --title "<title>"
```

显式模式优先，否则使用项目默认值。解析出的模式在该变更内冻结，之后不可切换。有活动变更时，报告其 phase 与冻结的 `orchestration`，并仅在 Runtime 允许继续时进入返回的 `next_skill`。

## Prim 与 Arch

- **Prim**：各阶段都使用 Matrix 自身能力，不依赖 Matt Skills。
- **Arch**：仅在任务事实满足触发条件时，Matrix 才调用该变更冻结的能力集中的十项经过审查的自动能力。Arch 绑定 Matt Skills v1.3.1（commit `24fe0ef`）：Matrix 审查全部 27 项官方角色，只在项目本地安装其中 25 项兼容 Skill，并逐一对照 Matt 安装回执校验。
- `implement` 与 `implement-spec` 不兼容。Matrix 既不安装也不调用它们；已有副本（含遗留的 `resolving-merge-conflicts`）保留为未管理额外项，活动变更内不得建议使用。
- 正确安装的 Arch 能力执行失败时，最多允许一次同能力的 Matrix 自有 fallback，并记录失败与证据。Arch 安装缺失、被修改或不完整时，必须用 `matrix init --with-mattpocock` 修复；绝不为了绕过它而把活动变更切到 Prim。
- Arch 下由 `matrix-verify` 把审查绑定到当前 revision：`review --source code-review --fixed-point <ref> --standards <passed|failed> --spec <passed|failed>`。绝不把 fallback 标成成功的 `code-review`。
- 其余 Matt Skills 永不嵌套调用。`ask-matt`、`grill-with-docs`、`triage`、`to-spec`、`to-tickets`、`grill-me`、`teach`、`wait-what`、`pr` 保持 `standalone`；`setup-matt-pocock-skills`、`improve-codebase-architecture`、`wayfinder`、`handoff`、`retro`、`to-questionnaire` 是显式交接。说明为什么适用，然后由用户自行调用。

## 各 Skill 如何配合

| Skill | 职责 |
|---|---|
| `matrix` | 入口：`inspect`、分类、`init`、路由到活动阶段 |
| `matrix-open` | 把请求澄清为 `proposal.md`；`hotfix` 与 `tweak` 须在修改实现之前产出紧凑 Contract |
| `matrix-design` | 仅 `full`：编写 `design.md` 与 `plan.md`，冻结 Contract |
| `matrix-build` | 按有界的垂直切片实现已批准的 Contract，并记录构建证据 |
| `matrix-verify` | 运行 Contract 的验证命令，产出 Standards 与 Spec 双轴审查证据 |
| `matrix-archive` | 对已验证的变更执行两步归档 |
| `matrix-hotfix`、`matrix-tweak` | `lightweight` profile 的指引；没有独立状态机，经 `matrix` 启动 |
| `matrix-handoff` | 可选 sidecar：把已批准的 Contract 导出为交给其他实现 agent 的任务包；从不改变阶段或状态 |
| `matrix-status` | 只读报告 phase、守卫结果与恢复命令 |

companion Skill 不得写 Matrix 状态、推进阶段、提交、归档或创建竞争的工作流产物。`matrix-handoff` 只服务 classic 变更（`export --task-id <ID> --agent <agent-id>`，在 Build 阶段、Design → Build 转换批准之后使用），且只支持 full 或 legacy-full 的三件套 Contract；它不属于 `auto`。

## 正向推进与执行主体门禁

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard open
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition design
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard design
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition build --executor <current|model|handoff:<agent-id>>
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition build --confirmed --executor <choice>
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard build
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition verify
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard verify
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition archive
```

- 阶段只能经 `transition` 正向推进，且必须先通过对应的 `guard`。
- `--executor` 门禁在 classic 下保持。进入 Build 之前呈现执行主体选择：由当前 agent 继续、在用户客户端切换模型、或移交给另一个 agent。`full` 在 design guard 之后作出选择（`transition build --executor ...`）；`lightweight` 把它并入 `transition build --confirmed` 的暂停。缺少该选择时 Runtime 拒绝进入 Build（`EXECUTOR_CONFIRMATION_REQUIRED`），并把选择存为 `implementation_actor`。
- 归档必须使用两步乐观提交；裸 Archive 会被拒绝：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs archive --dry-run
node <matrix-skill-directory>/scripts/matrix-runtime.mjs archive --expect-preflight <sha256-returned-by-dry-run>
```

`hotfix` 与 `tweak` 在查看预演结果后需获得用户明确确认，再在第二条命令上加 `--confirmed`。

## Return 与 Abort

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs return design --reason design-gap
node <matrix-skill-directory>/scripts/matrix-runtime.mjs return build --reason verification-failed
node <matrix-skill-directory>/scripts/matrix-runtime.mjs return design --reason acceptance-or-design-gap
node <matrix-skill-directory>/scripts/matrix-runtime.mjs abort --reason <requirement-cancelled|superseded|no-longer-valuable|blocked|other>
```

- `design-gap`（从 Build）：实现过程中暴露出范围或设计变更。Runtime 会把 `lightweight` 变更升级为 `full`。绝不悄悄沿用旧 Contract。
- `verification-failed`（从 Verify）：实现有问题，回到 Build。
- `acceptance-or-design-gap`（从 Verify，或在最终提交之前从 Archive）：验收标准或设计必须改变。
- Return 保留变更，并把当前的 `verification.md`（Arch 下连同 `review-receipt.json`）轮换到按 revision 编号的证据历史；被退回到的阶段必须产出新的证据。绝不把旧结论复制回来。
- Abort 保留最后一个阶段，把变更移入 `.matrix/archive/`，绝不撤销工作区改动。

## 恢复

任何 mutation 返回 `WORKFLOW_RECOVERY_REQUIRED` 时，停止阶段操作并执行只读诊断：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs doctor
```

只能执行 doctor 返回的精确修复命令，并绑定它报告的 identity：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs doctor --repair --transaction <id> --strategy <continue|rollback>
node <matrix-skill-directory>/scripts/matrix-runtime.mjs doctor --repair --lock <id>
```

绝不手工编辑或删除 `.matrix/transactions/`、`.matrix/workflow.lock`，也绝不自行推断修复目标或策略。

## classic 与 auto 保持隔离

- classic 变更使用 `init`、`guard`、`transition`、`review`、`archive`、`return`、`abort`；Run 只使用 `run *`。不要为 Run 的工作调用 classic 的 `init`，也不要用 Run 承载 classic 变更。
- 两者共用同一个预写日志闸门：任一方未完成的事务都会阻挡另一方的变更。`doctor` 会报告它。
- 普通的新请求不续接无关的 classic 变更。
- classic 的哈希与兼容性由 ADR-0003、ADR-0004 约束；`auto` 与 Matt Skills 的解耦见 ADR-0005。
