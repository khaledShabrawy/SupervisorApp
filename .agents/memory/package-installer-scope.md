---
name: Package installer scope
description: Generic package installation does not select a consuming artifact in this pnpm workspace.
---

Keep new client dependencies scoped to the consuming artifact, not the workspace root.

**Why:** The generic package-installer callback targets the root and fails with pnpm's root-addition guard. Adding a workspace-root flag would put the dependency in the wrong package.

**How to apply:** Read the package-management guidance; if the generic installer hits the root guard, use artifact-scoped pnpm installation rather than bypassing the guard at the root.