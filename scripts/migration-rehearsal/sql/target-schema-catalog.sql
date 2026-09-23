-- scripts/migration-rehearsal/sql/target-schema-catalog.sql
--
-- One JSON line describing every target-schema relation, column, enum and FK
-- (everything outside public / platform schemas), consumed by
-- lib/compare-target-schema.mjs. Read-only.
\pset format unaligned
\pset tuples_only on
WITH excluded(n) AS (VALUES ('public'), ('pg_catalog'), ('information_schema'), ('pg_toast'), ('extensions'),
                            ('migration_meta'), ('tiger'), ('tiger_data'), ('topology'))
SELECT json_build_object(
 'tables', (SELECT json_agg(json_build_object('s', n.nspname, 't', c.relname, 'k', c.relkind) ORDER BY n.nspname, c.relname)
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind IN ('r','p','v','m') AND NOT c.relispartition
              AND n.nspname NOT IN (SELECT n FROM excluded) AND n.nspname NOT LIKE 'pg\_%'),
 'columns', (SELECT json_agg(json_build_object('s', table_schema, 't', table_name, 'c', column_name, 'null', is_nullable = 'YES',
                                               'udt', udt_schema || '.' || udt_name) ORDER BY table_schema, table_name, column_name)
             FROM information_schema.columns
             WHERE table_schema NOT IN (SELECT n FROM excluded) AND table_schema NOT LIKE 'pg\_%'),
 'enums', (SELECT json_agg(json_build_object('s', n.nspname, 'e', t.typname,
                           'v', (SELECT json_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid))
                           ORDER BY n.nspname, t.typname)
           FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE t.typtype = 'e' AND n.nspname NOT IN (SELECT n FROM excluded)),
 'fks', (SELECT json_agg(json_build_object('s', n.nspname, 't', c.relname,
            'cols', (SELECT json_agg(a.attname ORDER BY k.ord) FROM unnest(con.conkey) WITH ORDINALITY k(att, ord)
                     JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.att),
            'rs', rn.nspname, 'rt', rc.relname, 'del', con.confdeltype) ORDER BY n.nspname, c.relname, con.conname)
         FROM pg_constraint con
         JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_class rc ON rc.oid = con.confrelid JOIN pg_namespace rn ON rn.oid = rc.relnamespace
         WHERE con.contype = 'f' AND NOT c.relispartition AND n.nspname NOT IN (SELECT n FROM excluded))
);
