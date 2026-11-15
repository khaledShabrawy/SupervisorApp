# APK Distribution Strategy — Mydan v1.0

## Chosen Method: Direct Download Link (Phase 1)

For v1.0 enterprise rollout, APK is distributed via a **password-protected direct download link**
hosted on Cloudflare Pages alongside the main app.

### Why not Google Play?
- Enterprise FMCG field deployment — controlled fleet of company-issued devices
- No public listing needed; avoids Play Store review cycles
- APK is signed with a release keystore (`mydan-release.keystore`) — ready for sideloading

### Why not Firebase App Distribution?
- Adds dependency on a Google service not already in the stack
- Testers must have Google accounts — not guaranteed for field staff
- Acceptable for QA rounds; reconsider for v2.0 if team > 50 devices

### Delivery Steps (each release)

1. Build signed APK from the git repo:
   ```
   cd artifacts/mydan
   pnpm run build
   npx cap sync android
   cd android && ./gradlew.bat assembleRelease
   ```
   Output: `android/app/build/outputs/apk/release/app-release.apk`

2. Copy to delivery folder:
   ```
   cp app-release.apk C:\Users\Khaled.Mahmoud\Downloads\APK\Mydan-<DATE>.apk
   ```

3. Upload to Cloudflare Pages `public/downloads/` or share via WhatsApp/email to field managers.

4. Field staff: Settings → Security → Allow unknown sources → install APK.

### Device Enrollment (manual, v1.0)
- IT admin installs APK on each company device
- Supervisor logs in with their provisioned email (admin-created via Supabase)
- No MDM required for ≤ 20 supervisors (covered by current license tier)

### Future (v2.0+)
- MDM (Microsoft Intune or Jamf) if fleet exceeds 50 devices
- Firebase App Distribution for QA/beta rings
- Google Play internal testing track if public listing becomes needed
