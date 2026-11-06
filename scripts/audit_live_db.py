#!/usr/bin/env python3
"""Read-only catalog audit. Never reads business rows or writes schema/data."""
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.request

ref = os.environ.get('SUPABASE_PROJECT_REF', '')
token = os.environ.get('SUPABASE_ACCESS_TOKEN', '')
if not re.fullmatch(r'[a-z]{20}', ref) or not token:
    sys.exit('Configure SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN securely.')
query = pathlib.Path(__file__).with_name('testing').joinpath('database/catalog.sql').read_text()
request = urllib.request.Request(
    f'https://api.supabase.com/v1/projects/{ref}/database/query',
    data=json.dumps({'query': query, 'read_only': True}).encode(),
    headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
    method='POST',
)
try:
    with urllib.request.urlopen(request, timeout=45) as response:
        metadata = json.load(response)[0]['metadata']
except urllib.error.HTTPError as error:
    sys.exit(f'Read-only catalog query failed (HTTP {error.code}); response body omitted.')
# Metadata only: names/types/policies/constraints; no user identities or business rows.
json.dump(metadata, sys.stdout, ensure_ascii=False, indent=2)
print()
