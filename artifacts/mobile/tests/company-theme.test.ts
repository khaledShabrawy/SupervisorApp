import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCompanyTheme, contrastRatio } from '../lib/company-theme.ts';

const ZEINA = { id: 'zeina', name: 'زينة للورقيات', primaryColor: '#552988', accentColor: '#3195FF' };

test('Zeina uses the official purple and secondary blue', () => {
  const theme = createCompanyTheme(ZEINA);
  assert.equal(theme.light.primary, '#552988');
  assert.equal(theme.light.accent, '#3195FF');
  assert.equal(theme.light.card, '#FFFFFF');
  assert.notEqual(theme.dark.background, theme.light.background);
});
test('a different buyer changes brand surfaces without changing status meanings', () => {
  const first = createCompanyTheme(ZEINA);
  const second = createCompanyTheme({ id: 'fixture-buyer', name: 'شركة اختبار', primaryColor: '#006B5E' });
  for (const mode of ['light', 'dark'] as const) {
    for (const token of ['primary', 'background', 'border', 'customerPrimary'] as const) {
      assert.notEqual(first[mode][token], second[mode][token]);
    }
    for (const token of ['success', 'warning', 'destructive', 'info'] as const) {
      assert.equal(first[mode][token], second[mode][token]);
    }
  }
});
for (const primaryColor of ['#552988', '#FFFFFF', '#000000', '#FFFF00', '#006B5E']) {
  test(`normal button text remains readable for buyer color ${primaryColor}`, () => {
    const theme = createCompanyTheme({ ...ZEINA, primaryColor });
    for (const mode of ['light', 'dark'] as const) {
      const colors = theme[mode];
      for (const role of ['primary', 'accent', 'success', 'warning', 'destructive', 'info'] as const) {
        assert.ok(contrastRatio(colors[role], colors[`${role}Foreground`]) >= 4.5, `${mode} ${role}`);
      }
      assert.ok(contrastRatio(colors.foreground, colors.background) >= 4.5);
    }
  });
}
test('invalid brand inputs fail explicitly rather than use another company', () => {
  assert.throws(() => createCompanyTheme({ ...ZEINA, primaryColor: 'purple' }), /RRGGBB/);
  assert.throws(() => createCompanyTheme({ ...ZEINA, accentColor: '#12' }), /RRGGBB/);
  assert.throws(() => createCompanyTheme({ ...ZEINA, id: '' }), /identity/);
  assert.throws(() => createCompanyTheme({ ...ZEINA, name: ' ' }), /identity/);
});
test('theme generation does not mutate the company configuration', () => {
  const input = Object.freeze({ ...ZEINA });
  const theme = createCompanyTheme(input);
  assert.equal(input.primaryColor, '#552988');
  assert.equal(theme.radius, 12);
  assert.equal(theme.light.customerPrimary, theme.light.primary);
});