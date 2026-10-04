import test from 'node:test';
import assert from 'node:assert/strict';
import { canAdmin, distanceMeters, isAuthorizedSupervisor, readableForeground, requireExactCount, validateSettings } from '../src/lib/policy.ts';

const supervisor = { id: 'p1', user_id: 'u1', name: 'مشرف تجريبي', phone: null,
  role: 'supervisor' as const, branch_id: null, company_id: 'c1', is_active: true };
const settings = { id: 's1', company_id: 'c1', app_name: 'شركة تجريبية', logo_url: null,
  primary_color: '#1A56DB', success_color: '#108981', danger_color: '#EF4444',
  background_color: '#F8FAFC', geofence_radius_m: 100, target_brand_name: 'علامة اختبار',
  competitor_brands: [], ai_audit_enabled: false };

test('authorized supervisor must match authenticated user and active company', () => {
  assert.equal(isAuthorizedSupervisor(supervisor, 'u1'), true);
  for (const p of [null, {}, { ...supervisor, is_active: false }, { ...supervisor, company_id: '' },
    { ...supervisor, user_id: 'other' }, { ...supervisor, role: 'unknown' }]) {
    assert.equal(isAuthorizedSupervisor(p, 'u1'), false);
  }
});
test('admin routes fail closed and accept super_admin without granting cross-company access', () => {
  assert.equal(canAdmin(null), false);
  assert.equal(canAdmin(supervisor), false);
  assert.equal(canAdmin({ ...supervisor, role: 'admin' }), true);
  assert.equal(canAdmin({ ...supervisor, role: 'super_admin' }), true);
  assert.equal(canAdmin({ ...supervisor, role: 'admin', is_active: false }), false);
});
test('company settings cannot be substituted across companies', () => {
  assert.equal(validateSettings(settings, 'c1'), settings);
  assert.throws(() => validateSettings(settings, 'c2'));
  assert.throws(() => validateSettings({ ...settings, app_name: '' }, 'c1'));
});
test('reject CSS injection or unsafe logo protocols', () => {
  assert.throws(() => validateSettings({ ...settings, primary_color: 'red;display:none' }, 'c1'));
  assert.throws(() => validateSettings({ ...settings, danger_color: 'invalid' }, 'c1'));
  assert.throws(() => validateSettings({ ...settings, logo_url: 'javascript:alert(1)' }, 'c1'));
  assert.equal(validateSettings({ ...settings, logo_url: 'https://example.com/logo.png' }, 'c1').company_id, 'c1');
});
test('geofence configuration and zero coordinates are handled explicitly', () => {
  assert.throws(() => validateSettings({ ...settings, geofence_radius_m: -1 }, 'c1'));
  assert.throws(() => validateSettings({ ...settings, geofence_radius_m: NaN }, 'c1'));
  assert.equal(distanceMeters(0, 0, 0, 0), 0);
  assert.ok(Math.abs(distanceMeters(0, 0, 0, 1) - 111195) < 2);
});
test('company buttons choose readable text for extreme and official colors', () => {
  assert.equal(readableForeground('#FFFFFF'), '#000000');
  assert.equal(readableForeground('#000000'), '#FFFFFF');
  assert.equal(readableForeground('#1A56DB'), '#FFFFFF');
  assert.equal(readableForeground('#552988'), '#FFFFFF');
});
test('missing or malformed exact counts must never become synthetic zero metrics', () => {
  assert.equal(requireExactCount(0), 0);
  assert.equal(requireExactCount(3), 3);
  for (const value of [null, NaN, -1, 1.5]) assert.throws(() => requireExactCount(value));
});