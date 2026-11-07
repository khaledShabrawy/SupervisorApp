// Optional browser regression suite. See scripts/testing/README.md for local setup.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.REVIEW_BASE_URL || 'http://127.0.0.1:5174';
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Review tests require a loopback server');
const output = process.env.REVIEW_OUTPUT_DIR || '/tmp/mydan-review-fixes';
fs.mkdirSync(output, { recursive: true });
const uid='11111111-1111-4111-8111-111111111111', sid='22222222-2222-4222-8222-222222222222', cid='33333333-3333-4333-8333-333333333333';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'review@example.invalid',app_metadata:{},user_metadata:{}};
const jwt='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'+Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'})).toString('base64url')+'.synthetic';
const customerId='44444444-4444-4444-8444-444444444444', productId='55555555-5555-4555-8555-555555555555', visitId='66666666-6666-4666-8666-666666666666', taskId='77777777-7777-4777-8777-777777777777';
const session={access_token:jwt,refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user};
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const results=[];
 async function fixture(options={}) {
  const state={settingsError:false,subscriptionError:false,bindError:false,forceChange:false,permissions:[],...options};
  const c=await browser.newContext({viewport:{width:390,height:844}, ...(state.seeded ? {geolocation:{latitude:30.0444,longitude:31.2357,accuracy:20},permissions:['geolocation']} : {})});
  const customer={id:customerId,company_id:cid,supervisor_id:sid,name:'عميل اختبار صناعي',customer_type:'retail',type:'بقالة',address:'عنوان اختبار',latitude:30.0444,longitude:31.2357,is_active:true};
  state.orders=[];
  await c.addInitScript(({session,authenticated})=>{localStorage.setItem('mydan_device_uuid','review-device');if(authenticated)localStorage.setItem('mydan-pwa-auth',JSON.stringify(session));},{session,authenticated:options.authenticated??true});
  const writes=[];const requests=[];
  await c.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.origin===new URL(base).origin)return route.continue();
   if(u.hostname!=='review.invalid')return route.abort();
   requests.push({path:u.pathname,select:u.searchParams.get('select'),method:req.method()});
   let data=[],status=200;const headers={'content-type':'application/json','content-range':'0-0/0','access-control-allow-origin':'*','access-control-expose-headers':'Content-Range'};
   const profile={id:sid,user_id:uid,company_id:cid,full_name:'مستخدم المراجعة',role:state.role||'supervisor',is_active:true,device_id:state.deviceUnbound?null:'review-device',force_password_change:state.forceChange,password_changed_at:state.passwordChangedAt??null};
   if(!['GET','HEAD'].includes(req.method()))writes.push({path:u.pathname,body:req.postDataJSON()});
   if(u.pathname.includes('/auth/v1/token')) {if(state.invalidLogin){status=400;data={code:'invalid_credentials',msg:'Invalid login credentials'};}else data=session;}
   else if(u.pathname.includes('/auth/v1/user')){data=user;if(req.method()==='PUT'&&req.postDataJSON()?.password&&!state.passwordNoAck){state.forceChange=false;state.passwordChangedAt=new Date().toISOString();}}
   else if(u.pathname.includes('/auth/v1/'))data={};
   else if(u.pathname.includes('/rpc/mdn_bind_device_v1')){status=state.bindError?403:200;data=state.bindError?{message:'binding denied'}:null;if(!state.bindError)state.deviceUnbound=false;}
   else if(u.pathname.includes('/supervisors')) {if(req.method()==='PATCH')state.forceChange=false;data={...profile,device_id:state.deviceUnbound?null:'review-device',force_password_change:state.forceChange,password_changed_at:state.passwordChangedAt??null};}
   else if(u.pathname.includes('/app_settings')){status=state.settingsError?500:200;data=state.settingsError?{message:'forced failure'}:{id:'settings',company_id:cid,app_name:'ميدان',primary_color:'#1A56DB',success_color:'#108981',danger_color:'#EF4444',background_color:'#F8FAFC',geofence_radius_m:150,target_brand_name:'ميدان',competitor_brands:[],ai_audit_enabled:true};}
   else if(u.pathname.includes('/companies')){status=state.subscriptionError?500:200;data=state.subscriptionError?{message:'forced failure'}:{id:cid,name:'شركة الاختبار',is_active:true,expires_at:'2099-01-01'};}
   else if(state.seeded && u.pathname.includes('/rest/v1/attendance')) {
    if(req.method()==='POST')state.attendance={...req.postDataJSON(),id:req.postDataJSON().id || 'attendance-test'};
    if(req.method()==='PATCH')state.attendance={...state.attendance,...req.postDataJSON()};
    data=req.headers()['accept']?.includes('object') ? state.attendance??null : state.attendance?[state.attendance]:[];
   }
   else if(state.seeded && u.pathname.includes('/rest/v1/customers'))data=req.headers()['accept']?.includes('object')?customer:[customer];
   else if(state.seeded && u.pathname.includes('/rest/v1/products'))data=[{id:productId,name:'منتج اختبار صناعي',company_id:cid,price:25,is_active:true,unit:'قطعة'}];
   else if(state.seeded && u.pathname.includes('/rest/v1/visit_tasks')){
    const task=state.visit?.visit_tasks?.[0];
    if(req.method()==='PATCH' && task){task.is_completed=true;task.completed_at=new Date().toISOString();}
    const row=task?{...task,visit_id:state.visit.id,company_id:cid}:null;
    data=req.headers()['accept']?.includes('object')?row:row?[row]:[];
   }
   else if(state.dashboardError && u.pathname.includes('/rest/v1/visits')) {status=403;data={code:'42501',message:'synthetic count/read denied'};}
   else if(state.seeded && u.pathname.includes('/rest/v1/visits')) {
    if(req.method()==='POST')state.visit={...req.postDataJSON(),id:req.postDataJSON().id || visitId,customers:customer,visit_tasks:[{id:taskId,task_type:'other',title_ar:'مراجعة العرض',is_completed:false,is_mandatory:true,order_num:1}]};
    if(req.method()==='PATCH')state.visit={...state.visit,...req.postDataJSON()};
    headers['content-range']=state.visit?'0-0/1':'0-0/0';
    data=req.headers()['accept']?.includes('object')?state.visit??null:state.visit?[state.visit]:[];
    const after=u.searchParams.get('id');if(Array.isArray(data)&&after?.startsWith('gt.'))data=data.filter(row=>row.id>after.slice(3));
   }
   else if(state.seeded && u.pathname.includes('/rest/v1/orders')) {
    if(req.method()==='POST')state.orders.push({...req.postDataJSON(),id:req.postDataJSON().id || 'order-test',customers:customer});
    data=req.headers()['accept']?.includes('object') ? state.orders.at(-1)??null : state.orders;
   }
   else if(u.pathname.includes('/supervisor_permissions'))data=state.permissions;
   else if(req.headers()['accept']?.includes('object'))data=null;
   if(req.method()==='HEAD')return route.fulfill({status,headers,body:''});
   await route.fulfill({status,headers,body:JSON.stringify(data)});
  });
  const p=await c.newPage();p.setDefaultTimeout(12000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  return {c,p,state,writes,requests,errors};
 }
 async function run(name,fn){
  if(process.env.REVIEW_CASE_FILTER&&!new RegExp(process.env.REVIEW_CASE_FILTER).test(name))return;
  try{await fn();results.push(name);console.log('PASS '+name);}
  catch(error){const p=browser.contexts().at(-1)?.pages().at(-1);if(p){await p.screenshot({path:path.join(output,'failed-scenario.png'),fullPage:true});console.log('Synthetic failure page: '+(await p.locator('body').innerText()).slice(0,1200));}throw error;}
 }
 try {
  await run('anonymous login, validation, password toggle, labels, recovery form and mobile/desktop layout',async()=>{
   const f=await fixture({authenticated:false,invalidLogin:true});const {p,c}=f;
   await p.goto(base+'/');await p.getByTestId('input-email').waitFor();assert.match(p.url(),/\/login$/);
   await p.getByTestId('input-email').fill('review@example.invalid');await p.getByTestId('input-password').fill('synthetic123');
   await p.getByRole('button',{name:'إظهار كلمة المرور'}).click();assert.equal(await p.getByTestId('input-password').getAttribute('type'),'text');
   await p.getByTestId('button-login').click();await p.getByRole('alert').waitFor();assert.match(await p.getByRole('alert').innerText(),/غير صحيحة/);
   for(const width of [390,1440]){await p.setViewportSize({width,height:900});await p.waitForTimeout(550);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:path.join(output,`login-${width}.png`),fullPage:true});}
   await p.getByRole('button',{name:'نسيت كلمة المرور؟'}).click();assert.equal(await p.locator('#recovery-email').evaluate(e=>e.labels.length),1);
   await p.getByRole('button',{name:'إرسال رابط الاستعادة'}).click();await p.getByText('تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني بنجاح.').waitFor();
   assert.equal(f.errors.length,0);await c.close();
  });
  await run('fresh recovery link retains its session and opens password form',async()=>{
   const {c,p}=await fixture({authenticated:false});
   await p.goto(base+'/set-password#access_token='+jwt+'&refresh_token=synthetic&expires_in=3600&token_type=bearer&type=recovery');
   await p.getByRole('button',{name:'حفظ ومتابعة'}).waitFor();assert.equal(await p.locator('input[type=password]').count(),2);await c.close();
  });
  await run('forced password change is loaded, saved and refreshed before navigation',async()=>{
   const f=await fixture({forceChange:true});const {c,p}=f;await p.goto(base+'/');await p.getByRole('button',{name:'حفظ ومتابعة'}).waitFor();assert.match(p.url(),/set-password/);
   await p.getByLabel('كلمة المرور الجديدة',{exact:true}).fill('synthetic-new123');await p.getByLabel('تأكيد كلمة المرور',{exact:true}).fill('synthetic-new123');await p.getByRole('button',{name:'حفظ ومتابعة'}).click();await p.getByTestId('sync-action-bar').waitFor();assert.equal(f.state.forceChange,false);assert.ok(f.requests.some(r=>r.select?.includes('force_password_change')));await c.close();
  });
  await run('missing screen grant is denied; explicit grant enables field survey',async()=>{
   const f=await fixture();await f.p.goto(base+'/field-survey');await f.p.getByText('هذه الشاشة غير مفعّلة لحسابك').waitFor();await f.c.close();
   const g=await fixture({permissions:[{screen_key:'field_survey',is_enabled:true}]});await g.p.goto(base+'/field-survey');await g.p.getByText('التقط صورة الصف').waitFor();await g.c.close();
  });
  await run('settings failure blocks operations and retry recovers',async()=>{
   const f=await fixture({settingsError:true});await f.p.goto(base+'/');await f.p.getByRole('heading',{name:'تعذر تحميل هوية الشركة'}).waitFor();assert.equal(await f.p.getByTestId('sync-action-bar').count(),0);f.state.settingsError=false;await f.p.getByRole('button',{name:'إعادة المحاولة'}).click();await f.p.getByTestId('sync-action-bar').waitFor();await f.c.close();
  });
  await run('binding rejection blocks operations and retry verifies the saved device',async()=>{
   const f=await fixture({deviceUnbound:true,bindError:true});await f.p.goto(base+'/');await f.p.getByText('تعذر تأكيد ربط هذا الجهاز. تحقق من الاتصال وأعد المحاولة.').waitFor();assert.equal(await f.p.getByTestId('sync-action-bar').count(),0);f.state.bindError=false;await f.p.getByRole('button',{name:'إعادة المحاولة'}).click();await f.p.getByTestId('sync-action-bar').waitFor();await f.c.close();
  });
  await run('subscription errors block operations and retry recovers',async()=>{
   const f=await fixture({subscriptionError:true});await f.p.goto(base+'/');await f.p.getByText('تعذر التحقق من اشتراك الشركة. تحقق من الاتصال وأعد المحاولة.').waitFor();assert.equal(await f.p.getByTestId('sync-action-bar').count(),0);f.state.subscriptionError=false;await f.p.getByRole('button',{name:'إعادة المحاولة'}).click();await f.p.getByTestId('sync-action-bar').waitFor();await f.c.close();
  });
  await run('concurrent upload keeps new actions, coalesces calls and preserves other tenants',async()=>{
   const f=await fixture();await f.p.goto(base+'/customers');await f.p.getByTestId('sync-action-bar').waitFor();
   let visits=0;await f.p.route('**/rest/v1/visits*',async r=>{const req=r.request();const id=new URL(req.url()).searchParams.get('id')?.replace(/^eq\./,'');let row={id,company_id:cid,supervisor_id:sid,status:'in_progress',check_out_time:null};if(req.method()==='PATCH'){visits++;await new Promise(resolve=>setTimeout(resolve,250));row={...row,...req.postDataJSON()};}await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(row)});});
   const r=await f.p.evaluate(async({cid,sid})=>{const m=await import('/src/lib/offline-sync.ts');m.clearOfflineQueue(cid,sid);const action=id=>({type:'update_visit_status',companyId:cid,supervisorId:sid,payload:{id,status:'completed'}});m.enqueueOfflineAction(action('original'));m.enqueueOfflineAction({...action('foreign'),companyId:'other-company'});const a=m.uploadPendingOfflineActions(cid,sid);const b=m.uploadPendingOfflineActions(cid,sid);await new Promise(r=>setTimeout(r,90));m.enqueueOfflineAction(action('new-during-upload'));const result=await a;await b;return{result,same:a===b,pending:m.getOfflineQueue(cid,sid).map(x=>x.payload.id),foreign:m.getOfflineQueue('other-company',sid).length};},{cid,sid});
   assert.equal(r.same,true);assert.equal(r.result.syncedCount,1);assert.deepEqual(r.pending,['new-during-upload']);assert.equal(r.foreign,1);assert.equal(visits,1);await f.c.close();
  });
  await run('cross-tab enqueues survive an upload in another tab',async()=>{
   const f=await fixture();await f.p.goto(base+'/customers');await f.p.getByTestId('sync-action-bar').waitFor();const second=await f.c.newPage();await second.goto(base+'/customers');await second.getByTestId('sync-action-bar').waitFor();
   await f.p.route('**/rest/v1/visits*',async r=>{const req=r.request();const id=new URL(req.url()).searchParams.get('id')?.replace(/^eq\./,'');let row={id,company_id:cid,supervisor_id:sid,status:'in_progress',check_out_time:null};if(req.method()==='PATCH'){await new Promise(resolve=>setTimeout(resolve,300));row={...row,...req.postDataJSON()};}await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(row)});});
   await f.p.evaluate(async({cid,sid})=>{const m=await import('/src/lib/offline-sync.ts');m.clearOfflineQueue(cid,sid);m.enqueueOfflineAction({type:'update_visit_status',companyId:cid,supervisorId:sid,payload:{id:'old',company_id:cid,status:'completed'}});},{cid,sid});
   const uploading=f.p.evaluate(async({cid,sid})=>(await import('/src/lib/offline-sync.ts')).uploadPendingOfflineActions(cid,sid),{cid,sid});await new Promise(r=>setTimeout(r,90));
   await second.evaluate(async({cid,sid})=>(await import('/src/lib/offline-sync.ts')).enqueueOfflineAction({type:'update_visit_status',companyId:cid,supervisorId:sid,payload:{id:'second-tab',company_id:cid,status:'completed'}}),{cid,sid});await uploading;
   const pending=await second.evaluate(async({cid,sid})=>(await import('/src/lib/offline-sync.ts')).getOfflineQueue(cid,sid).map(x=>x.payload.id),{cid,sid});assert.deepEqual(pending,['second-tab']);await f.c.close();
  });
  await run('rejected updates stay pending; local storage failure is surfaced',async()=>{
   const f=await fixture();await f.p.goto(base+'/customers');await f.p.getByTestId('sync-action-bar').waitFor();
   await f.p.route('**/rest/v1/visits*',r=>r.fulfill({status:406,contentType:'application/json',body:JSON.stringify({code:'PGRST116',message:'No updated row'})}));
   const result=await f.p.evaluate(async({cid,sid})=>{const m=await import('/src/lib/offline-sync.ts');m.clearOfflineQueue(cid,sid);m.enqueueOfflineAction({type:'set_visit_outcome',companyId:cid,supervisorId:sid,payload:{id:'missing',outcome:'متعامل'}});const result=await m.uploadPendingOfflineActions(cid,sid);const pending=m.getOfflineQueue(cid,sid).length;const original=Storage.prototype.setItem;let error='';Storage.prototype.setItem=function(key,value){if(key.startsWith('mydan_offline_queue_'))throw new DOMException('Quota exceeded','QuotaExceededError');return original.call(this,key,value)};try{m.enqueueOfflineAction({type:'set_visit_outcome',companyId:cid,supervisorId:sid,payload:{id:'new',outcome:'متعامل'}})}catch(e){error=e.message}finally{Storage.prototype.setItem=original}return{result,pending,error};},{cid,sid});
   assert.equal(result.result.failedCount,1);assert.equal(result.pending,1);assert.match(result.error,/تعذر حفظ العملية/);await f.c.close();
  });
  await run('CSV formulas are neutralized; confirmation traps and restores focus',async()=>{
   const f=await fixture();await f.p.goto(base+'/customers');await f.p.getByTestId('sync-action-bar').waitFor();
   const csv=await f.p.evaluate(async()=>{let blob;const old=URL.createObjectURL;URL.createObjectURL=b=>{blob=b;return old(b)};(await import('/src/lib/csv-export.ts')).exportToCsv('test.csv',[{key:'name',header:'Name'}],[{name:'=1+1'}]);return blob.text();});assert.match(csv,/'=1\+1/);
   await f.p.getByTestId('btn-sync-down').focus();await f.p.evaluate(async()=>{void (await import('/src/lib/confirm.ts')).confirm('تأكيد اختبار');});
   const dialog=f.p.getByRole('alertdialog');await dialog.waitFor();assert.equal(await f.p.getByRole('button',{name:'إلغاء',exact:true}).evaluate(e=>e===document.activeElement),true);
   await f.p.keyboard.press('Shift+Tab');assert.equal(await f.p.getByRole('button',{name:'تأكيد',exact:true}).evaluate(e=>e===document.activeElement),true);await f.p.keyboard.press('Tab');assert.equal(await f.p.getByRole('button',{name:'إلغاء',exact:true}).evaluate(e=>e===document.activeElement),true);await f.p.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await f.p.getByTestId('btn-sync-down').evaluate(e=>e===document.activeElement),true);await f.c.close();
  });
  await run('lost visit receipt retries the same identity without resetting a completed visit',async()=>{
   const f=await fixture();await f.p.goto(base+'/customers');await f.p.getByTestId('sync-action-bar').waitFor();
   let committed=null, attempts=0, patches=0, failRead=true;
   await f.p.route('**/rest/v1/visits*',async route=>{
     const req=route.request();
     if(req.method()==='POST'){
       attempts++;
       if(!committed){committed={...req.postDataJSON()};return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'synthetic lost response'})});}
       return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({code:'23505',message:'duplicate id'})});
     }
     if(req.method()==='PATCH')patches++;
     if(failRead)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'synthetic offline'})});
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(committed)});
   });
   const first=await f.p.evaluate(async({cid,sid,customerId})=>{const m=await import('/src/lib/offline-sync.ts');m.clearOfflineQueue(cid,sid);m.enqueueOfflineAction({type:'create_visit',companyId:cid,supervisorId:sid,payload:{customer_id:customerId,on_beat:true,check_in_time:'2026-11-05T10:00:00.000Z',visit_date:'2026-11-05'}});const result=await m.uploadPendingOfflineActions(cid,sid);return{result,pending:m.getOfflineQueue(cid,sid)};},{cid,sid,customerId});
   assert.equal(first.result.failedCount,1);assert.equal(first.pending.length,1);assert.equal(first.pending[0].payload.id,committed.id);
   committed.status='completed';failRead=false;
   const second=await f.p.evaluate(async({cid,sid})=>(await import('/src/lib/offline-sync.ts')).uploadPendingOfflineActions(cid,sid),{cid,sid});
   assert.equal(second.syncedCount,1);assert.equal(attempts,2);assert.equal(patches,0);assert.equal(committed.status,'completed');await f.c.close();
  });
  await run('attendance replay acknowledges an existing check-in without changing its original time',async()=>{
   const f=await fixture();await f.p.goto(base+'/customers');await f.p.getByTestId('sync-action-bar').waitFor();
   const existing={id:'77777777-7777-4777-8777-777777777777',company_id:cid,supervisor_id:sid,attendance_date:'2026-11-05',check_in_time:'2026-11-05T12:00:00+02:00'};let patches=0;
   await f.p.route('**/rest/v1/attendance*',route=>{
     if(route.request().method()==='PATCH')patches++;
     return route.fulfill({status:route.request().method()==='POST'?409:200,contentType:'application/json',body:JSON.stringify(route.request().method()==='POST'?{code:'23505',message:'existing day'}:existing)});
   });
   const result=await f.p.evaluate(async({cid,sid})=>{const m=await import('/src/lib/offline-sync.ts');m.clearOfflineQueue(cid,sid);m.enqueueOfflineAction({type:'attendance_action',companyId:cid,supervisorId:sid,payload:{kind:'in',attendance_date:'2026-11-05',check_in_time:'2026-11-05T10:00:00Z'}});return m.uploadPendingOfflineActions(cid,sid);},{cid,sid});
   assert.equal(result.syncedCount,1);assert.equal(patches,0);assert.equal(existing.check_in_time,'2026-11-05T12:00:00+02:00');await f.c.close();
  });
  await run('field journey: attendance, geofenced visit, mandatory task and checkout',async()=>{
   const f=await fixture({seeded:true,permissions:[{screen_key:'new_visit',is_enabled:true}]});const {p}=f;
   await p.goto(base+'/');await p.getByRole('button',{name:'تسجيل حضور',exact:true}).click();await p.getByRole('button',{name:'تأكيد الحضور',exact:true}).click();
   await p.getByRole('button',{name:'تسجيل انصراف',exact:true}).waitFor();assert.equal(f.state.attendance.check_in_lat,30.0444);assert.equal(f.state.attendance.check_in_lng,31.2357);
   await p.goto(base+'/visits/new?customer='+customerId);await p.getByTestId('button-start-visit').click();await p.getByTestId('outcome-متعامل').waitFor();
   assert.equal(f.state.visit.on_beat,true);assert.equal(f.state.visit.geo_distance,0);
   await p.getByTestId('outcome-متعامل').click();await p.getByRole('button',{name:'إنجاز المهمة: مراجعة العرض'}).click();
   await p.getByRole('button',{name:'إنجاز المهمة: مراجعة العرض'}).waitFor({state:'hidden'});assert.equal(f.state.visit.visit_tasks[0].is_completed,true);
   assert.equal(await p.getByTestId('button-quick-order').count(),0);assert.equal(f.requests.filter(r=>r.path.includes('/rest/v1/orders')).length,0);await p.getByTestId('button-check-out').click();await p.getByRole('alertdialog').getByRole('button',{name:'تأكيد',exact:true}).click();
   await p.waitForURL(base+'/visits');assert.equal(f.state.visit.status,'completed');assert.ok(f.state.visit.check_out_time);assert.equal(f.errors.length,0);await f.c.close();
  });
  await run('retired sales routes and queued actions never reach the sales API',async()=>{
   const f=await fixture();await f.p.goto(base+'/orders');await f.p.getByText('الصفحة غير موجودة',{exact:false}).waitFor();
   const result=await f.p.evaluate(async({cid,sid})=>{const m=await import('/src/lib/offline-sync.ts');m.clearOfflineQueue(cid,sid);m.enqueueOfflineAction({type:'save_order',companyId:cid,supervisorId:sid,payload:{id:'88888888-8888-4888-8888-888888888888'}});const r=await m.uploadPendingOfflineActions(cid,sid);return {r,pending:m.getOfflineQueue(cid,sid).length};},{cid,sid});
   assert.equal(result.r.syncedCount,0);assert.equal(result.pending,1);assert.equal(f.requests.filter(r=>r.path.includes('/orders')).length,0);await f.c.close();
  });
  await run('analysis outage reports failure without manufacturing a shelf result',async()=>{
   const f=await fixture({seeded:true,permissions:[{screen_key:'shelf_audit',is_enabled:true}]});const auditId='99999999-9999-4999-8999-999999999999';let calls=0,patches=0;
   await f.c.route('**/rest/v1/shelf_audit*',route=>{if(route.request().method()==='PATCH')patches++;const audit={id:auditId,visit_id:visitId,company_id:cid,supervisor_id:sid,status:'failed',photo_url:'https://review.invalid/photo.jpg'};return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(route.request().headers()['accept']?.includes('object')?audit:[audit])});});
   await f.c.route('**/functions/v1/analyze-shelf',route=>{calls++;return route.fulfill({status:503,contentType:'application/json',body:'{}'});});
   await f.p.goto(base+'/shelf-audit?visit='+visitId+'&audit='+auditId);await f.p.getByRole('button',{name:'إعادة المحاولة',exact:true}).click();await f.p.getByText('تعذر إرسال طلب التحليل.',{exact:true}).waitFor();assert.equal(calls,1);assert.equal(patches,0);await f.c.close();
  });
  await run('password acknowledgement retry never resubmits the password',async()=>{
   const f=await fixture({forceChange:true,passwordNoAck:true});const p=f.p;await p.goto(base+'/set-password');await p.getByRole('button',{name:'حفظ ومتابعة'}).waitFor();
   await p.getByLabel('كلمة المرور الجديدة',{exact:true}).fill('synthetic-new123');await p.getByLabel('تأكيد كلمة المرور',{exact:true}).fill('synthetic-new123');await p.getByRole('button',{name:'حفظ ومتابعة'}).click();
   await p.getByText('لم يتأكد تحديث الحساب من الخادم بعد. أعد التحقق أو تواصل مع مدير النظام.',{exact:true}).waitFor();
   assert.equal(await p.locator('input[type=password]').count(),0);assert.equal(f.requests.filter(r=>r.path==='/auth/v1/user'&&r.method==='PUT').length,1);
   f.state.forceChange=false;f.state.passwordChangedAt=new Date().toISOString();await p.getByRole('button',{name:'إعادة التحقق من الحساب'}).click();await p.waitForURL(base+'/');await p.getByTestId('sync-action-bar').waitFor();
   assert.equal(f.requests.filter(r=>r.path==='/auth/v1/user'&&r.method==='PUT').length,1);await f.c.close();
  });
  await run('dashboard read errors show unavailable data and recover without fabricated zeroes',async()=>{
   const f=await fixture({dashboardError:true});await f.p.goto(base+'/');await f.p.getByText('تعذر التحميل',{exact:true}).waitFor();assert.equal(await f.p.getByText('لا توجد زيارات بعد',{exact:true}).count(),0);
   f.state.dashboardError=false;await f.p.getByRole('button',{name:'إعادة المحاولة',exact:true}).click();await f.p.getByText('تعذر التحميل',{exact:true}).waitFor({state:'hidden'});await f.p.getByTestId('sync-action-bar').waitFor();await f.c.close();
  });
  await run('recent visit opens its selected detail rather than the visit list',async()=>{
   const f=await fixture({seeded:true});f.state.visit={id:visitId,company_id:cid,supervisor_id:sid,customer_id:customerId,status:'in_progress',visit_date:new Date().toISOString(),check_in_time:new Date().toISOString(),visit_tasks:[],customers:{id:customerId,name:'زيارة اختبار صناعية'}};
   await f.p.goto(base+'/');await f.p.getByTestId('row-recent-'+visitId).click();await f.p.waitForURL(base+'/visits/'+visitId);await f.c.close();
  });
  await run('queued visit stays on a truthful local confirmation until upload',async()=>{
   const f=await fixture({seeded:true,permissions:[{screen_key:'new_visit',is_enabled:true}]});await f.c.route('**/rest/v1/visits*',route=>route.fulfill({status:503,contentType:'application/json',body:'{"message":"synthetic offline"}'}));
   await f.p.goto(base+'/visits/new?customer='+customerId);await f.p.getByTestId('button-start-visit').click();await f.p.getByTestId('queued-visit-confirmation').waitFor({timeout:60000});assert.equal(new URL(f.p.url()).pathname,'/visits/new');
   const pending=await f.p.evaluate(async({cid,sid})=>(await import('/src/lib/offline-sync.ts')).getOfflineQueue(cid,sid),{cid,sid});assert.equal(pending.filter(r=>r.type==='create_visit').length,1);await f.c.close();
  });
  await run('admin empty states avoid unsupported performance claims',async()=>{
   const f=await fixture({role:'admin'});await f.p.setViewportSize({width:1440,height:1000});await f.p.goto(base+'/admin');await f.p.getByText('لم يُحدد مستهدف').waitFor();assert.equal(await f.p.getByText('الميدان منضبط بالكامل · لا تنبيهات طارئة').count(),0);await f.p.screenshot({path:path.join(output,'admin-1440.png'),fullPage:true});await f.c.close();
  });
 } finally {fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));await browser.close();}
 if(!results.length)throw new Error('No browser scenarios selected');
 console.log(`${results.length} browser scenarios passed`);
})().catch(error=>{console.error(error);process.exitCode=1});
