---
name: matrix-tweak
description: Run a lightweight Matrix workflow for a bounded small development change. Use for a small request with no schema, public API, architecture, or cross-module coordination impact.
---

# Matrix Tweak

Start through `$matrix` with workflow `tweak`. It uses the shared lightweight lifecycle `open → build → verify → archive`; there is no separate tweak state machine or Design phase. Before editing implementation, define current/preserved behavior, the diff boundary, acceptance, and validation in the compact proposal, present it, and wait for confirmation. Build and Verify must prove scope and diff alignment. Use controlled Return to upgrade to full when the change crosses module, API, schema, or architecture boundaries.
