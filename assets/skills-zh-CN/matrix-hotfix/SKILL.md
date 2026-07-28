---
name: matrix-hotfix
description: 为可复现的小型缺陷运行受约束的 Matrix 工作流。
---

# Matrix Hotfix

从 `$matrix` 以 `hotfix` 工作流启动并保持冻结的 Prim/Arch 编排。Prim 自行诊断；Arch 仅在真实失败存在且根因未知时调用 `diagnosing-bugs`。companion 输出必须回到 Matrix 产物与状态。若问题影响架构、公开 API、数据模式或多模块协调，受控 Return 后升级为完整工作流。
