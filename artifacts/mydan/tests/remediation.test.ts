import { isOperationalReportColumn, operationalReportRows } from '../src/lib/report-scope.ts';
import { mediaPath } from '../src/lib/media-path.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAnalysis } from '../src/lib/analysis-request.ts';
import { shelfMetrics, isMeasuredAudit } from '../src/lib/shelf-metrics.ts';
import { csvCell } from '../src/lib/csv-cell.ts';
import { isScreenAllowed } from '../src/lib/screen-policy.ts';
import { mayRetryOffline } from '../src/lib/operation-errors.ts';

for (const status of [401, 403, 429, 500]) test(`analysis HTTP ${status} rejects without generating results`, async () => {
  let count = 0;
  await assert.rejects(requestAnalysis({ projectUrl: 'https://fixture.invalid', endpoint: 'https://fixture.invalid/functions/v1/analyze-shelf',
    token: 'synthetic', body: { audit_id: 'a1' }, fetcher: async () => { count++; return new Response('{}', { status }); } }));
  assert.equal(count, 1);
});
test('analysis never forwards a token to another origin', async () => {
  let called = false;
  await assert.rejects(requestAnalysis({ projectUrl: 'https://fixture.invalid', endpoint: 'https://other.invalid/analysis',
    token: 'synthetic', body: {}, fetcher: async () => { called = true; return new Response(); } }));
  assert.equal(called, false);
});
test('already claimed analysis is recovered by result polling; timeout never fabricates a result', async () => {
  await requestAnalysis({ projectUrl: 'https://fixture.invalid', endpoint: 'https://fixture.invalid/analysis', token: 'synthetic', body: {},
    fetcher: async () => new Response('{}', { status: 409 }) });
  await assert.rejects(requestAnalysis({ projectUrl: 'https://fixture.invalid', endpoint: 'https://fixture.invalid/analysis', token: 'synthetic', body: {},
    timeoutMs: 5, fetcher: async (_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))) }));
});
test('44% share stays 44%, absent competitors do not imply zero, score is never substituted', () => {
  assert.equal(shelfMetrics({ target_brand_metrics: { facings: 11, share_of_shelf_percentage: 44 }, competitor_metrics: { competitor_share_pct: 56 } }).share, 44);
  assert.equal(shelfMetrics({ target_brand_metrics: { facings: 11 } }).share, null);
  assert.equal(shelfMetrics({ score: 86 }).share, null);
  assert.equal(shelfMetrics({ target_brand_metrics: { facings: 3 }, competitor_facings: 1 }).share, 75);
  assert.equal(isMeasuredAudit({ engine: 'smart-vision-engine' }), false);
  assert.equal(shelfMetrics({ engine: 'smart-vision-engine', target_brand_metrics: { share_of_shelf_percentage: 44 } }).share, null);
});
test('CSV protects text formulas while retaining real negative numbers and Arabic', () => {
  for (const value of ['=1+1', '+cmd', '-cmd', '@sum(A1)', '  =1+1', '\tunsafe']) assert.ok(csvCell(value).startsWith("'"));
  assert.equal(csvCell(-42), '-42');
  assert.equal(csvCell('عميل'), 'عميل');
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
});
test('screen access needs an explicit enabled row', () => {
  assert.equal(isScreenAllowed([], 'field_survey'), false);
  assert.equal(isScreenAllowed(undefined, 'new_visit'), false);
  assert.equal(isScreenAllowed([{ screen_key: 'new_visit', is_enabled: true }], 'new_visit'), true);
});
test('authorization/validation failures are not queued as network failures', () => {
  for (const status of [400, 401, 403, 404, 409, 422]) assert.equal(mayRetryOffline({ code: '42501' }, status), false);
  assert.equal(mayRetryOffline({ message: 'Failed to fetch' }, 0), true);
  assert.equal(mayRetryOffline({ message: 'timeout' }, 503), true);
});

test('private media accepts only the exact project bucket or a canonical object path',()=>{
 const project='https://media-test.invalid';
 assert.equal(mediaPath('A/S/photo.jpg',project,'shelf-photos'),'A/S/photo.jpg');
 assert.equal(mediaPath(project+'/storage/v1/object/public/shelf-photos/A/S/photo.jpg',project,'shelf-photos'),'A/S/photo.jpg');
 for(const value of ['https://evil.test/storage/v1/object/public/shelf-photos/A/S/a.jpg',project+'/storage/v1/object/public/other/A/S/a.jpg','A/../photo.jpg','A/S/photo.jpg?token=untrusted'])assert.throws(()=>mediaPath(value,project,'shelf-photos'));
});

test('custom report previews and saved field selections exclude historical financial columns',()=>{
 const rows=operationalReportRows([{visits:4,actual_orders:9,target_amount:100,price_tag_visible:true,unit_price:50}]);
 assert.deepEqual(rows,[{visits:4,price_tag_visible:true}]);
 assert.equal(isOperationalReportColumn('orders_target'),false);assert.equal(isOperationalReportColumn('audit_score'),true);
});


test('analysis requires an explicit successful JSON receipt for the requested record', async () => {
  const input = { projectUrl:'https://fixture.invalid', endpoint:'https://fixture.invalid/analysis', token:'synthetic', body:{audit_id:'a1'} };
  for (const value of ['<html>proxy</html>', '', '{}', '{"success":false}', '{"success":true,"audit_id":"another"}']) {
    await assert.rejects(requestAnalysis({...input,fetcher:async()=>new Response(value)}));
  }
  await requestAnalysis({...input,fetcher:async()=>new Response(JSON.stringify({success:true,audit_id:'a1'}))});
});
