import { safeAppPath } from '../src/lib/safe-navigation.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell } from '../src/lib/csv-cell.ts';
import { isScreenAllowed } from '../src/lib/screen-permissions.ts';

test('CSV neutralizes formulas from user text, including leading controls', () => {
  for (const value of ['=1+1', '+1+1', '-1+1', '@SUM(A1)', ' \t=1+1', '\r=1+1']) {
    assert.ok(csvCell(value).replace(/^"/, '').startsWith("'"), value);
  }
  assert.equal(csvCell(-12.5), '-12.5');
  assert.equal(csvCell('شركة ميدان'), 'شركة ميدان');
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell(null), '');
});

test('screens require explicit grants; missing or unrelated rows never enable access', () => {
  assert.equal(isScreenAllowed([], 'field_survey'), false);
  assert.equal(isScreenAllowed([{screen_key:'new_visit',is_enabled:true}], 'field_survey'), false);
  assert.equal(isScreenAllowed([{screen_key:'field_survey',is_enabled:false}], 'field_survey'), false);
  assert.equal(isScreenAllowed([{screen_key:'field_survey',is_enabled:true}], 'field_survey'), true);
});

test('notification routes reject external and encoded backslash redirects', () => {
  for (const path of ['https://example.com', '//example.com', '/\\example.com', '/%5cexample.com', '/%255cexample.com', '/%2fexample.com', '/\nexample.com', 'javascript:alert(1)', '/%zz']) {
    assert.equal(safeAppPath(path), null, path);
  }
  assert.equal(safeAppPath('/visits/123?tab=orders'), '/visits/123?tab=orders');
  assert.equal(safeAppPath('/'), '/');
});
