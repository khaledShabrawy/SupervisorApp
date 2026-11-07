import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createDecipheriv, generateKeyPairSync, hkdfSync, randomBytes, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { base64url, encryptWebPush, MAX_WEB_PUSH_PAYLOAD_BYTES, safePushEndpoint, validateSubscriptionKeys, vapidSigner } from '../../../supabase/functions/push-notify/web-push.ts';

// A receiver implemented independently with node:crypto, never a push service.
function receiver() {
  const ecdh = createECDH('prime256v1');
  const publicKey = ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    keys: { p256dh: publicKey.toString('base64url'), auth: auth.toString('base64url') },
    decrypt(wire) {
      wire = Buffer.from(wire);
      const salt = wire.subarray(0,16);
      assert.equal(wire.readUInt32BE(16),4096);
      assert.equal(wire[20],65);
      const sender = wire.subarray(21,86);
      const shared = ecdh.computeSecret(sender);
      const context = Buffer.concat([Buffer.from('WebPush: info\0'),publicKey,sender]);
      const ikm = Buffer.from(hkdfSync('sha256',shared,auth,context,32));
      const key = Buffer.from(hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: aes128gcm\0'),16));
      const nonce = Buffer.from(hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: nonce\0'),12));
      const encrypted = wire.subarray(86);
      const decipher = createDecipheriv('aes-128-gcm',key,nonce);
      decipher.setAuthTag(encrypted.subarray(-16));
      const plaintext = Buffer.concat([decipher.update(encrypted.subarray(0,-16)),decipher.final()]);
      assert.equal(plaintext.at(-1),2,'RFC 8188 final-record delimiter');
      return plaintext.subarray(0,-1);
    },
  };
}
function vapid() {
  const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const jwk=pair.privateKey.export({format:'jwk'});
  return { publicKey:pair.publicKey, public:Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]).toString('base64url'), private:jwk.d, subject:'mailto:push@example.invalid' };
}
function verifyVapid(header,keys,origin) {
  const matched=/^vapid t=([^,]+),k=(.+)$/.exec(header);
  assert.ok(matched);
  assert.equal(matched[2],keys.public);
  const [head,body,signature]=matched[1].split('.');
  assert.deepEqual(JSON.parse(Buffer.from(head,'base64url')),{typ:'JWT',alg:'ES256'});
  const claims=JSON.parse(Buffer.from(body,'base64url'));
  assert.equal(claims.aud,origin);
  assert.equal(claims.sub,keys.subject);
  const now=Math.floor(Date.now()/1000);
  assert.ok(claims.exp>now && claims.exp<=now+43200);
  assert.equal(Buffer.from(signature,'base64url').length,64);
  assert.equal(verify('sha256',Buffer.from(`${head}.${body}`),{key:keys.publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url')),true);
}

test('RFC 8291 aes128gcm records independently decrypt and reject tampering',async()=>{
  const ua=receiver();
  const payload=Buffer.from(JSON.stringify({title:'تنبيه ميداني',body:'حان وقت مراجعة الزيارة 📍'}));
  const wire=await encryptWebPush(payload,ua.keys);
  assert.deepEqual(ua.decrypt(wire),payload);
  const damaged=Buffer.from(wire);damaged[damaged.length-20]^=1;
  assert.throws(()=>ua.decrypt(damaged));
  const second=await encryptWebPush(payload,ua.keys);
  assert.notDeepEqual(Buffer.from(second),Buffer.from(wire),'Fresh salt and ephemeral ECDH key for every delivery');
});

test('Web Push size ceiling includes the binary header, delimiter and authentication tag',async()=>{
  const ua=receiver();const payload=Buffer.alloc(MAX_WEB_PUSH_PAYLOAD_BYTES,65);
  const wire=await encryptWebPush(payload,ua.keys);
  assert.equal(wire.length,4096);
  assert.deepEqual(ua.decrypt(wire),payload);
  await assert.rejects(encryptWebPush(Buffer.alloc(MAX_WEB_PUSH_PAYLOAD_BYTES+1),ua.keys),/too large/);
});

test('VAPID private scalars are imported with JWK and produce independently verified ES256 JWTs',async()=>{
  const keys=vapid();const sign=await vapidSigner(keys.public,keys.private,keys.subject);
  verifyVapid(`vapid t=${await sign('https://fcm.googleapis.com')},k=${keys.public}`,keys,'https://fcm.googleapis.com');
  const other=vapid();
  await assert.rejects(vapidSigner(other.public,keys.private,keys.subject));
  await assert.rejects(vapidSigner(keys.public,base64url(new Uint8Array(31)),keys.subject));
  await assert.rejects(vapidSigner(keys.public,keys.private,'not-a-contact'));
});

test('push transport accepts documented HTTPS providers and rejects local, lookalike and unsafe URLs',()=>{
  for(const endpoint of ['https://fcm.googleapis.com/fcm/send/synthetic','https://fcm.googleapis.com/wp/synthetic','https://updates.push.services.mozilla.com/wpush/v2/synthetic','https://web.push.apple.com/synthetic','https://wns2-bl2p.notify.windows.com/w/?token=synthetic']) assert.equal(safePushEndpoint(endpoint).protocol,'https:');
  for(const endpoint of ['http://fcm.googleapis.com/fcm/send/x','https://fcm.googleapis.com.evil.invalid/fcm/send/x','https://127.0.0.1/x','https://[::1]/x','https://localhost/x','https://2130706433/x','https://169.254.169.254/latest/meta-data','https://user:password@fcm.googleapis.com/fcm/send/x','https://fcm.googleapis.com:8443/fcm/send/x','https://fcm.googleapis.com/fcm/send/x#fragment','https://evil.invalid/?target=fcm.googleapis.com','https://fcm.googleapis.com\\@evil.invalid/fcm/send/x','https://fcm.googleapis.com/other']) assert.throws(()=>safePushEndpoint(endpoint),endpoint);
  assert.throws(()=>validateSubscriptionKeys({p256dh:'bad-key',auth:'bad-key'}));
});

const source=readFileSync(new URL('../../../supabase/functions/push-notify/index.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const sid='11111111-1111-4111-8111-111111111111',otherSid='22222222-2222-4222-8222-222222222222',company='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fixture(options={}) {
  let serve;const keys=vapid();const ua=receiver();
  const calls={fetches:[],filters:[],auth:0,active:0,maxActive:0};
  const subs=options.subscriptions??[{id:'sub-1',supervisor_id:sid,endpoint:'https://fcm.googleapis.com/fcm/send/synthetic',...ua.keys}];
  const caller={role:'admin',company_id:company,is_active:true,...options.caller};
  const admin={
    auth:{getUser:async()=>{calls.auth++;return{data:{user:options.invalidIdentity?null:{id:'admin-user'}},error:options.invalidIdentity?{code:'bad-jwt'}:null};}},
    from(table){
      const filters=[];let limit;
      const query={
        select(){return query;},eq(key,value){filters.push([key,value]);return query;},in(key,value){filters.push([key,value]);return query;},order(){return query;},limit(value){limit=value;return query;},
        maybeSingle:async()=>({data:caller,error:options.callerError??null}),
        then(resolve,reject){
          calls.filters.push({table,filters,limit});
          const result=table==='supervisors'?{data:options.recipients??[{id:sid}],error:options.recipientError??null}:{data:subs,error:options.subscriptionError??null};
          return Promise.resolve(result).then(resolve,reject);
        },
      };return query;
    },
  };
  const environment={SUPABASE_URL:'https://review.invalid',SUPABASE_ANON_KEY:'synthetic-browser-key',SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-key',VAPID_PUBLIC_KEY:keys.public,VAPID_PRIVATE_KEY:keys.private,VAPID_SUBJECT:keys.subject,ALLOWED_ORIGIN:'https://mydan.digityoucan.com',...options.environment};
  vm.runInNewContext(compiled,{
    Deno:{env:{get:name=>environment[name]},serve:fn=>{serve=fn;}},createClient:()=>admin,
    encryptWebPush,MAX_WEB_PUSH_PAYLOAD_BYTES,safePushEndpoint,validateSubscriptionKeys,vapidSigner,
    TextEncoder,TextDecoder,Response,URL,AbortSignal,console,
    fetch:async(url,init)=>{
      calls.fetches.push({url,init});calls.active++;calls.maxActive=Math.max(calls.maxActive,calls.active);
      try {
        assert.equal(init.redirect,'error');assert.equal(init.headers['Content-Encoding'],'aes128gcm');
        assert.ok(init.signal instanceof AbortSignal);
        verifyVapid(init.headers.Authorization,keys,new URL(url).origin);
        assert.deepEqual(JSON.parse(ua.decrypt(init.body)),{title:'متابعة',body:'زيارة صناعية'});
        if(options.transport)return await options.transport(url,init);
        return new Response(null,{status:options.providerStatus??201});
      } finally {calls.active--;}
    },
  });
  return{calls,keys,ua,invoke:(body={supervisorIds:[sid],title:'متابعة',body:'زيارة صناعية'},request={})=>serve(new Request('https://review.invalid/push',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json',...request.headers},body:JSON.stringify(body),...request}))};
}

test('the handler verifies encrypted delivery and scopes both membership and subscriptions to the caller company',async()=>{
  const f=fixture();const response=await f.invoke();assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{sent:1,accepted:1,total:1,failed:0,expired:0});assert.equal(f.calls.fetches.length,1);
  const membership=f.calls.filters.find(c=>c.table==='supervisors');assert.ok(membership.filters.some(([k,v])=>k==='company_id'&&v===company));assert.ok(membership.filters.some(([k,v])=>k==='is_active'&&v===true));
  const subscriptions=f.calls.filters.find(c=>c.table==='push_subscriptions');assert.ok(subscriptions.filters.some(([k,v])=>k==='company_id'&&v===company));assert.equal(subscriptions.limit,201);
});

test('inactive, non-admin, unscoped and invalid callers cannot query subscriptions or send push',async()=>{
  for(const options of [{caller:{role:'supervisor'}},{caller:{role:'branch_manager'}},{caller:{role:null}},{caller:{company_id:null}},{caller:{is_active:false}},{callerError:{code:'42501'}},{invalidIdentity:true}]){
    const f=fixture(options);assert.ok([401,403].includes((await f.invoke()).status));assert.equal(f.calls.filters.length,0);assert.equal(f.calls.fetches.length,0);
  }
});

test('foreign/inactive recipients, membership failures and subscription failures do not become false sent-zero successes',async()=>{
  for(const [options,expected,ids] of [[{recipients:[]},403,[otherSid]],[{recipients:[{id:sid}]},403,[sid,otherSid]],[{recipientError:{code:'42501'}},503,[sid]],[{subscriptionError:{code:'42501'}},503,[sid]]]){
    const f=fixture(options);assert.equal((await f.invoke({supervisorIds:ids,title:'متابعة',body:'زيارة صناعية'})).status,expected);assert.equal(f.calls.fetches.length,0);
  }
});

test('unsafe subscription endpoints never receive fetch calls even if inserted into a scoped database row',async()=>{
  for(const endpoint of ['https://127.0.0.1/private','https://fcm.googleapis.com.evil.invalid/fcm/send/x','http://169.254.169.254/latest/meta-data']){
    const f=fixture({subscriptions:[{id:'bad',supervisor_id:sid,endpoint,p256dh:'bad',auth:'bad'}]});const response=await f.invoke();assert.equal(response.status,502);assert.equal((await response.json()).accepted,0);assert.equal(f.calls.fetches.length,0);
  }
});

test('provider rejection, expired subscriptions and network failures are reported without claiming device delivery',async()=>{
  for(const options of [{providerStatus:410},{providerStatus:503},{transport:async()=>{throw new Error('synthetic network failure');}}]){
    const f=fixture(options);const response=await f.invoke();assert.equal(response.status,502);const body=await response.json();assert.equal(body.accepted,0);assert.equal(body.failed,1);assert.equal(body.expired,options.providerStatus===410?1:0);
  }
  const f=fixture({transport:async()=>({ok:true,status:201,body:{cancel:async()=>{throw new Error('already closed');}}})});assert.equal((await f.invoke()).status,200);
});

test('empty subscriptions are explicit, invalid configuration is rejected and batches are bounded',async()=>{
  const empty=fixture({subscriptions:[]});assert.deepEqual(await(await empty.invoke()).json(),{sent:0,accepted:0,total:0,failed:0,expired:0});
  for(const environment of [{VAPID_PRIVATE_KEY:undefined},{VAPID_PUBLIC_KEY:undefined},{VAPID_SUBJECT:undefined},{VAPID_PRIVATE_KEY:'invalid-key'}]){
    const f=fixture({environment});assert.equal((await f.invoke()).status,503);assert.equal(f.calls.fetches.length,0);
  }
  const huge=fixture({subscriptions:Array.from({length:201},(_,id)=>({id,endpoint:'https://fcm.googleapis.com/fcm/send/'+id}))});assert.equal((await huge.invoke()).status,413);assert.equal(huge.calls.fetches.length,0);
  const bad=fixture();assert.equal((await bad.invoke({supervisorIds:Array(101).fill(sid),title:'x',body:'y'})).status,400);assert.equal((await bad.invoke({supervisorIds:[sid],title:3,body:'y'})).status,400);assert.equal(bad.calls.fetches.length,0);
});

test('unknown origins and methods are rejected before Auth and request parsing',async()=>{
  const f=fixture();assert.equal((await f.invoke(undefined,{headers:{Origin:'https://unrelated.example.invalid'}})).status,403);assert.equal(f.calls.auth,0);
  assert.equal((await f.invoke(undefined,{method:'PUT'})).status,405);assert.equal(f.calls.auth,0);
});

test('push batches deduplicate endpoints, cap concurrent sends, and report partial provider acceptance',async()=>{
  const subscriptions=[];
  const f=fixture({subscriptions,transport:async url=>{
    await new Promise(resolve=>setTimeout(resolve,10));
    return new Response(null,{status:url.endsWith('/rejected')?503:201});
  }});
  for(let i=0;i<7;i++)subscriptions.push({id:'sub-'+i,supervisor_id:sid,endpoint:'https://fcm.googleapis.com/fcm/send/synthetic-'+i,...f.ua.keys});
  subscriptions.push({id:'rejected',supervisor_id:sid,endpoint:'https://fcm.googleapis.com/fcm/send/rejected',...f.ua.keys});
  subscriptions.push({...subscriptions[0],id:'duplicate-device'});
  const response=await f.invoke();assert.equal(response.status,207);
  assert.deepEqual(await response.json(),{sent:7,accepted:7,total:8,failed:1,expired:0});
  assert.equal(f.calls.fetches.length,8);
  assert.ok(f.calls.maxActive>1 && f.calls.maxActive<=4,'Bounded worker pool, not unbounded Promise.all');
});
