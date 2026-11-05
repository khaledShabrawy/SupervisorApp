import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const migration = await readFile(new URL('../../../supabase/migrations/20261104195745_audit_remediation.sql', import.meta.url), 'utf8');
const schema = await readFile(new URL('./fixtures/security-schema.sql', import.meta.url), 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const today = new Date().toISOString().slice(0,10);

test('isolated PostgreSQL: two-company security, role boundaries, honest measurements and idempotent execution', async t => {
  const db = new PGlite();
  const query = (sql, params=[]) => db.query(sql, params);
  const asUser = async (n, sql, params=[]) => {
    await db.exec('SET ROLE authenticated');
    await query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [id(100+n),JSON.stringify({ sub:id(100+n),session_id:id(400+n) })]);
    try { return await query(sql,params); } finally { await db.exec('RESET ROLE'); }
  };
  const action = (n, type, payload, company=1, supervisor=204) => asUser(4,
    'SELECT public.mdn_apply_offline_action_v1($1,$2,$3::jsonb,$4,$5) AS applied',[id(n),type,JSON.stringify(payload),id(company),id(supervisor)]);
  try {
    await db.exec(schema); await db.exec(migration); await db.exec(migration);
    await query('INSERT INTO companies(id,name) VALUES($1,$2),($3,$4)',[id(1),'Company A',id(2),'Company B']);
    await query('INSERT INTO regions(id,company_id,name) VALUES($1,$2,$3)',[id(31),id(1),'North']);
    await query('INSERT INTO branches(id,company_id,name,region_id) VALUES($1,$2,$3,$4),($5,$2,$6,$4),($7,$8,$9,NULL)',[id(11),id(1),'A1',id(31),id(12),'A2',id(21),id(2),'B1']);
    const roles=['admin','branch_manager','manager','supervisor','supervisor','supervisor','super_admin','admin','supervisor'];
    for(let n=1;n<=9;n++) {
      await query('INSERT INTO auth.users(id,encrypted_password) VALUES($1,$2)',[id(100+n),'synthetic-hash']);
      await query('INSERT INTO supervisors(id,user_id,company_id,branch_id,role,full_name,device_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [id(200+n),id(100+n),id(n>=8?2:1),id(n>=8?21:n===6?12:11),roles[n-1],`User ${n}`,'device-aaaaaaaaaaaaaaaa']);
      await query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[id(400+n),id(100+n)]);
      await query('INSERT INTO mdn_device_sessions(session_id,supervisor_id,device_id) VALUES($1,$2,$3)',[id(400+n),id(200+n),'device-aaaaaaaaaaaaaaaa']);
    }
    await query('INSERT INTO app_settings(company_id,app_name,geofence_radius_m) VALUES($1,$2,100),($3,$4,100)',[id(1),'A brand',id(2),'B brand']);
    await query('INSERT INTO customers(id,company_id,supervisor_id,name,latitude,longitude) VALUES($1,$2,$3,$4,30,31),($5,$6,$7,$8,30,31)',
      [id(501),id(1),id(204),'A customer',id(502),id(2),id(209),'B customer']);
    for(const key of ['new_visit','shelf_audit','competitor_products','field_survey']) await query('INSERT INTO supervisor_permissions(company_id,supervisor_id,screen_key,is_enabled) VALUES($1,$2,$3,true)',[id(1),id(204),key]);
    await query('INSERT INTO beat_plans(company_id,supervisor_id,customer_id,customer_ids_ordered,plan_date) VALUES($1,$2,$3,$4,$5)',[id(1),id(204),id(501),[id(501)],today]);
    await t.test('anonymous settings denied; public branding only returns its explicit projection',async()=>{
      await db.exec('SET ROLE anon');
      try {
        await assert.rejects(query('SELECT * FROM app_settings'),/permission denied/);
        await assert.rejects(query('SELECT * FROM vw_daily_kpi_supervisor'),/permission denied/);
        const result=await query('SELECT * FROM mdn_public_branding_v1($1)',[id(1)]);
        assert.equal(result.rows.length,1); assert.deepEqual(Object.keys(result.rows[0]),['company_id','app_name','logo_url']);
      } finally { await db.exec('RESET ROLE'); }
    });
    await t.test('company-wide customer reads remain isolated between companies',async()=>{
      const result=await asUser(5,'SELECT id FROM customers');
      assert.deepEqual(result.rows.map(r=>r.id),[id(501)]);
    });
    await t.test('ordinary supervisor cannot delete settings or prices, or change privileged profile columns',async()=>{
      assert.equal((await asUser(4,'DELETE FROM app_settings RETURNING id')).rows.length,0);
      assert.equal((await query('SELECT * FROM app_settings')).rows.length,2);
      await query('INSERT INTO products(id,company_id,name) VALUES($1,$2,$3)',[id(990),id(1),'Synthetic product']);
      await query('INSERT INTO price_list(id,company_id,product_id,unit_price) VALUES($1,$2,$3,10)',[id(991),id(1),id(990)]);
      assert.equal((await asUser(4,'DELETE FROM price_list RETURNING id')).rows.length,0);
      assert.equal((await query('SELECT * FROM price_list')).rows.length,1);
      await assert.rejects(asUser(4,'UPDATE supervisors SET role=$1 WHERE id=$2',['super_admin',id(204)]),/permission denied/);
      await assert.rejects(asUser(4,'UPDATE supervisors SET device_id=NULL WHERE id=$1',[id(204)]),/permission denied/);
    });
    await t.test('both manager spellings respect branch and target-role ceilings',async()=>{
      for(const n of [2,3]) {
        await assert.rejects(asUser(n,'SELECT mdn_admin_update_supervisor_v1($1,$2::jsonb)',[id(206),'{"is_active":false}']),/boundary/);
        await assert.rejects(asUser(n,'SELECT delete_supervisor_cascade($1)',[id(206)]),/boundary/);
        await assert.rejects(asUser(n,'SELECT mdn_admin_update_supervisor_v1($1,$2::jsonb)',[id(201),'{"role":"supervisor"}']),/boundary/);
      }
      await assert.rejects(asUser(1,'SELECT mdn_admin_update_supervisor_v1($1,$2::jsonb)',[id(207),'{"is_active":false}']),/Protected/);
      await assert.rejects(asUser(1,'SELECT mdn_admin_update_supervisor_v1($1,$2::jsonb)',[id(209),'{"is_active":false}']),/Outside company/);
    });
    await t.test('admin profile fields update atomically through the same guarded command',async()=>{
      await asUser(1,'SELECT mdn_admin_update_supervisor_v1($1,$2::jsonb)',[id(204),'{"full_name":"Edited","supervisor_code":"A-04"}']);
      assert.equal((await query('SELECT supervisor_code FROM supervisors WHERE id=$1',[id(204)])).rows[0].supervisor_code,'A-04');
      await assert.rejects(asUser(1,'SELECT mdn_admin_update_supervisor_v1($1,$2::jsonb)',[id(204),'{"full_name":"Should rollback","branch_id":"00000000-0000-4000-8000-000000000021"}']),/branch/);
      assert.equal((await query('SELECT full_name FROM supervisors WHERE id=$1',[id(204)])).rows[0].full_name,'Edited');
    });
    await t.test('device mismatch cannot register; reset revokes existing registered sessions',async()=>{
      assert.equal((await asUser(4,'SELECT mdn_bind_device_v1($1,$2) AS bound',[id(204),'device-bbbbbbbbbbbbbbbb'])).rows[0].bound,false);
      await asUser(1,'SELECT mdn_reset_device_v1($1)',[id(205)]);
      assert.equal((await asUser(5,'SELECT mdn_session_ready_v1() AS ready')).rows[0].ready,false);
      assert.equal((await asUser(5,'SELECT mdn_bind_device_v1($1,$2) AS bound',[id(205),'device-bbbbbbbbbbbbbbbb'])).rows[0].bound,true);
    });
    await t.test('force-password change clears only on Auth password-hash change',async()=>{
      await query('UPDATE supervisors SET force_password_change=true WHERE id=$1',[id(205)]);
      assert.equal((await asUser(5,'SELECT mdn_session_ready_v1() AS ready')).rows[0].ready,false);
      await query('UPDATE auth.users SET encrypted_password=encrypted_password WHERE id=$1',[id(105)]);
      assert.equal((await query('SELECT force_password_change FROM supervisors WHERE id=$1',[id(205)])).rows[0].force_password_change,true);
      await query('UPDATE auth.users SET encrypted_password=$1 WHERE id=$2',['new-synthetic-hash',id(105)]);
      assert.equal((await query('SELECT force_password_change FROM supervisors WHERE id=$1',[id(205)])).rows[0].force_password_change,false);
    });
    const payload={id:id(601),customer_id:id(501),latitude:30,longitude:31,notes:'',visit_date:today,check_in_time:new Date(Date.now()-60000).toISOString(),on_beat:false,geo_distance:999999};
    await t.test('server computes meters and route adherence; duplicate receipt applies exactly once',async()=>{
      await action(701,'create_visit',payload); await action(701,'create_visit',payload);
      const result=(await query('SELECT * FROM visits WHERE id=$1',[id(601)])).rows[0];
      assert.equal(result.geo_distance,0);assert.equal(result.within_geofence,true);assert.equal(result.on_route,true);
      assert.equal((await query('SELECT * FROM visits')).rows.length,1);
      await assert.rejects(action(701,'create_visit',{...payload,notes:'changed'}),/conflict/);
      await assert.rejects(action(702,'create_visit',{...payload,id:id(602),customer_id:id(502)}),/Customer unavailable/);
      await assert.rejects(action(703,'create_visit',payload,2),/identity/);
    });
    await t.test('direct visit mutation and AI-result forgery are blocked',async()=>{
      await assert.rejects(asUser(4,'UPDATE visits SET on_beat=true WHERE id=$1',[id(601)]),/permission denied/);
      await assert.rejects(asUser(4,'UPDATE shelf_audit SET audit_score=86'),/permission denied/);
      await assert.rejects(asUser(4,'INSERT INTO shelf_audit(company_id,supervisor_id,visit_id,status,audit_score) VALUES($1,$2,$3,$4,86)',[id(1),id(204),id(601),'completed']),/row-level security/);
    });
    await t.test('mandatory tasks require evidence; completed visits cannot be reopened',async()=>{
      await query('INSERT INTO visit_tasks(id,company_id,visit_id,task_type) VALUES($1,$2,$3,$4)',[id(801),id(1),id(601),'shelf_audit']);
      await action(704,'set_visit_outcome',{id:id(601),outcome:'متعامل'});
      await assert.rejects(action(705,'update_visit_status',{id:id(601),status:'completed',check_out_time:new Date().toISOString()}),/Mandatory/);
      await assert.rejects(asUser(4,'UPDATE visit_tasks SET is_completed=true WHERE id=$1',[id(801)]),/evidence/);
      await query('INSERT INTO shelf_audit(company_id,supervisor_id,visit_id,status,audit_score,ai_detailed_report,audited_at) VALUES($1,$2,$3,$4,90,$5::jsonb,now())',[id(1),id(204),id(601),'completed','{"engine":"google-gemini"}']);
      await asUser(4,'UPDATE visit_tasks SET is_completed=true WHERE id=$1',[id(801)]);
      await action(706,'update_visit_status',{id:id(601),status:'completed',check_out_time:new Date().toISOString()});
      await assert.rejects(action(707,'create_visit',{...payload,existingId:id(601)}),/already started/);
      assert.equal((await query('SELECT status FROM visits WHERE id=$1',[id(601)])).rows[0].status,'completed');
    });
    await t.test('out-of-range alert is committed once with real meter units',async()=>{
      const far={...payload,id:id(603),latitude:30.01,notes:'[OOR: reported exception]'};
      await action(708,'create_visit',far); await action(708,'create_visit',far);
      const alerts=(await query("SELECT * FROM notifications WHERE type='oor_visit'")).rows;
      assert.equal(alerts.length,1);assert.match(alerts[0].body_ar,/1112/);
    });
    await t.test('attendance retry creates a single check-in and never overwrites checkout',async()=>{
      const attendance={id:id(901),kind:'in',attendance_date:today,check_in_time:new Date(Date.now()-120000).toISOString()};
      await action(709,'attendance_action',attendance);await action(709,'attendance_action',attendance);
      await action(710,'attendance_action',{...attendance,id:id(902)});
      assert.equal((await query('SELECT * FROM attendance')).rows.length,1);
    });
    await t.test('storage restrictive guard survives an old unrestricted policy',async()=>{
      await query('INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2),($1,$3)',['training-materials',`${id(1)}/docs/a.pdf`,`${id(2)}/docs/b.pdf`]);
      assert.equal((await asUser(4,"SELECT * FROM storage.objects WHERE bucket_id='training-materials'")).rows.length,0);
      await query('INSERT INTO training_courses(id,company_id,is_published) VALUES($1,$2,true)',[id(960),id(1)]);
      await query('INSERT INTO training_lessons(id,company_id,course_id,is_published,attachment_url) VALUES($1,$2,$3,false,$4)',[id(961),id(1),id(960),`${id(1)}/docs/a.pdf`]);
      assert.equal((await asUser(4,"SELECT * FROM storage.objects WHERE bucket_id='training-materials'")).rows.length,0);
      await query('UPDATE training_lessons SET is_published=true WHERE id=$1',[id(961)]);
      assert.equal((await asUser(4,"SELECT * FROM storage.objects WHERE bucket_id='training-materials'")).rows.length,1);
      await assert.rejects(asUser(1,'INSERT INTO storage.objects(bucket_id,name) VALUES($1,$2)',['training-materials',`${id(2)}/docs/attack.pdf`]),/row-level security/);
      assert.equal((await asUser(1,'DELETE FROM storage.objects WHERE name=$1 RETURNING id',[`${id(2)}/docs/b.pdf`])).rows.length,0);
      assert.equal((await query("SELECT public FROM storage.buckets WHERE id='training-materials'")).rows[0].public,false);
    });
    await t.test('cross-company parents fail even for an authorized company admin',async()=>{
      await assert.rejects(asUser(1,'INSERT INTO price_list(company_id,product_id) VALUES($1,$2)',[id(1),id(999)]),/missing parent/);
    });
    await t.test('KPI aggregates exceed row caps and use the selected monthly target period',async()=>{
      await query("INSERT INTO visits(id,company_id,supervisor_id,customer_id,visit_date,status,on_beat,within_geofence) SELECT md5('metric'||n)::uuid,$1,$2,$3,$4,'completed',true,true FROM generate_series(1,2505) n",[id(1),id(204),id(501),today]);
      const month=today.slice(0,7)+'-01';
      await query('INSERT INTO targets(company_id,supervisor_id,target_date,visits_target) VALUES($1,$2,$3,100),($1,$2,$4,999)',[id(1),id(204),month,'2025-01-01']);
      const metrics=(await asUser(1,'SELECT mdn_admin_kpis_v1($1,$2,NULL,NULL,NULL) AS metrics',[today,today])).rows[0].metrics;
      assert.equal(metrics.visitsToday,2507);assert.equal(metrics.visitsAchieved,2506);assert.equal(metrics.visitsTarget,100);
      await assert.rejects(asUser(4,'SELECT mdn_admin_kpis_v1($1,$2,NULL,NULL,NULL)',[today,today]),/Admin required/);
      await query('INSERT INTO targets(company_id,branch_id,target_date,visits_target) VALUES($1,$2,$3,200),($1,$4,$3,300),($1,NULL,$3,400)',[id(1),id(11),month,id(12)]);
      const scoped=(await asUser(1,'SELECT mdn_admin_kpis_v1($1,$2,NULL,$3,NULL) AS metrics',[today,today,id(11)])).rows[0].metrics;
      assert.equal(scoped.visitsTarget,300); // assigned 100 + this branch 200, not another branch or whole-company quota
      const personal=(await asUser(1,'SELECT mdn_admin_kpis_v1($1,$2,NULL,NULL,$3) AS metrics',[today,today,id(204)])).rows[0].metrics;
      assert.equal(personal.visitsTarget,100);
    });
    await t.test('service-only invitation reservations enforce seats, company and explicit default capabilities',async()=>{
      await assert.rejects(asUser(1,'SELECT mdn_reserve_invitation_v1($1,$2,$3,$4,NULL)',[id(101),id(1),'test@example.test','supervisor']),/permission denied/);
      await assert.rejects(query('SELECT mdn_reserve_invitation_v1($1,$2,$3,$4,NULL)',[id(101),id(2),'test@example.test','supervisor']),/Forbidden/);
      await query('UPDATE companies SET max_supervisors=8 WHERE id=$1',[id(1)]);
      const reservation=(await query('SELECT mdn_reserve_invitation_v1($1,$2,$3,$4,$5) AS id',[id(101),id(1),'test@example.test','supervisor',id(11)])).rows[0].id;
      await assert.rejects(query('SELECT mdn_reserve_invitation_v1($1,$2,$3,$4,$5)',[id(101),id(1),'another@example.test','supervisor',id(11)]),/Seat limit/);
      await query('INSERT INTO auth.users(id,encrypted_password) VALUES($1,$2)',[id(110),'synthetic-hash']);
      const profile=(await query('SELECT mdn_complete_invitation_v1($1,$2,$3,NULL,$4::jsonb) AS id',[reservation,id(110),'Invited','{}'])).rows[0].id;
      const permissions=(await query('SELECT screen_key,is_enabled FROM supervisor_permissions WHERE supervisor_id=$1',[profile])).rows;
      assert.equal(permissions.length,7);assert.equal(permissions.find(p=>p.screen_key==='field_survey').is_enabled,false);
      assert.equal((await query('SELECT force_password_change FROM supervisors WHERE id=$1',[profile])).rows[0].force_password_change,true);
      await query('UPDATE companies SET max_supervisors=20 WHERE id=$1',[id(1)]);
    });
    await t.test('trusted administrator password reset forces change and revokes device sessions',async()=>{
      await query("UPDATE auth.users SET encrypted_password='temporary-synthetic-hash',raw_app_meta_data=$1::jsonb WHERE id=$2",[JSON.stringify({mdn_admin_password_reset:true,mdn_password_reset_actor:id(101)}),id(105)]);
      assert.equal((await query('SELECT force_password_change FROM supervisors WHERE id=$1',[id(205)])).rows[0].force_password_change,true);
      assert.equal((await query('SELECT * FROM mdn_device_sessions WHERE supervisor_id=$1',[id(205)])).rows.length,0);
      assert.equal((await query('SELECT raw_app_meta_data FROM auth.users WHERE id=$1',[id(105)])).rows[0].raw_app_meta_data.mdn_admin_password_reset,undefined);
    });
    await t.test('AI jobs reserve shared budgets, reject forged results and commit measured results with one inbox alert',async()=>{
      await query("UPDATE app_settings SET target_brand_name='Synthetic brand',ai_audit_enabled=true WHERE company_id=$1",[id(1)]);
      await query("INSERT INTO shelf_audit(id,company_id,supervisor_id,visit_id,photo_url,status) VALUES($1,$2,$3,$4,$5,'pending')",[id(850),id(1),id(204),id(603),`${id(1)}/${id(204)}/synthetic.jpg`]);
      await assert.rejects(asUser(4,'SELECT mdn_claim_analysis_job_v1($1,$2,$3,$4)',[id(104),id(404),'shelf_audit',id(850)]),/permission denied/);
      await assert.rejects(query('SELECT mdn_claim_analysis_job_v1($1,$2,$3,$4)',[id(104),id(999),'shelf_audit',id(850)]),/unregistered/);
      const job=(await query('SELECT mdn_claim_analysis_job_v1($1,$2,$3,$4) AS id',[id(104),id(404),'shelf_audit',id(850)])).rows[0].id;
      await assert.rejects(query('SELECT mdn_claim_analysis_job_v1($1,$2,$3,$4)',[id(104),id(404),'shelf_audit',id(850)]),/already claimed/);
      await assert.rejects(query('SELECT mdn_finish_analysis_job_v1($1,true,$2::jsonb)',[job,'{"engine":"smart-vision-engine","score":86}']),/Measured/);
      await assert.rejects(query('SELECT mdn_finish_analysis_job_v1($1,true,$2::jsonb)',[job,'{"score":86}']),/Measured/);
      await assert.rejects(query('SELECT mdn_finish_analysis_job_v1($1,true,$2::jsonb)',[job,'{"engine":"google-gemini"}']),/Invalid measured score/);
      await query('SELECT mdn_finish_analysis_job_v1($1,true,$2::jsonb)',[job,JSON.stringify({engine:'google-gemini',score:70,audit_summary_ar:'Synthetic measured provider fixture',target_brand_metrics:{out_of_stock:true,share_of_shelf_percentage:44}})]);
      assert.equal((await query('SELECT audit_score,status FROM shelf_audit WHERE id=$1',[id(850)])).rows[0].status,'completed');
      await assert.rejects(query('SELECT mdn_finish_analysis_job_v1($1,true,$2::jsonb)',[job,'{}']),/lease unavailable/);
      assert.equal((await query("SELECT count(*)::int AS n FROM notifications WHERE type='oos_critical'")).rows[0].n,1);
      await query("INSERT INTO mdn_analysis_jobs(company_id,supervisor_id,resource_id,resource_type,state) SELECT $1,$2,md5('quota'||n)::uuid,'field_surveys','failed' FROM generate_series(1,19)n",[id(1),id(204)]);
      await query("INSERT INTO shelf_audit(id,company_id,supervisor_id,status) VALUES($1,$2,$3,'pending')",[id(851),id(1),id(204)]);
      await assert.rejects(query('SELECT mdn_claim_analysis_job_v1($1,$2,$3,$4)',[id(104),id(404),'shelf_audit',id(851)]),/budget exceeded/);
    });
    await t.test('route arrays cannot reference another company and unpublished training is not readable',async()=>{
      await assert.rejects(asUser(1,'INSERT INTO beat_plans(company_id,supervisor_id,customer_ids_ordered,plan_date) VALUES($1,$2,$3,$4)',[id(1),id(204),[id(502)],today]),/Cross-company route/);
      await query('INSERT INTO training_courses(id,company_id,is_published) VALUES($1,$2,false)',[id(950),id(1)]);
      assert.equal((await asUser(4,'SELECT id FROM training_courses WHERE id=$1',[id(950)])).rows.length,0);
    });
    await t.test('enabled password expiry rejects server operations until a real password change',async()=>{
      await query('UPDATE app_settings SET password_expiry_enabled=true,password_expiry_days=90 WHERE company_id=$1',[id(1)]);
      assert.equal((await asUser(4,'SELECT mdn_session_ready_v1() AS ready')).rows[0].ready,false);
      await query("UPDATE auth.users SET encrypted_password='expiry-new-synthetic' WHERE id=$1",[id(104)]);
      assert.equal((await asUser(4,'SELECT mdn_session_ready_v1() AS ready')).rows[0].ready,true);
      await query('UPDATE app_settings SET password_expiry_enabled=false WHERE company_id=$1',[id(1)]);
    });
    await t.test('legacy SQL cannot reopen policy access and analytics views retain tenant isolation',async()=>{
      const legacy=await readFile(new URL('../../../scripts/sql/99_fix_prospects_and_orders.sql',import.meta.url),'utf8');
      await assert.rejects(db.exec(legacy),/Legacy SQL replay blocked/);
      await query("INSERT INTO visits(id,company_id,supervisor_id,customer_id,visit_date,status) VALUES($1,$2,$3,$4,$5,'completed')",[id(9991),id(2),id(209),id(502),today]);
      const visible=(await asUser(9,'SELECT * FROM vw_daily_kpi_supervisor')).rows;
      assert.equal(visible.length,1);assert.ok(visible.every(row=>row.company_id===id(2)));
    });
    await t.test('field survey creation cannot forge measurements or refer to another owner photo',async()=>{
      const insert='INSERT INTO field_surveys(company_id,supervisor_id,photo_url,status,stores_found) VALUES($1,$2,$3,$4,$5)';
      await assert.rejects(asUser(4,insert,[id(1),id(204),`${id(1)}/${id(204)}/photo.jpg`,'pending',99]),/row-level security/);
      await assert.rejects(asUser(4,insert,[id(1),id(204),`${id(2)}/${id(209)}/photo.jpg`,'pending',0]),/row-level security/);
      await asUser(4,insert,[id(1),id(204),`${id(1)}/${id(204)}/photo.jpg`,'pending',0]);
      await assert.rejects(asUser(1,'UPDATE branches SET manager_id=$1 WHERE id=$2',[id(209),id(11)]),/Cross-company/);
    });
    await t.test('inactive user loses all operational access immediately',async()=>{
      await query('UPDATE supervisors SET is_active=false WHERE id=$1',[id(204)]);
      assert.equal((await asUser(4,'SELECT * FROM visits')).rows.length,0);
      await assert.rejects(action(711,'set_visit_outcome',{id:id(603),outcome:'غير موجود'}),/identity/);
    });
    await t.test('a discovered customer links to its AI field survey rather than a formal questionnaire',async()=>{
      await query("INSERT INTO field_surveys(id,company_id,supervisor_id,status) VALUES($1,$2,$3,'completed')",[id(975),id(2),id(209)]);
      await asUser(9,'INSERT INTO customers(id,company_id,supervisor_id,name,survey_id) VALUES($1,$2,$3,$4,$5)',[id(976),id(2),id(209),'Discovered lead',id(975)]);
      await assert.rejects(asUser(9,'INSERT INTO customers(id,company_id,supervisor_id,name,survey_id) VALUES($1,$2,$3,$4,$5)',[id(977),id(2),id(209),'Invalid lead',id(850)]),/Cross-company or missing parent/);
    });
    await t.test('missing session claims fail closed and platform rescue does not depend on its home company subscription',async()=>{
      await db.exec('SET ROLE authenticated');
      try {
        await query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id(108),JSON.stringify({sub:id(108)})]);
        assert.equal((await query('SELECT mdn_session_ready_v1() AS ready')).rows[0].ready,false);
        await assert.rejects(query('SELECT mdn_bind_device_v1($1,$2) AS ready',[id(208),'device-aaaaaaaaaaaaaaaa']),/Session identity missing or revoked/);
        await assert.rejects(query('SELECT mdn_identity_ready_v1($1,NULL)',[id(108)]),/permission denied/);
      } finally { await db.exec('RESET ROLE'); }
      await query('UPDATE companies SET is_active=false WHERE id=$1',[id(1)]);
      try {
        assert.equal((await asUser(7,'SELECT mdn_session_ready_v1() AS ready')).rows[0].ready,true);
        assert.equal((await asUser(1,'SELECT mdn_session_ready_v1() AS ready')).rows[0].ready,false);
      } finally { await query('UPDATE companies SET is_active=true WHERE id=$1',[id(1)]); }
    });
    await t.test('revoked or expired Auth sessions cannot keep operating using a registered device token',async()=>{
      assert.equal((await asUser(8,'SELECT mdn_session_ready_v1() AS ready')).rows[0].ready,true);
      await query('DELETE FROM auth.sessions WHERE id=$1',[id(408)]);
      assert.equal((await asUser(8,'SELECT mdn_session_ready_v1() AS ready')).rows[0].ready,false);
      await query("INSERT INTO auth.sessions(id,user_id,not_after) VALUES($1,$2,now()-interval '1 second')",[id(408),id(108)]);
      assert.equal((await asUser(8,'SELECT mdn_session_ready_v1() AS ready')).rows[0].ready,false);
    });
    await t.test('a tenant admin cannot bypass peer credential protection by first demoting the peer',async()=>{
      await query('INSERT INTO auth.users(id,encrypted_password) VALUES($1,$2)',[id(111),'synthetic-hash']);
      await query("INSERT INTO supervisors(id,user_id,company_id,branch_id,role,full_name) VALUES($1,$2,$3,$4,'admin','Peer admin')",[id(211),id(111),id(1),id(11)]);
      await assert.rejects(asUser(1,'SELECT mdn_admin_update_supervisor_v1($1,$2::jsonb)',[id(211),'{"role":"supervisor"}']),/Protected peer/);
      await assert.rejects(asUser(1,'SELECT mdn_reset_device_v1($1)',[id(211)]),/Protected peer/);
    });
  } finally { await db.close(); }
});
