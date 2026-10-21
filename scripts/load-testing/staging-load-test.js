// ==============================================================================
// MYDAN STAGING LOAD TEST (k6)
// Simulates 50 concurrent supervisors performing morning dashboard check-ins.
//
// Prerequisites:
//   1. Install k6 (https://k6.io/docs/get-started/installation/)
//      Windows: winget install k6 --source winget   OR   choco install k6
//   2. Run command:
//      k6 run scripts/load-testing/staging-load-test.js -e SUPABASE_URL=https://<your-project>.supabase.co -e SUPABASE_ANON_KEY=<anon-key> -e AUTH_TOKEN=<jwt-token>
// ==============================================================================

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

export const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // Ramp up to 20 users
    { duration: '1m',  target: 50 },  // Spike to 50 concurrent supervisors (morning rush)
    { duration: '30s', target: 50 },  // Hold 50 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    // 95% of requests must complete below 800ms
    http_req_duration: ['p(95)<800'],
    // Error rate must be less than 1%
    errors: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.SUPABASE_URL || 'https://ywdlrrdkjbtpfgacuuoy.supabase.co';
const ANON_KEY = __ENV.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
const TOKEN    = __ENV.AUTH_TOKEN || ANON_KEY;

export default function () {
  const headers = {
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
  };

  // 1. Fetch Today's Attendance
  const attRes = http.get(
    `${BASE_URL}/rest/v1/attendance?select=id,attendance_date,check_in_time,check_out_time&order=attendance_date.desc&limit=1`,
    { headers }
  );
  check(attRes, {
    'attendance status is 200': (r) => r.status === 200,
    'attendance latency < 800ms': (r) => r.timings.duration < 800,
  }) || errorRate.add(1);

  sleep(1);

  // 2. Fetch Active Customers for Route
  const custRes = http.get(
    `${BASE_URL}/rest/v1/customers?select=id,name,address,customer_type,latitude,longitude&is_active=eq.true&limit=50`,
    { headers }
  );
  check(custRes, {
    'customers status is 200': (r) => r.status === 200,
    'customers latency < 800ms': (r) => r.timings.duration < 800,
  }) || errorRate.add(1);

  sleep(1);

  // 3. Fetch Beat Plan for Today
  const todayDayOfWeek = new Date().getDay();
  const beatRes = http.get(
    `${BASE_URL}/rest/v1/beat_plans?select=id,day_of_week,customer_id&day_of_week=eq.${todayDayOfWeek}&limit=50`,
    { headers }
  );
  check(beatRes, {
    'beat plans status is 200': (r) => r.status === 200,
    'beat plans latency < 800ms': (r) => r.timings.duration < 800,
  }) || errorRate.add(1);

  sleep(2);
}
