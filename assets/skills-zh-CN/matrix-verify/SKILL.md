---
name: matrix-verify
description: 依据计划验证 Matrix 变更并审查差异。
---

# Matrix Verify

运行计划的验证命令，在 `verification.md` 写入 `## Test evidence`。读取冻结 `orchestration`：

- **Prim**：Matrix 自行完成 Standards 与 Spec 双轴审查。
- **Arch**：调用 `code-review` 产生双轴证据，并说明调用原因。

审查结果只是 Matrix Verify 的输入；companion 不得决定阶段结果、扩大已批准架构、推进或归档。不得调用事后架构改进 wrapper。正确安装的审查能力失败时最多执行一次同能力 Matrix fallback；安装完整性问题必须停止。

失败时使用受控 Return：

```powershell
matrix workflow return build --reason verification-failed
matrix workflow return design --reason acceptance-or-design-gap
```

Return 会轮换旧 `verification.md`；不得把旧结论直接复制为新的当前证据。

```powershell
matrix workflow guard verify
matrix workflow transition archive
```
