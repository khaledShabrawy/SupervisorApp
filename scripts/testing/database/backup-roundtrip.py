#!/usr/bin/env python3
"""Exercise a genuine pg_dump/encrypt/decrypt/pg_restore roundtrip on synthetic data.

Both PostgreSQL containers are created by this process without network, ports or
host mounts. Never accepts a remote restore destination or live credentials.
"""
import importlib.util
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
from cryptography.exceptions import InvalidTag

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('encrypted_stream', ROOT / 'scripts/backup/encrypted_stream.py')
crypto = importlib.util.module_from_spec(spec)
spec.loader.exec_module(crypto)
IMAGE = 'postgres:17-alpine@sha256:562a6e0a66b5136bc28bef5944bbc2ddddf8ea0058d4016b96cee63f2edaf143'
env = {key: value for key, value in os.environ.items() if key not in ('DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH')}
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
containers = []

def docker(args, **options):
    return subprocess.run(DOCKER + args, env=env, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **options)

def sql(container, query):
    result = docker(['exec', '-i', container, 'psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], input=query.encode())
    return result.stdout.decode().strip()

def start(kind):
    name = 'mydan-backup-' + kind + '-' + secrets.token_hex(5)
    docker(['run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust',IMAGE])
    containers.append(name)
    # TCP readiness avoids detecting the temporary Unix-only init server.
    import time
    for _ in range(30):
        try:
            docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'])
            return name
        except subprocess.CalledProcessError:
            time.sleep(1)
    raise RuntimeError('Disposable database did not become ready.')

def digest(container):
    names = json.loads(sql(container, "select json_agg(format('%I.%I',n.nspname,c.relname) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth') and c.relkind='r'"))
    rows = []
    for name in names:
        label = name.replace("'", "''")
        rows.append("select '"+label+"' as name, count(*) as rows, md5(coalesce(string_agg(to_jsonb(t)::text,chr(10) order by to_jsonb(t)::text),'')) as checksum from "+name+" t")
    return json.loads(sql(container,"select jsonb_object_agg(name,jsonb_build_object('rows',rows,'checksum',checksum)) from ("+' union all '.join(rows)+') x'))

def main():
    with tempfile.TemporaryDirectory(prefix='mydan-synthetic-backup-') as work:
        work = Path(work)
        source = start('source')
        for name in ['scripts/testing/database/full-schema.sql','supabase/proposals/20261105_pre_release_hardening.sql','scripts/testing/database/assertions.sql']:
            sql(source, (ROOT / name).read_text())
        before = digest(source)
        key = os.urandom(32)
        archive = work / 'synthetic.dump.enc'
        # No plaintext dump is written. pg_dump has its own consistent DB snapshot.
        with tempfile.TemporaryFile() as errors:
            dump = subprocess.Popen(DOCKER + ['exec',source,'pg_dump','-U','postgres','--format=custom','--serializable-deferrable'], env=env, stdout=subprocess.PIPE, stderr=errors)
            try:
                crypto.encrypt(dump.stdout, archive, key)
            finally:
                dump.stdout.close()
            if dump.wait() != 0:
                raise RuntimeError('Synthetic pg_dump failed; no successful backup receipt created.')
        # Authenticated encryption must reject another key and modified/truncated files.
        try:
            with crypto.verified_plaintext(archive,os.urandom(32)):
                raise AssertionError('Incorrect key accepted')
        except InvalidTag:
            pass
        damaged = work / 'damaged.enc'
        raw = bytearray(archive.read_bytes()); raw[len(raw)//2] ^= 1; damaged.write_bytes(raw)
        for invalid in [damaged]:
            try:
                with crypto.verified_plaintext(invalid,key):
                    raise AssertionError('Modified archive accepted')
            except InvalidTag:
                pass
        damaged.write_bytes(archive.read_bytes()[:-1])
        try:
            with crypto.verified_plaintext(damaged,key):
                raise AssertionError('Truncated archive accepted')
        except InvalidTag:
            pass
        target = start('restore')
        roles = sql(source,"select string_agg(format('CREATE ROLE %I NOLOGIN%s;',rolname,case when rolbypassrls then ' BYPASSRLS' else '' end),chr(10)) from pg_roles where rolname not like 'pg_%' and rolname <> 'postgres'")
        sql(target, roles)
        with crypto.verified_plaintext(archive,key) as plaintext:
            # pg_restore runs only after complete GCM verification, on a new local container.
            docker(['exec','-i',target,'pg_restore','--exit-on-error','-U','postgres','-d','postgres'], stdin=plaintext)
        after = digest(target)
        if after != before:
            raise AssertionError('Restored synthetic table contents differ')
        # Verify that protected privileges and the trusted trigger also survive pg_restore.
        ready = sql(target,"select not has_table_privilege('authenticated','public.orders','SELECT') and not has_column_privilege('authenticated','public.supervisors','branch_id','UPDATE') and exists(select 1 from pg_trigger where tgname='mydan_password_changed')")
        if ready != 't':
            raise AssertionError('Authorization state was not restored')
        result = {'status':'passed','scope':'synthetic-full-application-schema-only','application_tables':len(before)-1,'synthetic_auth_tables':1,'rows_verified':sum(v['rows'] for v in before.values()),'checks':['pg_dump consistent custom archive','authenticated streaming encryption','wrong key/tamper/truncation rejection','pg_restore to isolated fresh database','all synthetic table checksums match','authorization state restored'],'production_backup_created':False}
        print(json.dumps(result))
        output = os.environ.get('MYDAN_BACKUP_TEST_REPORT')
        if output:
            Path(output).write_text(json.dumps(result,indent=2)+'\n')

try:
    main()
finally:
    for container in reversed(containers):
        subprocess.run(DOCKER+['rm','-f',container],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
