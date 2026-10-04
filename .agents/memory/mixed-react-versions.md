---
name: Mixed React versions
description: Keep PWA React 18 types isolated from native React 19 peer declarations.
---

Preserve each client's requested React version; do not downgrade the native client or change the workspace-wide React catalog to make the PWA compile.

**Why:** The new React 18 web client resolved shared icon declarations against React 19 types despite correctly installing React 18 locally. That produced incompatible JSX component types, not a broken icon implementation.

**How to apply:** When touching TypeScript dependencies or adding shared React libraries, verify runtime versions and artifact-local React type resolution separately. Keep type isolation local to each affected package and check all clients after dependency changes. Even different React 19 type versions can conflict because callback-ref cleanup types contain distinct nominal symbols.