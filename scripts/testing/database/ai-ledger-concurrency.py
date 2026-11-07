#!/usr/bin/env python3
"""Concurrent budget admissions on an already seeded disposable local container.
Never accepts a PostgreSQL host/URL or a hosted target. Synthetic rows only.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
import re
import subprocess
import time

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('container')
args=parser.parse_args()
if not re.fullmatch(r'mydan-(?:security-test|scale-test)-[A-Za-z0-9_-]+',args.container):
    raise SystemExit('Expected a disposable mydan-security-test/mydan-scale-test container.')
env={k:v for k,v in os.environ.items() if k not in ('DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH')}
command=['docker','--host=unix:///var/run/docker.sock','exec','-i',args.container,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres']
COMPANY='50000000-0000-4000-8000-000000000000'
ACTOR='50000000-0000-4000-8000-000000000001'

def sql(query,check=True):
    result=subprocess.run(command,input=query,text=True,env=env,capture_output=True)
    if check and result.returncode:
        raise RuntimeError('Disposable budget SQL failed: '+result.stderr[-500:])
    return result

def claim(record,day=1000,hour=1000,concurrent=1000):
    return f"public.mdn_claim_ai_attempt_v1('{COMPANY}','{ACTOR}','discover-customers','58000000-0000-4000-8000-{record:012d}','google-gemini',{day},{hour},{concurrent})"

def batch(records,day=1000,hour=1000,concurrent=1000,finish=False):
    def request(record):
        query='SET ROLE service_role;\nSELECT '+claim(record,day,hour,concurrent)
        if finish:
            query+=" AS attempt \\gset\nSELECT public.mdn_finish_ai_attempt_v1(:'attempt','failed','"+COMPANY+"','"+ACTOR+"');\n"
        else:
            query+=';\n'
        return sql(query,False)
    with ThreadPoolExecutor(max_workers=12) as workers:
        return list(workers.map(request,records))

def verify(results,admitted,reason):
    if sum(r.returncode==0 for r in results)!=admitted:
        raise AssertionError('Unexpected concurrent admission count: '+str([(r.returncode,r.stderr[-150:]) for r in results]))
    for result in results:
        if result.returncode and reason not in result.stderr:
            raise AssertionError('Unexpected refusal: '+result.stderr[-300:])

# Deliberately hold one uncommitted accepted reservation. A broken/no-lock
# implementation cannot see it and admits an extra slot; the advisory lock must
# make subsequent admissions wait until this row commits.
sql('TRUNCATE public.mdn_ai_attempts_v1;')
holder_query='BEGIN; SET LOCAL ROLE service_role; SELECT '+claim(1,concurrent=3)+'; SELECT pg_sleep(2) /* MYDAN_LEDGER_HOLDER */; COMMIT;'
holder=subprocess.Popen(command,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
holder.stdin.write(holder_query);holder.stdin.close();holder.stdin=None
try:
    for _ in range(50):
        held=sql("select count(*) from pg_stat_activity where wait_event='PgSleep' and query like '%MYDAN_LEDGER_HOLDER%';").stdout.strip()
        if held=='1':break
        if holder.poll() is not None:raise RuntimeError('Reservation holder exited before lock test.')
        time.sleep(0.05)
    else:raise RuntimeError('Reservation holder did not reach its transaction barrier.')
    outcomes=batch(range(2,14),concurrent=3)
    output,errors=holder.communicate(timeout=10)
    if holder.returncode:raise RuntimeError('Reservation holder failed: '+errors[-300:])
    verify(outcomes,2,'AI_QUOTA_CONCURRENT')
    assert sql("select count(*) from public.mdn_ai_attempts_v1 where status='running';").stdout.strip()=='3'
finally:
    if holder.poll() is None:holder.kill();holder.communicate()

# Every failed provider reservation still counts toward a shared company-day cap.
sql('TRUNCATE public.mdn_ai_attempts_v1;')
outcomes=batch(range(1,13),day=4,finish=True)
verify(outcomes,4,'AI_QUOTA_COMPANY_DAY')
assert sql("select count(*) from public.mdn_ai_attempts_v1 where status='failed';").stdout.strip()=='4'

# Duplicate requests for one record cannot allocate two simultaneous provider calls.
sql('TRUNCATE public.mdn_ai_attempts_v1;')
outcomes=batch([1]*12)
verify(outcomes,1,'AI_ATTEMPT_IN_PROGRESS')
assert sql('select count(*) from public.mdn_ai_attempts_v1;').stdout.strip()=='1'
# A provider whose outcome is unknown retains both its record and company slot.
sql('TRUNCATE public.mdn_ai_attempts_v1;')
reservation=sql('SET ROLE service_role; SELECT '+claim(1)+';').stdout.strip()
assert re.fullmatch(r'[a-f0-9-]{36}',reservation)
finished=sql("SET ROLE service_role; SELECT public.mdn_finish_ai_attempt_v1('"+reservation+"','uncertain','"+COMPANY+"','"+ACTOR+"');").stdout.strip()
assert finished=='t'
verify(batch(range(2,14),concurrent=1),0,'AI_QUOTA_CONCURRENT')
verify(batch([1]*12),0,'AI_ATTEMPT_IN_PROGRESS')
assert sql("select count(*) from public.mdn_ai_attempts_v1 where status='uncertain';").stdout.strip()=='1'
sql("update public.mdn_ai_attempts_v1 set started_at=clock_timestamp()-interval '200 seconds',lease_expires_at=clock_timestamp()-interval '20 seconds';")
# Expiry releases the slot but cannot forgive the reserved daily attempt.
verify(batch(range(2,14),day=1,concurrent=1),0,'AI_QUOTA_COMPANY_DAY')
assert sql('select count(*) from public.mdn_ai_attempts_v1;').stdout.strip()=='1'
assert sql('SET ROLE service_role; SELECT '+claim(2,concurrent=1)+';').returncode==0
assert sql("select count(*) from public.mdn_ai_attempts_v1 where status='expired';").stdout.strip()=='1'
print(json.dumps({'status':'passed','requests':75,'concurrent_slots_admitted':3,'failed_day_attempts_retained':4,'same_record_admitted':1,'uncertain_slot_retained_until_expiry':True,'production_writes':False}))
