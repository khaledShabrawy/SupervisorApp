import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient as realStorageClient } from '@supabase/supabase-js';
import { budgetGlobals, attachLedger } from './edge-ai-budget-harness.mjs';

const source = readFileSync(new URL('../../../supabase/functions/discover-customers/index.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function fixture(options = {}) {
  let serve;
  const calls = { gemini:0, anthropic:0, providerSignals:[], anthropicOptions:[], ai: 0, storage: 0, writes: [], permissionFilters: [], surveys: 0, storageUrls: [], successfulUpdates: [] };
  const environment={SUPABASE_URL:'https://review.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-key',GEMINI_API_KEY:'synthetic-ai-key',...options.env};
  const result={summary_ar:'Synthetic',stores_found:0,stores:[]};
  const caller = { id: 'supervisor', company_id: 'company', role: options.role ?? 'supervisor', is_active: true };
  if (Object.hasOwn(options, 'role')) caller.role = options.role;
  const survey = { id: 'survey', company_id: 'company', supervisor_id: caller.id, photo_url: options.photoPath ?? 'company/supervisor/survey.jpg', status: options.surveyStatus ?? 'pending' };
  const permission = Object.hasOwn(options, 'permission') ? options.permission : { is_enabled: true };
  const storage = realStorageClient('https://review.invalid', 'synthetic-storage-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      calls.storageUrls.push(new Request(url, init).url);
      return new Response('synthetic-image', { headers: { 'Content-Type': 'image/jpeg' } });
    } },
  });
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: 'synthetic-user' } } }) },
    storage: { from: bucket => ({ download: async path => { calls.storage++; return storage.storage.from(bucket).download(path); } }) },
    from(table) {
      if (table === 'field_surveys') calls.surveys++;
      const filters = {};
      let patch;
      const execute = () => {
        if (table === 'supervisors') return { data: caller, error: null };
        if (table === 'supervisor_permissions') return { data: permission, error: options.permissionError ?? null };
        if (!patch) return { data: { ...survey }, error: null };
        if (patch.status === 'in_progress' && options.claimError) return { data: null, error: { code: '42501' } };
        if (patch.status === 'in_progress' && options.claimMissing) return { data: null, error: null };
        if (patch.status === 'completed' && (options.saveError || options.saveMissing)) {
          if (options.commitBeforeSaveError) survey.status = 'completed';
          return { data: null, error: options.saveError ? { code: 'PGRST000' } : null };
        }
        const matches = Object.entries(filters).every(([key, value]) => Array.isArray(value) ? value.includes(survey[key]) : survey[key] === value);
        if (!matches) return { data: null, error: null };
        Object.assign(survey, patch);
        calls.successfulUpdates.push(patch.status);
        return { data: { id: survey.id }, error: null };
      };
      const query = {
        select() { return query; },
        eq(key,value) { filters[key]=value; if (table === 'supervisor_permissions') calls.permissionFilters.push([key,value]); return query; },
        in(key,values) { filters[key]=[...values]; return query; },
        update(value) { patch=value; calls.writes.push({ table, patch, filters }); return query; },
        maybeSingle: async () => execute(),
        then(resolve,reject) { return Promise.resolve(execute()).then(resolve,reject); },
      };
      return query;
    },
  };
  attachLedger(admin,calls,options);
  const scalar = { int() { return this; }, min() { return this; } };
  const z = { string: () => scalar, number: () => scalar, enum: () => scalar, array: () => scalar, object: () => ({ parse: value => value }) };
  vm.runInNewContext(compiled, {
    ...budgetGlobals(environment),
    Deno: { env: { get: name => environment[name] }, serve: fn => { serve=fn; } },
    createClient: () => admin, z, zodOutputFormat: () => ({}), Anthropic: class { constructor(config) { calls.anthropicOptions.push(config);this.messages={parse:async()=>{calls.ai++;calls.anthropic++;if(options.anthropicError)throw new Error('Synthetic Anthropic failure');return{parsed_output:result};}};} },
    encodeBase64: data => Buffer.from(data).toString('base64'), Response, Blob, URL, AbortSignal, console,
    fetch: async (url,init) => { calls.ai++;calls.gemini++;calls.providerSignals.push(init.signal);if(options.geminiAlwaysFail)return new Response('{}',{status:500}); assert.match(url,/^https:\/\/generativelanguage\.googleapis\.com\//); return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({summary_ar:'Synthetic',stores_found:0,stores:[]})}]}}]})); },
  });
  return { calls, state: survey, invoke: () => serve(new Request('https://review.invalid/discover',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({survey_id:survey.id})})) };
}
async function denied(options,status) {
  const f=fixture(options);
  assert.equal((await f.invoke()).status,status);
  assert.equal(f.calls.ai,0);
  assert.equal(f.calls.storage,0);
  assert.equal(f.calls.writes.length,0);
  assert.equal(f.calls.surveys,0);
}

