# Mydan shelf-audit n8n workflow

Import `shelf-audit-workflow.json` into n8n, set the workflow environment variables below, activate the workflow, and copy its **Production URL** into the existing Replit Secret named `VITE_N8N_SHELF_AUDIT_WEBHOOK`.

## n8n variables

- `ANTHROPIC_API_KEY` — the Anthropic API key used by the image-analysis node.
- `SUPABASE_URL` — the project URL, for example `https://<project-ref>.supabase.co`.
- `SUPABASE_SERVICE_ROLE_KEY` — the Supabase service-role key. Keep it only in n8n variables; never put it in the mobile app.

The webhook validates and consumes these fields:

```json
{
  "visit_id": "uuid",
  "customer_id": "uuid",
  "supervisor_id": "uuid",
  "image_url": "https://...",
  "timestamp": "2026-09-03T12:00:00.000Z"
}
```

The workflow asks Claude for `audit_summary_ar`, then patches `public.shelf_audit` using `visit_id`. Supabase Realtime delivers the resulting update to the mobile screen.