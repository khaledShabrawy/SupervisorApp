import {test,expect,type Page} from '@playwright/test';
const uid='00000000-0000-4000-8000-000000000104',company='00000000-0000-4000-8000-000000000001';
const user={id:uid,email:'fixture@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const token=()=>`${btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))}.${btoa(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600,session_id:'00000000-0000-4000-8000-000000000404'}))}.synthetic`;
const session=()=>({access_token:token(),refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user});
async function backend(page:Page,options:{stored?:boolean;expired?:boolean}={}){
 const state={confirmActions:false,actionIds:[] as string[],persistedBeforeSend:false,expiredPassword:false,settingsFailure:false,active:true,failProfile:false,force:false,bound:true,passwordWrites:0,profileWrites:0,unexpected:[] as string[]};
 await page.routeWebSocket('**/*', socket=>socket.close());
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin==='http://127.0.0.1:5173') return route.continue();
  if(url.origin!=='https://mydan-test.invalid') return route.abort();
  const path=url.pathname;
  const send=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(path==='/auth/v1/token') return send(session());
  if(path==='/auth/v1/logout') return send({});
  if(path==='/auth/v1/user'){
   if(route.request().method()==='PUT'){state.passwordWrites++;state.force=false;}return send(user);
  }
  if(path==='/rest/v1/supervisors'){
   if(route.request().method()!=='GET')state.profileWrites++;
   if(state.failProfile)return send({message:'synthetic temporary failure'},400);
   return send({id:'00000000-0000-4000-8000-000000000204',user_id:uid,company_id:company,role:'supervisor',full_name:'Fixture',is_active:state.active,force_password_change:state.force,password_changed_at:state.expiredPassword?'2020-01-01T00:00:00Z':new Date().toISOString(),device_id:null,branch_id:null});
  }
  if(path==='/rest/v1/rpc/mdn_apply_offline_action_v1'){
   const body=route.request().postDataJSON();state.actionIds.push(body.p_action_id);
   state.persistedBeforeSend=await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>(resolve=>{const req=indexedDB.open('mydan-local-work-v2');req.onsuccess=()=>resolve(req.result);});
    const count=await new Promise<number>(resolve=>{const req=db.transaction('actions').objectStore('actions').count();req.onsuccess=()=>resolve(req.result);});db.close();return count>0;
   });
   return send(state.confirmActions);
  }
  if(path==='/rest/v1/customers')return send({id:'00000000-0000-4000-8000-000000000501',name:'Fixture customer',company_id:company,is_active:true,latitude:30,longitude:31});
  if(['/rest/v1/visits','/rest/v1/shelf_audit','/rest/v1/competitor_products'].includes(path))return send([]);
  if(path==='/rest/v1/rpc/mdn_bind_device_v1')return send(state.bound);
  if(path==='/rest/v1/companies')return send({id:company,name:'Fixture company',is_active:true,expires_at:null,license_type:'standard',max_supervisors:20});
  if(path==='/rest/v1/app_settings' && state.settingsFailure)return send({message:'synthetic unavailable settings'},400);
  if(path==='/rest/v1/app_settings')return send({password_expiry_enabled:state.expiredPassword,password_expiry_days:90,id:company,company_id:company,app_name:'Fixture Mydan',primary_color:'#1A56DB',success_color:'#108981',danger_color:'#EF4444',background_color:'#F8FAFC',geofence_radius_m:100,target_brand_name:'Fixture',competitor_brands:[],ai_audit_enabled:false});
  if(path==='/rest/v1/notifications')return send([]);
  if(path==='/rest/v1/supervisor_permissions')return send([{screen_key:'new_visit',is_enabled:true}]);
  state.unexpected.push(path);return send({message:'Unexpected test request'},400);
 });
 await page.addInitScript(({stored,expired,serialized})=>{
  if(stored)localStorage.setItem('mydan-pwa-auth',serialized);
  if(expired)localStorage.setItem('mydan_last_activity_timestamp',String(Date.now()-16*3600000));
 },{stored:options.stored,expired:options.expired,serialized:JSON.stringify(session())});
 return state;
}
test('cold expired session keeps listener active: sign in, revalidation failure, recover, sign out',async({page})=>{
 const state=await backend(page,{stored:true,expired:true});await page.goto('/tests/browser/auth-harness.html');
 await expect(page.getByTestId('identity')).toHaveText('signed-out');
 await page.getByRole('button',{name:'sign in',exact:true}).click();await expect(page.getByTestId('identity')).toHaveText('Fixture:false');
 state.failProfile=true;await page.getByRole('button',{name:'revalidate'}).click();await expect(page.getByTestId('identity')).toHaveText('signed-out');await expect(page.getByTestId('error')).not.toBeEmpty();
 state.failProfile=false;await page.getByRole('button',{name:'revalidate'}).click();await expect(page.getByTestId('identity')).toHaveText('Fixture:false');
 state.active=false;await page.getByRole('button',{name:'refresh token'}).click();await expect(page.getByTestId('identity')).toHaveText('signed-out');
 await page.getByRole('button',{name:'sign out',exact:true}).click();await expect.poll(()=>page.evaluate(()=>localStorage.getItem('mydan-pwa-auth'))).toBeNull();
 expect(state.profileWrites).toBe(0);expect(state.unexpected).toEqual([]);
});
test('false device registration blocks the actual application shell',async({page})=>{
 const state=await backend(page,{stored:true});state.bound=false;await page.goto('/visits');
 await expect(page.getByRole('alert')).toContainText('تعذر اعتماد الجهاز');await expect(page.getByText('تسجيل زيارة',{exact:true})).toHaveCount(0);
 expect(state.unexpected).toEqual([]);
});
test('forced-password flow changes Auth password and reloads trusted profile without direct profile writes',async({page})=>{
 const state=await backend(page,{stored:true});state.force=true;await page.goto('/orders');
 await expect(page).toHaveURL(/set-password/);
 const inputs=page.locator('input[type="password"]');await inputs.nth(0).fill('synthetic-new-password');await inputs.nth(1).fill('synthetic-new-password');
 await page.getByRole('button',{name:'حفظ ومتابعة'}).click();await expect.poll(()=>state.passwordWrites).toBe(1);await expect(page).not.toHaveURL(/set-password/);
 expect(state.profileWrites).toBe(0);
});
test('legacy sales URLs are unreachable and do not query orders or prices',async({page})=>{
 const state=await backend(page,{stored:true});await page.goto('/orders/new');await expect(page.getByText('هذه الصفحة غير موجودة',{exact:true})).toBeVisible();
 expect(state.unexpected.filter(p=>/orders|price_list/.test(p))).toEqual([]);
});

