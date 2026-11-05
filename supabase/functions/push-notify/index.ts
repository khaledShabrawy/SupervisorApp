import { withClientCors } from '../_shared/client-cors.ts';
import { corsHeaders as sdkCorsHeaders } from 'npm:@supabase/supabase-js@2.117.2/cors';
import { verifiedTokenSession } from '../_shared/encoding.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import webpush from 'npm:web-push@3.6.7';
import { permittedPushEndpoint } from '../_shared/authorization.ts';
const cors = sdkCorsHeaders;
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(withClientCors(async req => {
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  if(req.method!=='POST') return json(405,{error:'method not allowed'});
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
  const identity=token?await admin.auth.getUser(token):null;
  if(!identity?.data.user) return json(401,{error:'unauthorized'});
  const profile=await admin.from('supervisors').select('id,company_id,role,is_active,force_password_change').eq('user_id',identity.data.user.id).maybeSingle();
  const caller=profile.data;
  if(profile.error || !caller?.is_active || caller.force_password_change || !['admin','super_admin'].includes(caller.role)) return json(403,{error:'forbidden'});
  const sid=verifiedTokenSession(token!);
  if(!sid) return json(403,{error:'Session identity required'});
  const ready=await admin.rpc('mdn_identity_ready_v1',{p_user_id:identity.data.user.id,p_session_id:sid});
  if(ready.error || ready.data!==true) return json(403,{error:'session unavailable'});
  const company=await admin.from('companies').select('is_active,expires_at').eq('id',caller.company_id).single();
  if(company.error || !company.data.is_active || (company.data.expires_at && Date.parse(company.data.expires_at)<=Date.now())) return json(403,{error:'company unavailable'});
  let body;try{body=await req.json();}catch{return json(400,{error:'invalid JSON'});}
  const ids=Array.isArray(body.supervisorIds)?body.supervisorIds:[body.supervisor_id];
  if(!ids.length || ids.length>500 || !ids.every((id:unknown)=>typeof id==='string' && /^[0-9a-f-]{36}$/i.test(id)) || typeof body.title!=='string' || !body.title.trim() || body.title.length>120 || typeof body.body!=='string' || body.body.length>1000) return json(400,{error:'invalid notification'});
  const target=await admin.from('supervisors').select('id').in('id',ids).eq('company_id',caller.company_id).eq('is_active',true);
  if(target.error || !target.data?.length) return json(404,{error:'target unavailable'});
  const publicKey=Deno.env.get('VAPID_PUBLIC_KEY'),privateKey=Deno.env.get('VAPID_PRIVATE_KEY');
  if(!publicKey || !privateKey) return json(503,{error:'push not configured'});
  // Endpoint allowlist blocks the service-role function from sending requests to arbitrary hosts.
  const subscriptions=await admin.from('push_subscriptions').select('id,endpoint,p256dh,auth').in('supervisor_id',target.data.map((s:{id:string})=>s.id)).eq('company_id',caller.company_id);
  if(subscriptions.error) return json(500,{error:'could not read subscriptions'});
  let delivered=0,failed=0;
  for(const sub of subscriptions.data ?? []) {
    if(!permittedPushEndpoint(sub.endpoint)){failed++;continue;}
    try {
      await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify({title:'ميدان',body:'لديك إشعار جديد. افتح التطبيق لعرضه.',url:'./notifications'}),{
        vapidDetails:{subject:Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@mydan.app',publicKey,privateKey},timeout:10_000,TTL:3600,contentEncoding:'aes128gcm',
      });delivered++;
    }catch(error){
      failed++;
      const status=(error as {statusCode?:number}).statusCode;
      if(status===404 || status===410) {
        const cleanup=await admin.from('push_subscriptions').delete().eq('id',sub.id).eq('company_id',caller.company_id);
        if(cleanup.error) console.error('Could not remove expired push subscription');
      }
    }
  }
  return json(failed?207:200,{success:failed===0,delivered,failed});
},Deno.env.get('ALLOWED_ORIGIN') ?? 'https://mydan.digityoucan.com',sdkCorsHeaders));
