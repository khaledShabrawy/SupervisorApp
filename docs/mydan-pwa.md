# Mydan PWA and Android behavior

The web PWA caches its public application shell and bundled assets. Business APIs, Auth tokens and private photos are never handled by its cache rules. Authenticated queries are an in-memory TanStack cache; there is no complete persistent offline customer/visit database.

The separate encrypted IndexedDB outbox stores individual visit/attendance intentions before transmission. The same server receipt is used for online submission and retry. Each action is acknowledged only after a confirmed server result. The app tries pending replay when an online event occurs while it is open, and offers manual upload. Browser background execution, closed-tab delivery and online detection are not guaranteed. Never close the app based solely on an optimistic UI message: review the pending count and confirmed server state.

Opening a queued new visit returns to the visits list until the server confirms it; the application does not invent a server visit detail page. Authorization or validation failures remain visible and pending for review. A complete offline read model is future work.

The payload key is non-extractable AES-GCM and stored in IndexedDB. Same-origin JavaScript can still use it; this does not defeat XSS or device compromise. Legacy records belonging to another account or malformed records are retained for controlled recovery.

New service workers must finish precaching successfully. They wait for existing app windows to close and do not reload forms. The installed worker reads its own revision cache after a restart. Admin/login navigation requires network; installing the PWA does not grant offline authentication or admin functionality.

Capacitor Android uses the bundled `dist/public` web assets. No remote OTA updater is implemented. Rebuilding the web bundle is separate from building, signing, installing and testing a native APK. Backup is disabled in the Android manifest; Android device behavior has not been verified by the local browser suite.

See [the engineering contract](mydan-engineering-contract.md) and [release gates](mydan-remediation.md). Do not apply database scripts or deploy as a side effect of testing.
