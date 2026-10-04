---
name: Vite public asset paths
description: HTML public-asset links and runtime URLs need different base-path handling.
---

Let Vite apply the artifact base to public-asset links in source HTML. Runtime requests and router URLs still need the artifact prefix exactly once.

**Why:** Embedding the BASE_URL placeholder in public-icon links caused Vite's development HTML transform to duplicate the artifact prefix. The page rendered, but its icon requests returned 404.

**How to apply:** Check transformed HTML as well as production output. Public-asset URLs must contain exactly one artifact prefix; do not apply runtime URL-prefix conventions a second time to links Vite already transforms.