---
name: matrix-tweak
description: 为边界清晰的小改动运行轻量 Matrix 工作流。
---

# Matrix Tweak

从 `$matrix` 以 `tweak` 启动，共用 `open → build → verify → archive` lightweight 生命周期，不维护独立 tweak 状态机或 Design 阶段。修改实现前，在紧凑 proposal 中定义当前/保留行为、diff 边界、验收与验证，展示后等待确认；Build 与 Verify 必须证明范围和 diff 一致。若涉及 API、模式、架构或跨模块协调，受控 Return 后升级为 full。
