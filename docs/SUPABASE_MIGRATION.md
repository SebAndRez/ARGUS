# Supabase PostgreSQL Migration

ARGUS GRID migrated its Prisma datasource from local SQLite to Supabase
PostgreSQL.

## Environment variables

- `DATABASE_URL` is the pooled Supabase connection used by the application at
  runtime.
- `DIRECT_URL` is the direct PostgreSQL connection used by Prisma migrations.
- `NASA_FIRMS_MAP_KEY` remains required for the NASA FIRMS integration.

Local values belong in `.env.local`. This file is ignored by Git and must never
be committed. Vercel must define the same variables for deployed runtime and
build operations.

The repository only stores empty placeholders in `.env.example`.

## Prisma workflow

The initial PostgreSQL migration is stored at:

```text
prisma/migrations/20260620_init_supabase_postgres/migration.sql
```

There were no historical migration files to archive. The previous SQLite
database file remains ignored and is not part of the PostgreSQL migration
history.

`prisma migrate dev` was not used because Supabase rejected Prisma's temporary
shadow database workflow. The initial SQL was generated without a shadow
database:

```powershell
npx.cmd prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

The generated SQL was reviewed to confirm it only creates tables, unique
indexes and foreign keys. It was then applied with:

```powershell
npx.cmd prisma migrate deploy
```

An initial deployment attempt was rejected before any SQL statement ran
because the generated file contained a UTF-8 BOM. The file was rewritten as
UTF-8 without BOM, the failed attempt was marked as rolled back with
`prisma migrate resolve`, and deployment then completed successfully.

Validate and generate the client:

```powershell
npx.cmd prisma validate
npx.cmd prisma generate
```

Apply future committed migrations in production:

```powershell
npx.cmd prisma migrate deploy
```

Never run `prisma migrate reset` against Supabase. Migration operations should
use `DIRECT_URL`, while normal application queries should use the pooled
`DATABASE_URL`.

## Pending production hardening

- Row Level Security policies.
- Database roles with least privilege.
- Automated backups and recovery testing.
- Advanced audit retention and review.
- Security policies for administrative and citizen data.

## External event persistence

The incremental migration
`prisma/migrations/20260620_add_external_events_and_reliefweb/migration.sql`
adds:

- `ExternalEvent`, deduplicated by `sourceId` and `externalId`.
- `IngestionRun`, used to track source health and ingestion outcomes.
- `ExternalEventCorrelation`, reserved for persisted cross-source relations.

The migration was generated with `prisma migrate diff` against `DIRECT_URL`,
reviewed for destructive operations and applied with `prisma migrate deploy`.
No shadow database, `migrate dev`, `db push` or reset operation was used.

USGS, GDACS, NOAA Tsunami, NASA FIRMS and ReliefWeb persist fresh normalized
events. MET Norway records ingestion runs but is not stored as an external
event.
