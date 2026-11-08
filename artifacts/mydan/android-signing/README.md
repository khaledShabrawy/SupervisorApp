# Android Signing Keystore

**File:** `mydan-release.jks`
**Alias:** `mydan`
**Algorithm:** EC secp256r1 / SHA256withECDSA
**Validity:** 30 years (10950 days)
**DN:** CN=Mydan App, OU=Engineering, O=DigitYouCan, L=Cairo, ST=Cairo, C=EG

**SHA-256 Fingerprint:**
```
02:D4:40:23:69:97:A4:47:29:83:9A:8A:7F:DD:37:6A:C8:80:F8:39:67:96:3C:B9:AA:0B:2D:FB:4F:7B:71:4B
```

This fingerprint is registered in `public/.well-known/assetlinks.json`.

## PWABuilder Usage
When generating the Android APK at https://www.pwabuilder.com:
1. Select **Android → Package for Stores**
2. Set Package ID: `com.digityoucan.mydan`
3. Under **Signing → Existing**, upload `mydan-release.jks`
4. Alias: `mydan`
5. Store/Key password: (see team password manager)

## Store Password
**Do NOT commit the password.** Store it in:
- Supabase Edge Function Secret: `ANDROID_KEYSTORE_PASSWORD`
- Or your team's password manager.

Password hint: stored in team password manager — change before Play Store submission.
