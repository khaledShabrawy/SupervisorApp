import os
import re
import json
import urllib.request
import urllib.error

SUPABASE_URL = "https://ywdlrrdkjbtpfgacuuoy.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3ZGxycmRramJ0cGZnYWN1dW95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMDAzNTgsImV4cCI6MjEwNjY3NjM1OH0.YY7pE4WNMkDLgvVg73jYFCZdVUv3YZD7kQzYsYSyPq8"

def find_queries(src_dir):
    queries = []
    # match .from('table').select('columns')
    pattern = re.compile(r"from\(\s*['\"]([a-zA-Z0-9_]+)['\"]\s*\)\s*\.select\(\s*['\"`]([^'\"`]+)['\"`]")
    
    for root, dirs, files in os.walk(src_dir):
        if 'node_modules' in dirs:
            dirs.remove('node_modules')
        if 'dist' in dirs:
            dirs.remove('dist')
        for f in files:
            if f.endswith('.ts') or f.endswith('.tsx'):
                path = os.path.join(root, f)
                with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                    content = fp.read()
                for m in pattern.finditer(content):
                    table = m.group(1)
                    cols = m.group(2).strip()
                    rel_path = os.path.relpath(path, src_dir)
                    queries.append({
                        "file": rel_path,
                        "table": table,
                        "columns": cols
                    })
    return queries

def test_query(table, cols):
    # Only test top-level column names, ignore nested joins like customer:customers(...)
    # Extract simple column names
    clean_cols = []
    for part in cols.split(','):
        part = part.strip()
        if '(' in part or ')' in part:
            continue
        if ':' in part:
            part = part.split(':')[1].strip()
        if part and '*' not in part:
            clean_cols.append(part)
    
    col_str = ','.join(clean_cols) if clean_cols else '*'
    url = f"{SUPABASE_URL}/rest/v1/{table}?select={col_str}&limit=0"
    req = urllib.request.Request(url, headers={
        'apikey': ANON_KEY,
        'Authorization': f'Bearer {ANON_KEY}'
    })
    
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return {"ok": True, "status": resp.status, "clean_cols": col_str}
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        try:
            err_json = json.loads(body)
        except:
            err_json = body
        return {"ok": False, "status": e.code, "error": err_json, "clean_cols": col_str}
    except Exception as e:
        return {"ok": False, "error": str(e), "clean_cols": col_str}

def main():
    src_dir = os.path.abspath("artifacts/mydan/src")
    queries = find_queries(src_dir)
    print(f"Discovered {len(queries)} query invocations in frontend.")
    
    # Deduplicate by (table, clean_cols)
    tested = {}
    failures = []
    successes = []
    
    for q in queries:
        key = (q['table'], q['columns'])
        if key in tested:
            res = tested[key]
        else:
            res = test_query(q['table'], q['columns'])
            tested[key] = res
        
        if not res.get("ok"):
            failures.append({
                "file": q['file'],
                "table": q['table'],
                "columns": q['columns'],
                "tested_cols": res.get("clean_cols"),
                "status": res.get("status"),
                "error": res.get("error")
            })
        else:
            successes.append(q)
            
    print(f"\n================ AUDIT SUMMARY ================")
    print(f"Total Unique Queries Tested: {len(tested)}")
    print(f"Successful: {len(tested) - len(failures)}")
    print(f"FAILED (Schema Mismatches / Missing Columns): {len(failures)}")
    print(f"===============================================\n")
    
    if failures:
        print("FAILED QUERIES:")
        for idx, f in enumerate(failures, 1):
            print(f"\n[{idx}] File: {f['file']}")
            print(f"    Table: {f['table']}")
            print(f"    Requested columns: {f['columns']}")
            print(f"    Tested columns: {f['tested_cols']}")
            err = f['error']
            if isinstance(err, dict):
                print(f"    Error Message: {err.get('message')}")
                print(f"    Hint: {err.get('hint')}")
            else:
                print(f"    Error: {err}")

if __name__ == '__main__':
    main()
