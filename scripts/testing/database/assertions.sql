-- All identities below are synthetic, inside the disposable local container.
INSERT INTO auth.users(id,encrypted_password) VALUES
 ('11111111-1111-4111-8111-111111111111','old-hash'),
 ('22222222-2222-4222-8222-222222222222','old-hash'),
 ('33333333-3333-4333-8333-333333333333','old-hash'),
 ('44444444-4444-4444-8444-444444444444','old-hash');
INSERT INTO companies(id,name) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Synthetic A'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Synthetic B');
INSERT INTO branches(id,name,company_id) VALUES
 ('aaaaaaaa-1111-4111-8111-111111111111','Synthetic branch A','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('aaaaaaaa-2222-4222-8222-222222222222','Synthetic branch A2','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('bbbbbbbb-1111-4111-8111-111111111111','Synthetic branch B','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO supervisors(id,user_id,company_id,branch_id,full_name,role,is_active,force_password_change) VALUES
 ('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1111-4111-8111-111111111111','Synthetic supervisor','supervisor',true,true),
 ('22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1111-4111-8111-111111111111','Synthetic admin','admin',true,false),
 ('33333333-3333-4333-8333-333333333333','33333333-3333-4333-8333-333333333333','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-1111-4111-8111-111111111111','Synthetic other','supervisor',true,false),
 ('44444444-4444-4444-8444-444444444444','44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-1111-4111-8111-111111111111','Synthetic branch manager','branch_manager',true,false);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$ BEGIN
  BEGIN UPDATE supervisors SET role='admin' WHERE user_id=auth.uid(); RAISE EXCEPTION 'Role write unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE supervisors SET branch_id='aaaaaaaa-2222-4222-8222-222222222222' WHERE user_id=auth.uid(); RAISE EXCEPTION 'Branch write unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE supervisors SET device_id='forged-device' WHERE user_id=auth.uid(); RAISE EXCEPTION 'Device write unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE supervisors SET force_password_change=false WHERE user_id=auth.uid(); RAISE EXCEPTION 'Password flag write unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE supervisors SET phone='synthetic' WHERE user_id=auth.uid();
  IF NOT mdn_bind_device_v1(auth.uid(),'synthetic-device-one') THEN RAISE EXCEPTION 'Initial binding failed'; END IF;
  IF mdn_bind_device_v1(auth.uid(),'synthetic-device-two') THEN RAISE EXCEPTION 'Device rebound unexpectedly'; END IF;
  IF mdn_bind_device_v1('33333333-3333-4333-8333-333333333333','synthetic-device-other') THEN RAISE EXCEPTION 'Other user bound unexpectedly'; END IF;
  BEGIN PERFORM admin_update_supervisor('33333333-3333-4333-8333-333333333333',p_role=>'admin'); RAISE EXCEPTION 'Non-admin RPC allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
DO $$ BEGIN
  PERFORM admin_update_supervisor('11111111-1111-4111-8111-111111111111',p_full_name=>'Updated synthetic',p_phone=>'',p_supervisor_code=>'TEST-1',p_reset_device=>true);
  IF (SELECT device_id IS NOT NULL FROM supervisors WHERE id='11111111-1111-4111-8111-111111111111') THEN RAISE EXCEPTION 'Admin device reset failed'; END IF;
  BEGIN PERFORM admin_update_supervisor('33333333-3333-4333-8333-333333333333',p_is_active=>false); RAISE EXCEPTION 'Cross-tenant RPC allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM admin_update_supervisor('11111111-1111-4111-8111-111111111111',p_role=>'super_admin'); RAISE EXCEPTION 'Super-admin grant allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM admin_update_supervisor('11111111-1111-4111-8111-111111111111',p_branch_id=>'bbbbbbbb-1111-4111-8111-111111111111'); RAISE EXCEPTION 'Foreign branch assignment allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
DO $$ BEGIN
  PERFORM admin_update_supervisor('11111111-1111-4111-8111-111111111111',p_phone=>'branch-managed');
  BEGIN PERFORM admin_update_supervisor('11111111-1111-4111-8111-111111111111',p_role=>'admin'); RAISE EXCEPTION 'Branch manager role ceiling bypassed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM admin_update_supervisor('22222222-2222-4222-8222-222222222222',p_phone=>'forged'); RAISE EXCEPTION 'Branch manager edited an admin'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',false);
-- Only a change to the trusted Auth password hash clears the force flag.
UPDATE auth.users SET encrypted_password='new-hash' WHERE id='11111111-1111-4111-8111-111111111111';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM supervisors WHERE id='11111111-1111-4111-8111-111111111111' AND (force_password_change OR password_changed_at IS NULL)) THEN RAISE EXCEPTION 'Password trigger did not clear flags'; END IF;
END $$;
-- Verify the permissive legacy policy is absent and definer RPCs are not available to anon.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orders' AND policyname='orders_company_all') THEN RAISE EXCEPTION 'Legacy policy still present'; END IF;
  IF has_function_privilege('anon','public.mdn_bind_device_v1(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Anon can bind a device'; END IF;
END $$;
SELECT 'database authorization and password tests passed' AS result;

-- Sales table stays inaccessible to every client role, including an administrator.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$ BEGIN
  BEGIN PERFORM 1 FROM orders; RAISE EXCEPTION 'Supervisor read orders'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM manager_set_order_status(gen_random_uuid(),'delivered'); RAISE EXCEPTION 'Sales RPC executed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
DO $$ BEGIN
  BEGIN PERFORM 1 FROM orders; RAISE EXCEPTION 'Admin read orders'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM supervisors WHERE id='11111111-1111-4111-8111-111111111111'; RAISE EXCEPTION 'Direct profile deletion allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
DO $$ BEGIN
  BEGIN PERFORM delete_supervisor_cascade('22222222-2222-4222-8222-222222222222'); RAISE EXCEPTION 'Branch manager deleted admin'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'sales denial and cascade-delete ceiling tests passed' AS result;

-- Unknown administrator roles must fail closed even through direct RPC calls.
SELECT set_config('request.jwt.claim.sub','',false);
UPDATE supervisors SET role=NULL WHERE id='44444444-4444-4444-8444-444444444444';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
DO $$ BEGIN
 BEGIN PERFORM admin_update_supervisor('11111111-1111-4111-8111-111111111111',p_phone=>'forged'); RAISE EXCEPTION 'Null role RPC allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
