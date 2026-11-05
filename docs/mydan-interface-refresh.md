# Mydan interface refresh — 2026-11-05

Owner authorized implementing the proposed visual improvements and pushing them to GitHub. The review branch is `feat/mydan-interface-refresh`. The earlier security/offline/Android remediation is preserved in a separate baseline commit; interface changes follow it. `main` is not the publishing target. No database, Edge Function or website deployment is included.

## Result

- Group web-admin navigation into overview, field operations, data management, and system/security. Keep every existing route and role restriction; show Companies only to platform administrators. Use consistent outline icons and a keyboard skip link.
- Put six period/company metrics in a balanced responsive grid. Replace the oversized gauge and repeated metrics with compact progress for visits and shelf audits. Show an unassigned-target message instead of a fabricated achievement percentage. Keep company asset/ticket scope explicit.
- Preserve cascading region/branch/user filters. Remove the misleading all-time preset, which previously cleared date inputs but caused the data hook to default back to the current month. Explicit date inputs remain available.
- Distinguish loading, failed and empty alert queries. An empty inbox does not prove field compliance. Label the alert feed as notifications available to the account rather than implying that date/branch filters scope it.
- Keep Edit visible in user rows and put secondary actions in a portalled menu that cannot be clipped by table scrolling. Support arrows, Home/End, Escape, focus return and disabled protected-account actions. Existing confirmations and server guards remain authoritative.
- Repair the narrow-screen admin grid's intrinsic width so navigation does not stretch the content/table outside the phone viewport.
- Give the field home a greeting, one primary New Visit action and quiet secondary tools. Retain company theme colors; consolidate saturated rainbow tiles into neutral surfaces. Show pending sync actions only when needed, while preserving upload/replay/refresh behavior.
- Add visible keyboard focus, reduced-motion support, Arabic/English strings and logical-direction layouts. Keep the five-tab field navigation and Android/admin separation.

## Validation

- Local TypeScript check and all 16 existing test files passed, including translation coverage and isolated database/security tests.
- All 13 intercepted Chromium cases passed: the prior nine security/lifecycle/outbox cases plus four interface cases covering live filter payloads, balanced desktop rows, protected user actions, keyboard focus, mobile table/menu bounds, failed alert loading, missing targets, and English field UI.
- Local web production build and all eight built-service-worker cases passed.
- Native debug APK assembly and lint passed. Lint retains 18 pre-existing warnings and no errors. ZIP CRC, zipalign and v1/v2 signature passed. APK has no nested package, service worker, private signing material or bundled user-admin UI under the checks performed.
- Visual review used synthetic users and data on 1440px desktop and 390px phone layouts. No production data or authenticated live service was accessed. Browser tests intercept/block external HTTP/WebSockets.
- CI is enabled on this feature branch as well as main; local results do not establish a successful remote Actions run. Secret scanning includes the repository's existing history; historical findings are not removed by a clean current snapshot.

## Android handoff

The rebuilt `Mydan-Preview.apk` is 4,516,049 bytes. SHA-256:

```
e30db05bec6e1485793d08899bfc341d750fc9189fa9fdbb3e6f5ec9b3e0e720
```

Package `com.mydan.supervisor.preview`, version `Mydan_01-preview`, Debug certificate. This record supersedes previous Preview sizes/hashes for this interface revision; earlier reports describe the corresponding earlier artifacts. The APK is a test build, not an owner-signed production release. The corrected backend contract remains undeployed, so full operation against an older backend is not established. Physical-device camera/GPS/background acceptance remains outstanding.

The original audit and the full source re-review remain historical evidence; open schema/rollout, training analytics, Router advisory, legacy public-APK distribution and native integration findings are not closed by this visual change. See `mydan-full-review-2026-11-05.md` and `mydan-engineering-contract.md`.
