---
name: matrix
description: 启动、恢复并治理持久化的 Matrix 开发工作流。
---

# Matrix

Matrix 的事实来源是当前项目的 `.matrix/`，不得从聊天记录推断阶段。

先执行：

```powershell
matrix workflow inspect
```

只有当系统明确报告 `matrix` 命令不存在时，才解析当前 Matrix Skill 目录并执行：

```powershell
node <matrix-skill-directory>/scripts/matrix-runtime.mjs inspect
```

若没有活动变更，为开发请求创建 kebab-case 变更 ID：

```powershell
matrix workflow init <change-id> --workflow <full|hotfix|tweak> --title "<title>"
```

阶段只能由 `matrix workflow transition` 推进；架构、范围或归档前必须征求用户确认。
