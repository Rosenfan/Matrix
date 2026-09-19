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

- **Prim**：使用 Matrix 自身能力进行结构化澄清（目标、范围、非目标、验收标准、风险、时限），并编写提案。
- **Arch**：Open 开始即说明能力与原因，默认调用 `grilling` 澄清需求；仅在领域词汇、不变量或架构决定不清晰时调用 `domain-modeling`。
- **豁免澄清**：仅当用户同时满足 (1) 自带清晰的执行计划，(2) 明确说明不需要澄清过程 时，才可跳过澄清；跳过仍必须生成 `clarification.md` 的豁免记录。

## 澄清产物（强制）

在编写 proposal 之前生成 `<change>/clarification.md`，无论澄清或豁免都必须落盘：

- 正常澄清：`## Questions` / `## Answers` / `## Resolved scope`（英文标题 token 固定，正文使用 `artifact_language`）；
- 豁免路径：`## Exemption record`（豁免原因 + 用户计划要点 + proposal 如何采纳该计划）。

lightweight（hotfix/tweak）同样适用，但澄清精简为一轮核心问题。该文件是 Open 阶段的证据类产物：不参与 Contract identity 计算，Runtime 不校验其存在；0.1.5 及更早创建、停在 open 的 change 无需补写即可继续推进。

若进展被另一人掌握的事实或决定阻塞，说明 `to-questionnaire` 适用的原因并让用户显式调用；Matrix 不得自行嵌套该 wrapper。

companion 输出只能作为当前 proposal 的证据，不得创建第二套工作流、提案、确认状态或阶段转换。正确安装的能力失败时最多执行一次同能力 Matrix fallback；安装完整性问题必须修复。

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs guard open
# full
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition design
# hotfix/tweak，仅在用户明确确认后
node <matrix-skill-directory>/scripts/matrix-runtime.mjs transition build --confirmed
```
