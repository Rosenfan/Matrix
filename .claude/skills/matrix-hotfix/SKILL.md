---
name: matrix-hotfix
description: Run a constrained Matrix workflow for a reproducible small bug. Use for a bug fix that has no material architecture, API, schema, or multi-module coordination impact.
---

# Matrix Hotfix

Start through `$matrix` with workflow `hotfix`. It uses the shared lightweight lifecycle `open → build → verify → archive`; there is no separate hotfix state machine. Before Build, record expected/actual behavior and a reproducible failure signal, present the compact Contract, and wait for confirmation. Build records reproduction and root-cause evidence; Verify records regression evidence. If the bug requires architecture, public API, schema, or broad coordination, use controlled Return to upgrade the change to full.
