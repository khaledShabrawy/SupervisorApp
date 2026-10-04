---
name: Native Expo configuration
description: Managed native builds require static Expo configuration even when dynamic CLI validation passes.
---

Keep native Expo configuration static. Runtime company branding and native launch colors have different lifecycles.

**Why:** Dynamic configuration passed local Expo configuration checks, but the managed Expo Launch build contract prohibits dynamic config files. A successful local config command does not establish native publishing compatibility.

**How to apply:** Update native launch backgrounds in static configuration when preparing a buyer-specific native build. Do not add a dynamic config solely to import runtime branding, and do not change native package identifiers to align colors.