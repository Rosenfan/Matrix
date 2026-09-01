---
name: matrix-open
description: 将开发请求澄清为有证据的 Matrix 提案。
---

# Matrix Open

读取 `node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect` 返回的 `profile` 与 `evidence_policy`。

proposal 正文使用其中的 `artifact_language`；Runtime 所需的英文标题 token 必须原样保留，仅标题下内容本地化。

- full proposal 包含 `## Goal`、`## Scope`、`## Non-goals`、`## Acceptance`、`## Risks`，随后进入 Design。
- lightweight proposal 在修改项目实现前完整定义 `## Goal`、`## Scope`、`## Non-goals`、`## Approach`、`## Acceptance`、`## Validation`、`## Risks`、`## Upgrade conditions`。
- hotfix 额外包含 `## Expected behavior`、`## Actual behavior`、`## Reproduction`。
- tweak 额外包含 `## Current behavior`、`## Preserved behavior`、`## Diff boundary`。

- **Prim**：使用 Matrix 自身能力澄清并编写提案。
- **Arch**：仅在存在重大歧义或用户要求压力测试时调用 `grilling`；仅在领域词汇、不变量或架构决定不清晰时调用 `domain-modeling`。调用前说明能力与原因。

若进展被另一人掌握的事实或决定阻塞，说明 `to-questionnaire` 适用的原因并让用户显式调用；Matrix 不得自行嵌套该 wrapper。

companion 输出只能作为当前 proposal 的证据，不得创建第二套工作流、提案、确认状态或阶段转换。正确安装的能力失败时最多执行一次同能力 Matrix fallback；安装完整性问题必须修复。

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard open
# full
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition design
# hotfix/tweak，仅在用户明确确认后
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition build --confirmed
```
