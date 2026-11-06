#!/usr/bin/env python3
"""Export app metadata via Management API; SELECT catalog only, no business rows."""
import argparse
import json
import os
from pathlib import Path
import re
import urllib.error
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
ref = os.environ.get('SUPABASE_PROJECT_REF', '')
token = os.environ.get('SUPABASE_ACCESS_TOKEN', '')
if not re.fullmatch('[a-z]{20}', ref) or not token:
    raise SystemExit('Configure SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN securely.')
query = Path(__file__).with_name('catalog.sql').read_text()
request = urllib.request.Request(f'https://api.supabase.com/v1/projects/{ref}/database/query',
    data=json.dumps({'query':query,'read_only':True}).encode(),
    headers={'Authorization':f'Bearer {token}','Content-Type':'application/json'}, method='POST')
try:
    with urllib.request.urlopen(request,timeout=45) as response:
        metadata = json.load(response)[0]['metadata']
except urllib.error.HTTPError as error:
    raise SystemExit(f'Read-only metadata export failed (HTTP {error.code}); body omitted.') from None
fd = os.open(args.output,os.O_WRONLY | os.O_CREAT | os.O_EXCL,0o600)
with os.fdopen(fd,'w') as output:
    json.dump(metadata,output,indent=2)
print(json.dumps({'status':'metadata-only-exported','project_ref':ref,'counts':{k:len(v) for k,v in metadata.items()},'business_rows_exported':False}))
