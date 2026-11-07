import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient as realStorageClient } from '@supabase/supabase-js';
import { budgetGlobals, attachLedger } from './edge-ai-budget-harness.mjs';

// Run the checked-in handler against an in-memory SDK. No Auth, Storage or AI
// service is contacted, and every attempted provider call is intercepted.
const source = readFileSync(new URL('../../../supabase/functions/analyze-shelf/index.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function fixture(options = {}) {
  let serve;
  const calls = { ai:0, gemini:0, anthropic:0, storage:0, writes:[], storageUrls:[], providerSignals:[], anthropicOptions:[], successfulUpdates:[] };
  const environment={ SUPABASE_URL:'https://review.invalid', SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-key', GEMINI_API_KEY:'synthetic-ai-key', ...options.env };
  const caller={ id:'supervisor',company_id:'company',role:'supervisor',is_active:true };
  const audit={ id:'audit',company_id:'company',supervisor_id:caller.id,photo_url:options.photoPath??'company/supervisor/audit.jpg',status:'pending' };
  const settings=Object.hasOwn(options,'settings')?options.settings:{ai_audit_enabled:true,target_brand_name:'Synthetic',competitor_brands:[]};
  const result={score:50,audit_summary_ar:'Synthetic',target_brand_metrics:{out_of_stock:false,oos_items:[]}};
  const storage=realStorageClient('https://review.invalid','synthetic-storage-key',{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:async(url,init)=>{calls.storageUrls.push(new Request(url,init).url);return new Response('synthetic-image',{headers:{'Content-Type':'image/jpeg'}});}},
  });
  const admin={
    auth:{getUser:async()=>({data:{user:{id:'synthetic-user'}}})},
    storage:{from:bucket=>({download:async path=>{calls.storage++;return storage.storage.from(bucket).download(path);}})},
    from(table){
      const filters={};let patch;
      const execute=()=>{
        if(table==='supervisors')return{data:caller,error:null};
        if(table==='app_settings')return{data:settings,error:options.settingsError??null};
        if(!patch)return{data:{...audit},error:null};
        if(patch.status==='completed'&&(options.saveError||options.saveMissing)){
          if(options.commitBeforeSaveError)audit.status='completed';
          return{data:null,error:options.saveError?{code:'PGRST000'}:null};
        }
        if(!Object.entries(filters).every(([key,value])=>Array.isArray(value)?value.includes(audit[key]):audit[key]===value))return{data:null,error:null};
        Object.assign(audit,patch);calls.successfulUpdates.push(patch.status);return{data:{id:audit.id},error:null};
      };
      const query={select(){return query;},eq(key,value){filters[key]=value;return query;},in(key,values){filters[key]=[...values];return query;},update(value){patch=value;calls.writes.push({table,patch,filters});return query;},maybeSingle:async()=>execute(),then(resolve,reject){return Promise.resolve(execute()).then(resolve,reject);}};
      return query;
    },
  };
  attachLedger(admin,calls,options);
  const z={string:()=>({}),number:()=>({}),boolean:()=>({}),array:()=>({}),object:()=>({parse:value=>value})};
  vm.runInNewContext(compiled,{
    ...budgetGlobals(environment), Deno:{env:{get:name=>environment[name]},serve:fn=>{serve=fn;}},
    createClient:()=>admin,z,zodOutputFormat:()=>({}),
    Anthropic:class{constructor(config){calls.anthropicOptions.push(config);this.messages={parse:async()=>{calls.ai++;calls.anthropic++;if(options.anthropicError)throw new Error('Synthetic Anthropic failure');return{parsed_output:result};}};}},
    encodeBase64:data=>Buffer.from(data).toString('base64'),Response,Blob,URL,AbortSignal,console,
    fetch:async(url,init)=>{calls.ai++;calls.gemini++;calls.providerSignals.push(init.signal);assert.match(url,/^https:\/\/generativelanguage\.googleapis\.com\//);if(options.geminiAlwaysFail||calls.gemini<=(options.geminiFailCount??0))return new Response('{}',{status:500});return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]}));},
  });
  return{calls,state:audit,invoke:()=>serve(new Request('https://review.invalid/analyze',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({audit_id:audit.id})}))};
}

async function deniedBeforeCost(options, status) {
  const f = fixture(options);
  const response = await f.invoke();
  assert.equal(response.status, status);
  assert.equal(f.calls.ai, 0);
  assert.equal(f.calls.storage, 0);
  assert.equal(f.calls.writes.length, 0);
}

test('settings read errors and missing settings block AI before any claim or provider request', async () => {
  await deniedBeforeCost({ settingsError: { code: '42501' } }, 503);
  await deniedBeforeCost({ settings: null }, 503);
});

test('AI requires an explicit enabled setting', async () => {
  for (const value of [false, null, undefined]) await deniedBeforeCost({ settings: { ai_audit_enabled: value } }, 403);
});

test('invalid configured quota values fail closed before storage or row claims', async () => {
  for (const value of ['NaN','-1','1oops','','2147483648']) await deniedBeforeCost({env:{MAX_AUDITS_PER_DAY:value}},503);
});

test('analysis requires an unambiguous reservation before provider work',async()=>{
  for(const options of [{rpcMissing:true},{claimRpcErrors:[{code:'PGRST202'}]},{claimRpcReject:0},{claimRpcData:null},{claimRpcData:'not-a-uuid'}]){
    const f=fixture({...options,env:{ANTHROPIC_API_KEY:'synthetic-fallback'}});assert.equal((await f.invoke()).status,503);assert.equal(f.calls.ai,0);assert.equal(f.calls.finishes.length,0);
  }
});

test('company, user and concurrency quota denials stop all providers including fallback',async()=>{
  for(const message of ['AI_QUOTA_COMPANY_DAY','AI_QUOTA_USER_HOUR','AI_QUOTA_CONCURRENT']){
    const f=fixture({claimRpcErrors:[{code:'P0001',message}],env:{ANTHROPIC_API_KEY:'synthetic-fallback'}});assert.equal((await f.invoke()).status,429);assert.equal(f.calls.ai,0);
  }
  const running=fixture({claimRpcErrors:[{code:'P0001',message:'AI_ATTEMPT_IN_PROGRESS'}]});assert.equal((await running.invoke()).status,409);assert.equal(running.calls.ai,0);
  const zero=fixture({env:{MAX_AI_ATTEMPTS_PER_DAY:'0'}});assert.equal((await zero.invoke()).status,429);assert.equal(zero.calls.ai,0);
});

test('every Gemini candidate consumes and closes its own reservation, including failed requests',async()=>{
  const f=fixture({geminiFailCount:1});assert.equal((await f.invoke()).status,200);assert.equal(f.calls.ai,2);assert.equal(f.calls.claims.length,2);
  assert.deepEqual(f.calls.finishes.map(x=>x.p_status),['failed','succeeded']);assert.notEqual(f.calls.finishes[0].p_attempt_id,f.calls.finishes[1].p_attempt_id);
  for(const claim of f.calls.claims){assert.equal(claim.p_company_id,'company');assert.equal(claim.p_supervisor_id,'supervisor');assert.equal(claim.p_operation,'analyze-shelf');assert.equal(claim.p_record_id,'audit');assert.equal(claim.p_provider,'google-gemini');}
  for(const finish of f.calls.finishes){assert.equal(finish.p_company_id,'company');assert.equal(finish.p_supervisor_id,'supervisor');}
  assert.ok(f.calls.providerSignals.every(signal=>signal instanceof AbortSignal));
});

test('Anthropic fallback has a separate reservation and cannot perform hidden SDK retries',async()=>{
  const f=fixture({geminiAlwaysFail:true,env:{ANTHROPIC_API_KEY:'synthetic-fallback'}});assert.equal((await f.invoke()).status,200);assert.equal(f.calls.ai,4);
  assert.deepEqual(f.calls.claims.map(x=>x.p_provider),['google-gemini','google-gemini','google-gemini','anthropic']);
  assert.deepEqual(f.calls.finishes.map(x=>x.p_status),['failed','failed','failed','succeeded']);assert.equal(f.calls.anthropicOptions[0].maxRetries,0);assert.equal(f.calls.anthropicOptions[0].timeout,25000);
  assert.equal(f.calls.writes.find(x=>x.patch.status==='completed').patch.ai_detailed_report.engine,'anthropic');
});

test('quota exhaustion between candidates prevents the next request and all fallback',async()=>{
  const f=fixture({geminiFailCount:1,claimRpcErrors:[null,{code:'P0001',message:'AI_QUOTA_COMPANY_DAY'}],env:{ANTHROPIC_API_KEY:'synthetic-fallback'}});
  assert.equal((await f.invoke()).status,429);assert.equal(f.calls.ai,1);assert.deepEqual(f.calls.finishes.map(x=>x.p_status),['failed']);assert.equal(f.calls.anthropic,0);
});

test('unconfirmed accounting after any provider result prevents success and further spending',async()=>{
  for(const options of [{finishRpcError:{code:'PGRST000'}},{finishRpcData:false},{finishRpcReject:0},{finishRpcError:{code:'PGRST000'},geminiAlwaysFail:true}]){
    const f=fixture({...options,env:{ANTHROPIC_API_KEY:'synthetic-fallback'}});assert.equal((await f.invoke()).status,503);assert.equal(f.calls.ai,1);assert.equal(f.calls.anthropic,0);assert.equal(f.calls.writes.some(x=>x.patch.status==='completed'),false);
  }
});

test('confirmed enabled settings and accounted success allow the normal analysis path',async()=>{
  const f=fixture();assert.equal((await f.invoke()).status,200);assert.equal(f.calls.ai,1);assert.equal(f.calls.storage,1);assert.deepEqual(f.calls.finishes.map(x=>x.p_status),['succeeded']);assert.ok(f.calls.writes.some(write=>write.patch.status==='completed'));
});

test('audit photo keys cannot escape a tenant folder through URL normalization', async () => {
  const unsafe = [
    'company/../foreign/photo.jpg', 'company/./photo.jpg',
    'company/supervisor/../../foreign/photo.jpg', 'company/../../other-bucket/photo.jpg',
    'company/%2e%2e/foreign/photo.jpg', 'company/%252e%252e/foreign/photo.jpg',
    'company/%2f../foreign/photo.jpg', 'company/..\\foreign/photo.jpg',
    'company//photo.jpg', 'company/photo.jpg?download=1', 'company/photo.jpg#fragment',
    'company/\n../foreign/photo.jpg', 'company/\tphoto.jpg', 'company/\u0085photo.jpg',
    'https://review.invalid/storage/v1/object/public/shelf-photos/company/../foreign/photo.jpg',
    'https://review.invalid/storage/v1/object/public/shelf-photos/company/%2e%2e/foreign/photo.jpg',
    'https://unrelated.invalid/storage/v1/object/public/shelf-photos/company/photo.jpg',
  ];
  for (const photoPath of unsafe) await deniedBeforeCost({ photoPath }, 400);
});

test('safe audit UUID keys and same-project legacy signed URLs reach only their expected SDK URL', async () => {
  const key = 'company/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg';
  for (const photoPath of [key, `https://review.invalid/storage/v1/object/sign/shelf-photos/${key}?token=synthetic`]) {
    const f = fixture({ photoPath });
    assert.equal((await f.invoke()).status, 200);
    assert.deepEqual(f.calls.storageUrls, [`https://review.invalid/storage/v1/object/shelf-photos/${key}`]);
  }
});

test('an uncertain analysis save cannot overwrite a committed completed record during cleanup',async()=>{
 const f=fixture({saveError:true,commitBeforeSaveError:true});assert.equal((await f.invoke()).status,500);assert.equal(f.state.status,'completed');assert.ok(!f.calls.successfulUpdates.includes('failed'));
});
