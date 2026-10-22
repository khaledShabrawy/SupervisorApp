import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mydan.supervisor',
  appName: 'Mydan',
  // vite.config.ts builds into dist/public (not dist).
  webDir: 'dist/public',
  server: {
    url: 'https://mydan.digityoucan.com',
    cleartext: false,
    androidScheme: 'https',
  },
  android: {
    // Supabase is HTTPS-only; never allow cleartext or mixed content in the APK.
    allowMixedContent: false,
  },
};

export default config;
