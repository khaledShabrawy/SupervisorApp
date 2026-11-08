/**
 * Tests for purchase-webhook plan detection logic.
 * Covers the critical path: WooCommerce order → license provisioning.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ── Inline the pure logic from the edge function (no Deno/Supabase deps) ──────

const PLAN_MAP: Record<string, { licenseType: 'standard' | 'pro' | 'enterprise'; maxSupervisors: number }> = {
  'mydan-monthly': { licenseType: 'standard',   maxSupervisors: 5   },
  'mydan-yearly':  { licenseType: 'pro',        maxSupervisors: 25  },
  starter:         { licenseType: 'standard',   maxSupervisors: 5   },
  growth:          { licenseType: 'pro',        maxSupervisors: 25  },
  enterprise:      { licenseType: 'enterprise', maxSupervisors: 999 },
};

function detectPlan(slug: string, name: string): keyof typeof PLAN_MAP {
  const candidates = [slug, name].map((s) => s.toLowerCase().trim().replace(/\s+/g, '-'));
  for (const key of candidates) {
    if (key in PLAN_MAP) return key as keyof typeof PLAN_MAP;
  }
  const combined = candidates.join(' ');
  if (combined.includes('enterprise'))                                          return 'enterprise';
  if (combined.includes('yearly') || combined.includes('annual') || combined.includes('growth')) return 'mydan-yearly';
  return 'mydan-monthly';
}

// ── Live WooCommerce slugs ────────────────────────────────────────────────────

test('live slug mydan-monthly maps to standard / 5 supervisors', () => {
  const key = detectPlan('mydan-monthly', 'Mydan Monthly Plan');
  assert.equal(key, 'mydan-monthly');
  assert.equal(PLAN_MAP[key].licenseType, 'standard');
  assert.equal(PLAN_MAP[key].maxSupervisors, 5);
});

test('live slug mydan-yearly maps to pro / 25 supervisors', () => {
  const key = detectPlan('mydan-yearly', 'Mydan Yearly Plan');
  assert.equal(key, 'mydan-yearly');
  assert.equal(PLAN_MAP[key].licenseType, 'pro');
  assert.equal(PLAN_MAP[key].maxSupervisors, 25);
});

// ── Slug takes priority over name ────────────────────────────────────────────

test('slug wins over a conflicting product name', () => {
  const key = detectPlan('mydan-monthly', 'Enterprise Package');
  assert.equal(key, 'mydan-monthly');
});

test('name is used when slug is empty', () => {
  const key = detectPlan('', 'mydan-yearly');
  assert.equal(key, 'mydan-yearly');
});

// ── Keyword fallback ──────────────────────────────────────────────────────────

test('keyword "enterprise" in name triggers enterprise plan', () => {
  const key = detectPlan('', 'Enterprise Plan for Large Teams');
  assert.equal(key, 'enterprise');
  assert.equal(PLAN_MAP[key].maxSupervisors, 999);
});

test('keyword "yearly" in name triggers mydan-yearly', () => {
  const key = detectPlan('', 'Mydan Yearly Subscription');
  assert.equal(key, 'mydan-yearly');
});

test('keyword "annual" in name triggers mydan-yearly', () => {
  const key = detectPlan('', 'Annual Plan');
  assert.equal(key, 'mydan-yearly');
});

test('unknown slug and name falls back to mydan-monthly', () => {
  const key = detectPlan('unknown-product', 'Some Other Product');
  assert.equal(key, 'mydan-monthly');
});

test('empty slug and empty name falls back to mydan-monthly', () => {
  const key = detectPlan('', '');
  assert.equal(key, 'mydan-monthly');
});

// ── Slug normalisation ────────────────────────────────────────────────────────

test('slug with uppercase is normalised before matching', () => {
  const key = detectPlan('Mydan-Monthly', '');
  assert.equal(key, 'mydan-monthly');
});

test('slug with leading/trailing spaces is normalised', () => {
  const key = detectPlan('  mydan-yearly  ', '');
  assert.equal(key, 'mydan-yearly');
});

// ── Plan map completeness ─────────────────────────────────────────────────────

test('every plan key maps to a valid licenseType', () => {
  const valid = new Set(['standard', 'pro', 'enterprise']);
  for (const [key, plan] of Object.entries(PLAN_MAP)) {
    assert.ok(valid.has(plan.licenseType), `${key}: unexpected licenseType "${plan.licenseType}"`);
    assert.ok(plan.maxSupervisors > 0, `${key}: maxSupervisors must be positive`);
  }
});

test('standard plans have maxSupervisors ≤ 10, pro ≤ 50, enterprise is unlimited', () => {
  for (const [key, plan] of Object.entries(PLAN_MAP)) {
    if (plan.licenseType === 'standard')    assert.ok(plan.maxSupervisors <= 10,  `${key}: standard cap`);
    if (plan.licenseType === 'pro')         assert.ok(plan.maxSupervisors <= 50,  `${key}: pro cap`);
    if (plan.licenseType === 'enterprise')  assert.equal(plan.maxSupervisors, 999);
  }
});
