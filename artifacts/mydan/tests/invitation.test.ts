import test from 'node:test';
import assert from 'node:assert/strict';
import {invitationHandler} from '../../../supabase/functions/invite-supervisor/handler.ts';
import {permittedPushEndpoint} from '../../../supabase/functions/_shared/authorization.ts';
function fixture(opts:{role?:string;targetRole?:string;contract?:boolean;emailFailure?:boolean}={}){
 const calls:{name:string;args:any}[]=[];
 const caller={id:'admin',company_id:'A',role:opts.role??'admin',is_active:true,force_password_change:false};
 const target={id:'target',company_id:'A',role:opts.targetRole??'supervisor',user_id:'target-user'};
 const admin:any={from:(table:string)=>{let targetQuery=false;const q:any={select:()=>q,eq:(key:string)=>{if(key==='id')targetQuery=true;return q;},maybeSingle:async()=>({data:table==='companies'?{is_active:true,expires_at:null}:targetQuery?target:caller,error:null})};return q;},
  rpc:async(name:string,args:any)=>{calls.push({name,args});return {data:name==='mdn_identity_ready_v1'?true:name==='mdn_security_contract_version_v1'?(opts.contract===false?null:1):'reservation',error:null};},
  auth:{getUser:async()=>({data:{user:{id:'caller'}}}),resetPasswordForEmail:async()=>{calls.push({name:'email',args:{}});return {error:opts.emailFailure?new Error('SMTP failed'):null};},admin:{
   inviteUserByEmail:async()=>({data:{user:null},error:new Error('synthetic rejected invite')}),getUserById:async()=>({data:{user:{id:'target-user',email:'fixture@example.test',app_metadata:{}}}}),
   updateUserById:async(_id:string,args:any)=>{calls.push({name:'password',args});return {error:null};},
  }}};
 return {calls,request:async(body:any)=>invitationHandler(admin,'https://mydan.example.test')(new Request('https://edge.example.test',{method:'POST',headers:{Authorization:`Bearer e30.${btoa(JSON.stringify({session_id:'00000000-0000-4000-8000-000000000404'}))}.synthetic`,'Content-Type':'application/json'},body:JSON.stringify(body)}))};
}
test('company admin cannot reset a platform administrator or peer admin',async()=>{
 for(const targetRole of ['super_admin','admin']){const f=fixture({targetRole});assert.equal((await f.request({action:'set_password',supervisor_id:'target',new_password:'synthetic-value'})).status,403);assert.equal(f.calls.filter(c=>c.name==='password').length,0);}
});
test('missing reviewed server contract refuses Auth mutations',async()=>{
 const f=fixture({contract:false});assert.equal((await f.request({action:'set_password',supervisor_id:'target',new_password:'synthetic-value'})).status,503);assert.equal(f.calls.filter(c=>c.name==='password').length,0);
});
test('protected company selection and redirect are enforced before provisioning',async()=>{
 const f=fixture();assert.equal((await f.request({company_id:'B'})).status,403);assert.equal((await f.request({redirect_to:'https://evil.example.test/set-password'})).status,400);assert.equal(f.calls.length,0);
 const platform=fixture({role:'super_admin'});await platform.request({company_id:'B',email:'fixture@example.test',full_name:'Synthetic'});
 assert.equal(platform.calls.find(c=>c.name==='mdn_reserve_invitation_v1')?.args.p_company_id,'B');
});
test('email provider errors are surfaced instead of reporting a delivered invitation',async()=>{
 const f=fixture({emailFailure:true});assert.equal((await f.request({action:'resend_invite',supervisor_id:'target'})).status,502);assert.equal(f.calls.filter(c=>c.name==='email').length,1);
});
test('temporary password preserves spaces and uses an Auth-admin-only forced-change marker',async()=>{
 const f=fixture();assert.equal((await f.request({action:'set_password',supervisor_id:'target',new_password:' synthetic password '})).status,200);
 const call=f.calls.find(c=>c.name==='password');assert.equal(call?.args.password,' synthetic password ');assert.equal(call?.args.app_metadata.mdn_admin_password_reset,true);
});
test('push endpoints restrict scheme, credentials and service hosts',()=>{
 assert.equal(permittedPushEndpoint('https://fcm.googleapis.com/fcm/send/synthetic'),true);
 for(const url of ['http://fcm.googleapis.com/a','https://fcm.googleapis.com.evil.test/a','https://127.0.0.1/a','https://user@web.push.apple.com/a','https://fcm.googleapis.com:8443/a'])assert.equal(permittedPushEndpoint(url),false);
});
