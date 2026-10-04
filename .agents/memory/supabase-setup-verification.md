---
name: Supabase setup verification
description: Verify target-project pairing after a secrets confirmation without exposing credentials.
---

Treat a secure secrets confirmation as evidence that entries exist, not that their values match the intended Supabase project. Keep the public project URL explicit in non-secret environment configuration and keep the client key in Secrets.

**Why:** The secure flow can confirm existing entries; its confirmation alone did not prove that the URL matched the requested project.

**How to apply:** Compare the configured public URL with the requested target without logging secret values. Use a read-only auth metadata request to verify endpoint/key pairing. HTTP 200 on metadata does not verify user sign-in, table permissions, or RLS policies. Never substitute a service-role key into mobile code.
