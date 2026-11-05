import test from 'node:test';
import assert from 'node:assert/strict';
import { corsHeaders } from '@supabase/supabase-js/cors';
import { withClientCors } from '../../../supabase/functions/_shared/client-cors.ts';
const url='https://edge-test.invalid/functions/v1/analyze-shelf';
test('Android and the configured web app can preflight without invoking privileged work',async()=>{
 let invoked=0;
 const handler=withClientCors(()=>{invoked++;return Response.json({success:true});},'https://mydan.example.test',corsHeaders);
 for(const origin of ['https://localhost','capacitor://localhost','https://mydan.example.test']){
  const response=await handler(new Request(url,{method:'OPTIONS',headers:{Origin:origin}}));
  assert.equal(response.status,204);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
  assert.equal(response.headers.get('Access-Control-Allow-Headers'),corsHeaders['Access-Control-Allow-Headers']);
 }
 assert.equal(invoked,0);
});
test('native actual responses have the matching origin, including error responses',async()=>{
 const handler=withClientCors(()=>Response.json({error:'unauthorized'},{status:401,headers:{'Access-Control-Allow-Origin':'*','Vary':'Accept-Encoding'}}),'https://mydan.example.test',corsHeaders);
 const response=await handler(new Request(url,{method:'POST',headers:{Origin:'https://localhost'}}));
 assert.equal(response.status,401);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://localhost');
 assert.equal(response.headers.get('Vary'),'Accept-Encoding, Origin');
});
test('lookalike native origins are rejected before any privileged work; server calls still reach authentication',async()=>{
 let invoked=0;
 const handler=withClientCors(()=>{invoked++;return new Response('authentication required',{status:401});},'https://mydan.example.test',corsHeaders);
 for(const origin of ['https://localhost.evil.test','http://localhost','null','https://evil.test']){
  assert.equal((await handler(new Request(url,{method:'POST',headers:{Origin:origin}}))).status,403);
 }
 assert.equal(invoked,0);assert.equal((await handler(new Request(url,{method:'POST'}))).status,401);assert.equal(invoked,1);
});