test('unavailable company settings block the app instead of applying permissive defaults',async({page})=>{
 const state=await backend(page,{stored:true});state.settingsFailure=true;await page.goto('/visits');
 await expect(page.getByRole('alert')).toContainText('تعذر تحميل هوية الشركة');
 expect(state.unexpected).toEqual([]);
});
test('enabled password expiry routes to password change before field execution',async({page})=>{
 const state=await backend(page,{stored:true});state.expiredPassword=true;await page.goto('/visits');
 await expect(page).toHaveURL(/set-password/);await expect(page.getByRole('button',{name:'حفظ ومتابعة'})).toBeVisible();
 expect(state.passwordWrites).toBe(0);expect(state.profileWrites).toBe(0);
});

test('a new visit persists before sending; unconfirmed receipt stays queued and replay reuses the same operation',async({page})=>{
 const state=await backend(page,{stored:true});
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:(success:any)=>success({timestamp:Date.now(),coords:{latitude:30,longitude:31,accuracy:5}})}});
 });
 await page.goto('/visits/new?customer=00000000-0000-4000-8000-000000000501');
 await expect(page.getByTestId('button-start-visit')).toBeEnabled();await page.getByTestId('button-start-visit').click();
 await expect(page).toHaveURL(/\/visits$/);await expect(page.getByTestId('btn-sync-up')).toContainText('1');
 expect(state.persistedBeforeSend).toBe(true);expect(state.actionIds.length).toBe(1);
 state.confirmActions=true;await page.getByTestId('btn-sync-up').click();
 await expect(page.getByTestId('btn-sync-up')).not.toContainText('1');
 expect(state.actionIds.length).toBe(2);expect(new Set(state.actionIds).size).toBe(1);
 expect(state.unexpected).toEqual([]);
});

test('a fresh recovery callback survives the previous session inactivity timeout',async({page})=>{
 const state=await backend(page,{expired:true});state.force=true;
 const hash=new URLSearchParams({access_token:token(),refresh_token:'fixture-refresh',expires_in:'3600',token_type:'bearer',type:'recovery'});
 await page.goto('/set-password#'+hash.toString());
 await expect(page.getByRole('button',{name:'حفظ ومتابعة'})).toBeVisible();
 const inputs=page.locator('input[type="password"]');await inputs.nth(0).fill('synthetic-recovered-password');await inputs.nth(1).fill('synthetic-recovered-password');
 await page.getByRole('button',{name:'حفظ ومتابعة'}).click();await expect.poll(()=>state.passwordWrites).toBe(1);
 expect(state.profileWrites).toBe(0);
});


test('logout removes local authorization promptly even if push unsubscribe never resolves', async ({page}) => {
  const state=await backend(page,{stored:true});
  await page.addInitScript(()=>{
    Object.defineProperty(navigator.serviceWorker,'getRegistration',{value:async()=>({pushManager:{getSubscription:async()=>({endpoint:'https://push.example.test/old',unsubscribe:()=>new Promise(()=>{})})}})});
  });
  await page.goto('/tests/browser/auth-harness.html');
  await expect(page.getByTestId('identity')).toHaveText('Fixture:false');
  await page.getByRole('button',{name:'sign out',exact:true}).click();
  await expect(page.getByTestId('identity')).toHaveText('signed-out',{timeout:1000});
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('mydan-pwa-auth')),{timeout:6500}).toBeNull();
  await page.getByRole('button',{name:'sign in',exact:true}).click();
  await expect(page.getByTestId('identity')).toHaveText('Fixture:false');
  expect(state.unexpected).toEqual([]);
});
