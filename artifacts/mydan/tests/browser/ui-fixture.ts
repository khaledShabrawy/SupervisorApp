import type { Page } from '@playwright/test';
export const uiId = (n:number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export async function setupUI(page:Page, role='admin') {
 const company=uiId(1),uid=uiId(104);
 const user={id:uid,email:'design@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
 const token=`${btoa('{"alg":"HS256","typ":"JWT"}')}.${btoa(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600,session_id:uiId(404)}))}.synthetic`;
 const session={access_token:token,refresh_token:'synthetic',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user};
 const profile={id:uiId(204),user_id:uid,company_id:company,role,full_name:'خالد محمود',phone:'01000000000',is_active:true,force_password_change:false,password_changed_at:new Date().toISOString(),device_id:null,branch_id:uiId(11),supervisor_code:'SUP-001'};
 const supervisors=[profile,{...profile,id:uiId(205),user_id:uiId(105),full_name:'أحمد محمد',role:'supervisor',supervisor_code:'SUP-002'}];
 const state={writes:[] as string[],kpiRequests:[] as Record<string,unknown>[],failAlerts:false,emptyTarget:false};
 await page.routeWebSocket('**/*',socket=>socket.close());
 await page.addInitScript(value=>localStorage.setItem('mydan-pwa-auth',JSON.stringify(value)),session);
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(url.origin==='http://127.0.0.1:5173')return route.continue();
  if(url.origin!=='https://mydan-test.invalid')return route.abort();
  const method=route.request().method();
  if(!['GET','HEAD','OPTIONS'].includes(method) && !path.includes('/rpc/'))state.writes.push(path);
  const send=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(path==='/auth/v1/user')return send(user);
  if(path==='/auth/v1/token')return send(session);
  if(path==='/rest/v1/supervisors')return send(url.searchParams.has('user_id')?profile:supervisors);
  if(path==='/rest/v1/companies')return send({id:company,name:'ميدان',is_active:true,expires_at:null,license_type:'standard',max_supervisors:25});
  if(path==='/rest/v1/app_settings')return send({id:company,company_id:company,app_name:'ميدان',logo_url:null,primary_color:'#1A56DB',success_color:'#108981',danger_color:'#EF4444',background_color:'#F8FAFC',geofence_radius_m:100,target_brand_name:'العلامة التجارية',competitor_brands:[],ai_audit_enabled:false});
  if(path==='/rest/v1/rpc/mdn_bind_device_v1')return send(true);
  if(path==='/rest/v1/rpc/mdn_admin_kpis_v1'){
   state.kpiRequests.push(route.request().postDataJSON());
   return send({supervisors:24,visitsToday:126,visitsAchieved:108,onBeatVisits:112,oorVisits:14,totalGeoVisits:126,geofenceRate:89,assets:340,openTickets:7,avgPss:78,audits30d:62,auditsAchieved:62,visitsTarget:state.emptyTarget?0:150,auditsTarget:state.emptyTarget?0:80,achievementRate:72});
  }
  if(path==='/rest/v1/regions')return send([{id:uiId(31),name:'القاهرة الكبرى',is_active:true}]);
  if(path==='/rest/v1/branches')return send([{id:uiId(11),name:'القاهرة',region_id:uiId(31),region:'القاهرة الكبرى',is_active:true}]);
  if(path==='/rest/v1/supervisor_permissions')return send(['new_visit','shelf_audit','competitor_products','field_survey','beat_plan','my_reports','notifications'].map(screen_key=>({screen_key,is_enabled:true})));
  if(path==='/rest/v1/notifications' && state.failAlerts)return send({message:'Synthetic alert service unavailable'},400);
  if(method==='HEAD')return route.fulfill({status:200,headers:{'content-range':'0-0/0'}});
  return send([]);
 });
 return state;
}
