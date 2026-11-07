#!/usr/bin/env python3
"""Synthetic concurrency checks against a disposable network-isolated test container."""
import json
import os
import re
import subprocess
import sys
import time

name=sys.argv[1]
if not re.fullmatch(r'mydan-[a-zA-Z0-9-]+',name):raise SystemExit('A disposable mydan test container is required.')
env={k:v for k,v in os.environ.items() if k not in ('DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH')}
docker=['docker','--host=unix:///var/run/docker.sock']
info=json.loads(subprocess.check_output(docker+['inspect',name],env=env))[0]
if info['HostConfig']['NetworkMode']!='none' or info['HostConfig'].get('PortBindings') or any(m['Type']=='bind' for m in info['Mounts']):raise SystemExit('Unsafe restore target: expected no network, ports or host mounts.')
cmd=docker+['exec','-i',name,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres']
def sql(query):return subprocess.check_output(cmd,input=query,text=True,env=env).strip()
admin="SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);"
visit='50000000-0000-4000-8000-000000000002'
def rpc(suffix):return "SELECT mdn_save_visit_task_v1('"+visit+"','60000000-0000-4000-8000-0000000000"+suffix+"','Concurrent synthetic task','other',true);"
first=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
first.stdin.write('BEGIN;'+admin+rpc('20')+"\n\\echo VISIT_LOCK_HELD\nSELECT pg_sleep(2); COMMIT;\n");first.stdin.close()
while True:
 line=first.stdout.readline()
 if 'VISIT_LOCK_HELD' in line:break
 if not line:raise RuntimeError('First planner failed before obtaining visit lock: '+first.stderr.read())
second=subprocess.Popen(docker+['exec','-i','-e','PGAPPNAME=mydan-task-second-planner',name,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
second.stdin.write(admin+rpc('21'));second.stdin.close()
waited=False
for _ in range(12):
 if sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='mydan-task-second-planner' AND wait_event_type='Lock')")=='t':waited=True;break
 time.sleep(.05)
if first.wait(timeout=10)!=0 or second.wait(timeout=10)!=0:raise RuntimeError('Concurrent planner failed')
if not waited:raise AssertionError('Second planner was not observed waiting for the visit lock')
if sql("SELECT count(*)=2 AND count(DISTINCT order_num)=2 FROM visit_tasks WHERE id IN ('60000000-0000-4000-8000-000000000020','60000000-0000-4000-8000-000000000021')")!='t':raise AssertionError('Concurrent planning duplicated or lost task ordering')
# The ordinary field start locks the same visit. A later plan cannot change it.
sql("SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',false);UPDATE visits SET status='in_progress',check_in_time=now() WHERE id='"+visit+"';")
sql(admin+"DO $$ BEGIN BEGIN PERFORM mdn_save_visit_task_v1('"+visit+"',gen_random_uuid(),'Late edit','other',true); RAISE EXCEPTION 'Plan changed after start'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END; END $$;")
print('Concurrent task planners serialized, retained unique order, and rejected planning after field start.')
