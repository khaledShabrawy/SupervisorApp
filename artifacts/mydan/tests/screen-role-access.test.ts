import test from 'node:test';
import assert from 'node:assert/strict';
import { canBypassScreenGrant, isScreenAvailable, isScreenRoleSupported } from '../src/lib/screen-permissions.ts';

const enabled = [{ screen_key: 'field_survey', is_enabled: true }];

test('field users and branch managers need an explicit confirmed survey grant', () => {
  for (const role of ['supervisor', 'senior_supervisor', 'branch_manager']) {
    assert.equal(canBypassScreenGrant(role, 'field_survey'), false);
    assert.equal(isScreenAvailable(undefined, role, 'field_survey'), false);
    assert.equal(isScreenAvailable([], role, 'field_survey'), false);
    assert.equal(isScreenAvailable([{ screen_key: 'field_survey', is_enabled: false }], role, 'field_survey'), false);
    assert.equal(isScreenAvailable(enabled, role, 'field_survey'), true);
  }
});

test('cached grants cannot authorize a screen after its confirmation fails', () => {
  for (const role of ['supervisor', 'senior_supervisor', 'branch_manager']) {
    assert.equal(isScreenAvailable(enabled, role, 'field_survey', false), false);
  }
  assert.equal(isScreenAvailable([{ screen_key: 'new_visit', is_enabled: true }], 'supervisor', 'new_visit', false), false);
});

test('legacy manager aliases and unknown roles cannot use discovery even with a grant', () => {
  for (const role of ['manager', 'unknown', null, undefined]) {
    assert.equal(isScreenRoleSupported(role, 'field_survey'), false);
    assert.equal(isScreenAvailable(enabled, role, 'field_survey'), false);
  }
  assert.equal(isScreenAvailable([{ screen_key: 'new_visit', is_enabled: true }], 'unknown', 'new_visit'), false);
});

test('office admins retain the existing server-side grant exception', () => {
  for (const role of ['admin', 'super_admin']) {
    assert.equal(canBypassScreenGrant(role, 'field_survey'), true);
    assert.equal(isScreenAvailable(undefined, role, 'field_survey', false), true);
  }
});

test('non-survey manager access stays compatible and ordinary screen grants remain scoped', () => {
  for (const role of ['branch_manager', 'manager']) {
    assert.equal(isScreenAvailable(undefined, role, 'beat_plan', false), true);
  }
  assert.equal(isScreenAvailable(enabled, 'supervisor', 'new_visit'), false);
  assert.equal(isScreenAvailable([{ screen_key: 'new_visit', is_enabled: true }], 'supervisor', 'new_visit'), true);
});
