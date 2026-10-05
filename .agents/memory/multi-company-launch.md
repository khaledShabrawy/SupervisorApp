---
name: Multi-company launch
description: Mydan's first release must serve multiple companies from day one.
---

The user chose “عدة شركات من اليوم الأول” rather than launching with one company first.

**Why:** This was their explicit answer to the launch-scope decision; company separation is a launch requirement, not a later expansion.

**How to apply:** Treat verified tenant-safe database policies, storage access and two-company isolation tests as release gates. Client-side `company_id` filters are not evidence of backend isolation. Review the live schema, existing data mapping and migration rollback plan before proposing any external changes.
