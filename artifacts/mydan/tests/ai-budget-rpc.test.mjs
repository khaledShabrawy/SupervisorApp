import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { budgetGlobals } from './edge-ai-budget-harness.mjs';

test('budget reservations and scoped completion use the actual SDK RPC/AbortSignal contract',async()=>{
 const requests=[];const attemptId='aaaaaaaa-aaaa-4aaa-8aaa-000000000001';let providerCalls=0;
 const client=createClient('https://review.invalid','synthetic-service-role-key',{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:async(url,init)=>{
   const req=new Request(url,init);requests.push({url:req.url,method:req.method,body:JSON.parse(init.body),signal:init.signal});
   assert.equal(req.headers.get('authorization'),'Bearer synthetic-service-role-key');
   return new Response(JSON.stringify(req.url.endsWith('mdn_claim_ai_attempt_v1')?attemptId:true),{headers:{'Content-Type':'application/json'}});
  }},
 });
 const {createAiBudget}=budgetGlobals({});
 const budget=createAiBudget(client,{companyId:'company',supervisorId:'actor',operation:'analyze-shelf',recordId:'audit'});
 assert.equal(await budget.run('google-gemini',async()=>{providerCalls++;return 'synthetic result';}),'synthetic result');
 assert.equal(providerCalls,1);assert.equal(requests.length,2);
 assert.equal(requests[0].url,'https://review.invalid/rest/v1/rpc/mdn_claim_ai_attempt_v1');assert.equal(requests[0].method,'POST');
 assert.deepEqual(requests[0].body,{p_company_id:'company',p_supervisor_id:'actor',p_operation:'analyze-shelf',p_record_id:'audit',p_provider:'google-gemini',p_max_company_day:100,p_max_user_hour:20,p_max_concurrent:5});
 assert.equal(requests[1].url,'https://review.invalid/rest/v1/rpc/mdn_finish_ai_attempt_v1');
 assert.deepEqual(requests[1].body,{p_attempt_id:attemptId,p_status:'succeeded',p_company_id:'company',p_supervisor_id:'actor'});
 assert.ok(requests.every(request=>request.signal instanceof AbortSignal));
});
