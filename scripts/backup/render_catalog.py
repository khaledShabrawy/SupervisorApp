#!/usr/bin/env python3
"""Render the exported app catalog for a disposable local compatibility database.

This is NOT a pg_dump replacement: Auth/Storage internals and business rows are
not present. Refuse unsupported catalog shapes rather than silently skipping them.
"""
import argparse
import json
from pathlib import Path

def ident(value):
    return '"' + value.replace('"', '""') + '"'

def qualified(row, key='name'):
    return ident(row['schema']) + '.' + ident(row[key])

def sql_string(value):
    return "'" + value.replace("'", "''") + "'"

def render(metadata):
    if metadata['types'] or metadata['sequences']:
        raise ValueError('Custom types/sequences need an explicit reviewed restore implementation.')
    if any(t['kind'] not in ('r', 'v') for t in metadata['tables']):
        raise ValueError('Partitioned/materialized objects require an explicit restore implementation.')
    roles = {'anon', 'authenticated', 'service_role'}
    for key in ('table_grants', 'column_grants', 'function_grants', 'schema_grants'):
        roles.update(row['role'] for row in metadata[key] if row['role'] != 'PUBLIC')
    lines = [
        '-- Local schema compatibility fixture; no production rows or credentials.',
        '-- Captured 2026-11-06. Not a complete Supabase backup or production migration.',
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='auth') THEN RAISE EXCEPTION 'Restore fixture requires an empty disposable database; never run it on a hosted project'; END IF; END $$;",
        'SET check_function_bodies = false;',
    ]
    for name in sorted(roles):
        lines.append('DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=' + sql_string(name)
                     + ') THEN CREATE ROLE ' + ident(name) + ' NOLOGIN; END IF; END $$;')
    lines += [
        'ALTER ROLE service_role BYPASSRLS;',
        'CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA private_rls;',
        '-- Auth is a synthetic stub for SQL/RPC authorization tests, not a copied Auth service.',
        'CREATE TABLE auth.users (id uuid PRIMARY KEY, encrypted_password text);',
        'GRANT USAGE ON SCHEMA auth, storage TO authenticated, anon;',
    ]
    for table in metadata['tables']:
        if table['kind'] != 'r':
            continue
        columns = []
        for column in metadata['columns']:
            if (column['schema'], column['table']) != (table['schema'], table['name']):
                continue
            definition = ident(column['name']) + ' ' + column['type']
            if column['identity']:
                raise ValueError('Identity columns require a sequence-aware restore.')
            if column['generated']:
                if column['generated'] != 's':
                    raise ValueError('Unsupported generated column kind.')
                definition += ' GENERATED ALWAYS AS (' + column['default'] + ') STORED'
            elif column['default']:
                definition += ' DEFAULT ' + column['default']
            if column['not_null']:
                definition += ' NOT NULL'
            columns.append(definition)
        lines.append('CREATE TABLE ' + qualified(table) + ' (\n  ' + ',\n  '.join(columns) + '\n);')
    for function in metadata['functions']:
        lines.append(function['definition'].rstrip(';') + ';')
    for constraint in metadata['constraints']:
        lines.append('ALTER TABLE ' + qualified(constraint, 'table') + ' ADD CONSTRAINT '
                     + ident(constraint['name']) + ' ' + constraint['definition'] + ';')
    lines += [statement.rstrip(';') + ';' for statement in metadata['indexes']]
    for view in metadata['views']:
        options = ' WITH (' + ','.join(view['options']) + ')' if view['options'] else ''
        lines.append('CREATE VIEW ' + qualified(view) + options + ' AS ' + view['definition'].rstrip(';') + ';')
    lines += [statement.rstrip(';') + ';' for statement in metadata['triggers']]
    for table in metadata['tables']:
        if table['kind'] == 'r':
            if table['rls']:
                lines.append('ALTER TABLE ' + qualified(table) + ' ENABLE ROW LEVEL SECURITY;')
            if table['force_rls']:
                lines.append('ALTER TABLE ' + qualified(table) + ' FORCE ROW LEVEL SECURITY;')
    for policy in metadata['policies']:
        grantees = ','.join('PUBLIC' if role == 'public' else ident(role) for role in policy['roles'])
        statement = ('CREATE POLICY ' + ident(policy['name']) + ' ON ' + qualified(policy, 'table')
                     + ' AS ' + policy['permissive'] + ' FOR ' + policy['command'] + ' TO ' + grantees)
        if policy['using']:
            statement += ' USING (' + policy['using'] + ')'
        if policy['check']:
            statement += ' WITH CHECK (' + policy['check'] + ')'
        lines.append(statement + ';')
    for schema in ('public', 'private_rls'):
        lines.append('REVOKE ALL ON SCHEMA ' + ident(schema) + ' FROM PUBLIC;')
    for grant in metadata['schema_grants']:
        grantee = 'PUBLIC' if grant['role'] == 'PUBLIC' else ident(grant['role'])
        lines.append('GRANT ' + grant['privilege'] + ' ON SCHEMA ' + ident(grant['schema']) + ' TO ' + grantee
                     + (' WITH GRANT OPTION' if grant['grantable'] else '') + ';')
    # Auth helpers are managed Supabase objects; their standard callable surface is explicit.
    lines.append('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated, anon;')
    for grant in metadata['table_grants']:
        grantee = 'PUBLIC' if grant['role'] == 'PUBLIC' else ident(grant['role'])
        lines.append('GRANT ' + grant['privilege'] + ' ON TABLE ' + qualified(grant, 'table') + ' TO ' + grantee
                     + (' WITH GRANT OPTION' if grant['grantable'] else '') + ';')
    for grant in metadata['column_grants']:
        grantee = 'PUBLIC' if grant['role'] == 'PUBLIC' else ident(grant['role'])
        lines.append('GRANT ' + grant['privilege'] + ' (' + ident(grant['column']) + ') ON '
                     + qualified(grant, 'table') + ' TO ' + grantee
                     + (' WITH GRANT OPTION' if grant['grantable'] else '') + ';')
    for function in metadata['functions']:
        if function['schema'] in ('public', 'private_rls'):
            lines.append('REVOKE ALL ON FUNCTION ' + qualified(function) + '(' + function['identity'] + ') FROM PUBLIC;')
    for grant in metadata['function_grants']:
        grantee = 'PUBLIC' if grant['role'] == 'PUBLIC' else ident(grant['role'])
        lines.append('GRANT EXECUTE ON FUNCTION ' + qualified(grant) + '(' + grant['identity'] + ') TO ' + grantee
                     + (' WITH GRANT OPTION' if grant['grantable'] else '') + ';')
    return '\n\n'.join(lines) + '\n'

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('catalog', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.write_text(render(json.loads(args.catalog.read_text())))
