---
name: Count-response verification
description: Why successful count-header fixtures did not establish live dashboard compatibility.
---

Include absent and unknown count metadata in Supabase verification, not only successful responses with synthetic Content-Range totals.

**Why:** An authenticated user encountered the strict-count dashboard loading error after browser fixtures with valid count headers had passed. The actual live response headers were not captured, so do not assert a particular proxy or backend cause.

**How to apply:** Verify accurate results with omitted/unknown totals and a server page cap below the requested size. Also test a failure on a later page: permission or network errors must not become zero or partial success. Keep these checks intercepted; fixture success does not establish live RLS or schema compatibility.