test('discovery denies missing, disabled and malformed screen grants before any side effect',async()=>{
  for (const permission of [null,{is_enabled:false},{is_enabled:null},{is_enabled:'true'},{}]) await denied({permission},403);
});
test('discovery permission lookup errors fail closed before storage, AI or row updates',async()=>{
  await denied({permissionError:{code:'42501'}},503);
});
test('discovery denies unknown and null roles even if a grant is supplied',async()=>{
  for(const role of ['unknown-role',null]) await denied({role},403);
});
test('an explicit discovery grant is scoped to the current supervisor, company and screen',async()=>{
  for(const role of ['supervisor','senior_supervisor','branch_manager']){
    const f=fixture({role});
    assert.equal((await f.invoke()).status,200);
    assert.deepEqual(f.calls.permissionFilters,[['supervisor_id','supervisor'],['company_id','company'],['screen_key','field_survey']]);
    assert.equal(f.calls.ai,1);assert.equal(f.calls.storage,1);
    assert.ok(f.calls.writes.some(write=>write.patch.status==='completed'));
  }
});
test('existing admin roles retain their explicit permission-check exception',async()=>{
  for(const role of ['admin','super_admin']){
    const f=fixture({role,permissionError:{code:'42501'}});
    assert.equal((await f.invoke()).status,200);
    assert.equal(f.calls.permissionFilters.length,0);
    assert.equal(f.calls.ai,1);
  }
});

test('discovery rejects dot, encoded, backslash and control/query/hash paths before Storage sees them', async () => {
  for (const photoPath of [
    'company/../foreign/photo.jpg', 'company/./photo.jpg',
    'company/supervisor/../../foreign/photo.jpg', 'company/../../other-bucket/photo.jpg',
    'company/%2e%2e/foreign/photo.jpg', 'company/%252e%252e/foreign/photo.jpg',
    'company/%2f../foreign/photo.jpg', 'company/..\\foreign/photo.jpg',
    'company//photo.jpg', 'company/photo.jpg?download=1', 'company/photo.jpg#fragment',
    'company/\n../foreign/photo.jpg', 'company/\tphoto.jpg', 'company/\u0085photo.jpg',
  ]) {
    const f=fixture({ photoPath });
    assert.equal((await f.invoke()).status,403,photoPath);
    assert.equal(f.calls.storage,0);assert.equal(f.calls.ai,0);assert.equal(f.calls.writes.length,0);
  }
});

test('safe discovery UUID keys preserve their exact tenant-scoped SDK request', async () => {
  const photoPath='company/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg';
  const f=fixture({ photoPath });
  assert.equal((await f.invoke()).status,200);
  assert.deepEqual(f.calls.storageUrls,[`https://review.invalid/storage/v1/object/survey-photos/${photoPath}`]);
});


test('discovery atomically claims only pending/rejected rows and rejects a lost claim before provider work',async()=>{
  for(const options of [{claimError:true},{claimMissing:true}]){
    const f=fixture(options);
    assert.equal((await f.invoke()).status,options.claimError?503:409);
    assert.equal(f.calls.ai,0);assert.equal(f.calls.storage,0);
    assert.deepEqual(f.calls.successfulUpdates,[]);
    assert.deepEqual(f.calls.writes[0].filters,{id:'survey',company_id:'company',status:['pending','rejected']});
  }
  const retry=fixture({surveyStatus:'rejected'});
  assert.equal((await retry.invoke()).status,200);
  assert.equal(retry.state.status,'completed');
});

test('concurrent discovery requests incur provider work only for the winning claim',async()=>{
  const f=fixture();
  const responses=await Promise.all([f.invoke(),f.invoke()]);
  assert.deepEqual(responses.map(response=>response.status).sort(),[200,409]);
  assert.equal(f.calls.ai,1);assert.equal(f.calls.storage,1);
  assert.deepEqual(f.calls.successfulUpdates,['in_progress','completed']);
});

test('discovery never reports success when the completed-row receipt is absent or rejected',async()=>{
  for(const options of [{saveError:true},{saveMissing:true}]){
    const f=fixture(options);
    assert.equal((await f.invoke()).status,500);
    assert.equal(f.calls.ai,1);
    const completion=f.calls.writes.find(write=>write.patch.status==='completed');
    assert.deepEqual(completion.filters,{id:'survey',company_id:'company',status:'in_progress'});
  }
});

test('a lost response after saving completed cannot be rolled back to failed by cleanup',async()=>{
  const f=fixture({saveError:true,commitBeforeSaveError:true});
  assert.equal((await f.invoke()).status,500);
  assert.equal(f.state.status,'completed');
  const cleanup=f.calls.writes.find(write=>write.patch.status==='rejected');
  assert.deepEqual(cleanup.filters,{id:'survey',company_id:'company',status:'in_progress'});
  assert.ok(!f.calls.successfulUpdates.includes('rejected'));
});


