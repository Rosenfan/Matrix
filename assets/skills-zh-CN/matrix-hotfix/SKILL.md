---
name: matrix-hotfix
description: 为可复现的小型缺陷运行受约束的 Matrix 工作流。
---

# Matrix Hotfix

从 `$matrix` 以 `hotfix` 启动，共用 `open → build → verify → archive` lightweight 生命周期，不维护独立 hotfix 状态机。Build 前记录预期/实际行为和可复现失败信号，展示紧凑 Contract 并等待确认；Build 记录复现与根因，Verify 记录回归证据。若影响架构、公开 API、数据模式或多模块协调，受控 Return 后升级为 full。
