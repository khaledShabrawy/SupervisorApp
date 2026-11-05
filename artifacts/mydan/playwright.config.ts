import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',testMatch:'*.spec.ts',fullyParallel:false,workers:1,
 use:{baseURL:'http://127.0.0.1:5173',headless:true,serviceWorkers:'block'},
 webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1',url:'http://127.0.0.1:5173',reuseExistingServer:false,
 env:{VITE_SUPABASE_URL:'https://mydan-test.invalid',VITE_SUPABASE_ANON_KEY:'sb_test_placeholder',VITE_PUBLIC_COMPANY_ID:''}},
 reporter:'list'});
