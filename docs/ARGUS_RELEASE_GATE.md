# ARGUS Release Gate

## Preview Gate

Preview can be considered only if:

- build passes
- Prisma validate passes
- Prisma generate passes
- basic smoke passes
- no secrets are staged
- no `.env` or `.vercel` files are staged
- demo/runtime/experimental modules are clearly labeled

## Production Gate

Production requires:

- `npm.cmd run lint`
- `npm.cmd run build`
- `npx.cmd prisma validate`
- `npx.cmd prisma generate`
- `npx.cmd prisma migrate status`
- `git diff --check`
- smoke for `/app`, `/dashboard`, `/api/events`, `/api/ingest/status`
- review of staged files
- no destructive DB scripts
- no accidental deploy/push

## Safe Commands

- `npm.cmd run release:check`
- `npm.cmd run db:validate`
- `npm.cmd run db:generate`
- `npm.cmd run db:migrate:status`

## Do Not Run Against Supabase

- `prisma db push`
- `prisma db push --force-reset`
- `npm run db:reset:local:danger`

Local-danger commands are guarded and must only run against SQLite/local or
localhost.

## Deploy

Deploy is manual and only when the owner requests it:

`vercel.cmd deploy --prod`
