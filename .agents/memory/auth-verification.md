---
name: Auth verification
description: Verify production sign-in orchestration and visible errors, not only isolated authorization helpers.
---

Authentication tests must cover the orchestration actually used by the provider and the error visible to the user, not just policy/helper results.

**Why:** Passing isolated helper tests did not catch a production sign-in catch block substituting a session-change error for an invalid-credentials error. Mocked browser requests exposed the difference.

**How to apply:** Reuse the tested sign-in orchestration in the production provider, explicitly test failure transitions and concurrent logout, and use intercepted browser fixtures for the changed login flow. Keep all Supabase/API traffic mocked; no live test users or database writes.