test('discovery requires a reservation and fails closed when the ledger RPC is missing or ambiguous',async()=>{
 for(const options of [{rpcMissing:true},{claimRpcErrors:[{code:'PGRST202'}]},{claimRpcReject:0},{claimRpcData:null},{claimRpcData:'not-a-uuid'}]){
  const f=fixture({...options,env:{ANTHROPIC_API_KEY:'synthetic-fallback'}});assert.equal((await f.invoke()).status,503);assert.equal(f.calls.ai,0);assert.equal(f.calls.finishes.length,0);
 }
});

test('discovery uses the same shared company/user/concurrency attempt limits and honors zero caps',async()=>{
 for(const message of ['AI_QUOTA_COMPANY_DAY','AI_QUOTA_USER_HOUR','AI_QUOTA_CONCURRENT']){
  const f=fixture({claimRpcErrors:[{code:'P0001',message}],env:{ANTHROPIC_API_KEY:'synthetic-fallback'}});assert.equal((await f.invoke()).status,429);assert.equal(f.calls.ai,0);
 }
 const f=fixture({env:{MAX_AI_ATTEMPTS_PER_DAY:'9',MAX_AUDITS_PER_DAY:'999',MAX_AI_ATTEMPTS_PER_HOUR_USER:'3',MAX_CONCURRENT_AI_ATTEMPTS:'1'}});assert.equal((await f.invoke()).status,200);
 const p=f.calls.claims[0];assert.equal(p.p_operation,'discover-customers');assert.equal(p.p_record_id,'survey');assert.equal(p.p_company_id,'company');assert.equal(p.p_supervisor_id,'supervisor');assert.equal(p.p_max_company_day,9);assert.equal(p.p_max_user_hour,3);assert.equal(p.p_max_concurrent,1);
 const zero=fixture({env:{MAX_AI_ATTEMPTS_PER_DAY:'0'}});assert.equal((await zero.invoke()).status,429);assert.equal(zero.calls.ai,0);
});

test('discovery validates configured attempt limits before claiming a row or downloading a photo',async()=>{
 for(const raw of ['-1','NaN','','2147483648']){
  const f=fixture({env:{MAX_AI_ATTEMPTS_PER_DAY:raw}});assert.equal((await f.invoke()).status,503);assert.equal(f.calls.storage,0);assert.equal(f.calls.ai,0);assert.equal(f.calls.writes.length,0);
 }
});

test('discovery fallback consumes a second attempt after closing the failed first provider',async()=>{
 const f=fixture({geminiAlwaysFail:true,env:{ANTHROPIC_API_KEY:'synthetic-fallback'}});assert.equal((await f.invoke()).status,200);assert.equal(f.calls.ai,2);
 assert.deepEqual(f.calls.claims.map(x=>x.p_provider),['google-gemini','anthropic']);assert.deepEqual(f.calls.finishes.map(x=>x.p_status),['failed','succeeded']);assert.notEqual(f.calls.finishes[0].p_attempt_id,f.calls.finishes[1].p_attempt_id);
 assert.equal(f.calls.anthropicOptions[0].maxRetries,0);assert.equal(f.calls.anthropicOptions[0].timeout,25000);assert.ok(f.calls.providerSignals.every(signal=>signal instanceof AbortSignal));
 assert.equal(f.calls.writes.find(x=>x.patch.status==='completed').patch.ai_raw_result.engine,'anthropic');
 for(const finish of f.calls.finishes){assert.equal(finish.p_company_id,'company');assert.equal(finish.p_supervisor_id,'supervisor');}
});

test('discovery cannot spend on fallback when the next reservation or first completion is denied',async()=>{
 const exhausted=fixture({geminiAlwaysFail:true,env:{ANTHROPIC_API_KEY:'synthetic-fallback'},claimRpcErrors:[null,{code:'P0001',message:'AI_QUOTA_COMPANY_DAY'}]});assert.equal((await exhausted.invoke()).status,429);assert.equal(exhausted.calls.ai,1);assert.equal(exhausted.calls.anthropic,0);
 for(const options of [{finishRpcData:false},{finishRpcError:{code:'PGRST000'}},{finishRpcReject:0},{finishRpcData:false,geminiAlwaysFail:true}]){
  const f=fixture({...options,env:{ANTHROPIC_API_KEY:'synthetic-fallback'}});assert.equal((await f.invoke()).status,503);assert.equal(f.calls.ai,1);assert.equal(f.calls.anthropic,0);assert.equal(f.calls.writes.some(x=>x.patch.status==='completed'),false);
 }
});
