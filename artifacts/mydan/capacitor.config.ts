import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mydan.app',
  appName: 'Mydan',
  // vite.config.ts builds into dist/public (not dist).
  webDir: 'dist/public',
  android: {
    // Supabase is HTTPS-only; never allow cleartext or mixed content in the APK.
    allowMixedContent: false,
  },
};

export default config;
