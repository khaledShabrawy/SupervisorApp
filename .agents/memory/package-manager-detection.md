---
name: Installer package-manager detection
description: Package-installer selection can change when the pnpm lockfile is absent.
---

Keep a valid pnpm lockfile present when using the generic package installer in this workspace, including while regenerating the dependency graph.

**Why:** The installer selected npm when the pnpm lockfile was absent, despite the pnpm workspace configuration. npm then failed against pnpm-managed dependency links.

**How to apply:** For dependency-graph cleanup, preserve the package-manager identity throughout regeneration; confirm the installer reports pnpm and that removed workspace importers are absent from the resulting lockfile.