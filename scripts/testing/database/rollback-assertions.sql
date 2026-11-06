DO $$ BEGIN
 IF to_regprocedure('public.mdn_bind_device_v1(uuid,text)') IS NOT NULL THEN RAISE EXCEPTION 'New RPC remained after rollback'; END IF;
 IF NOT has_column_privilege('authenticated','public.supervisors','branch_id','UPDATE') THEN RAISE EXCEPTION 'Original branch grant not restored'; END IF;
 IF NOT has_table_privilege('authenticated','public.orders','SELECT') THEN RAISE EXCEPTION 'Original orders grant not restored'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='orders_company_all' AND tablename='orders') THEN RAISE EXCEPTION 'Original policy not restored'; END IF;
END $$;
SELECT 'configuration rollback tests passed' AS result;
