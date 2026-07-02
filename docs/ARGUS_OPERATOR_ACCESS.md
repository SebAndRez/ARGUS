# ARGUS Operator Access

`/dashboard` is an institutional command surface. It is intentionally limited to
users with `OPERATOR` or `ADMIN` roles.

## Citizen UX

Citizens must see a clear access screen, not a technical error:

- ARGUS Command requires operator or administrator role.
- Return to map.
- Request institutional access.
- View usage guide.
- Logout.

## Security Rule

Do not unlock sanctions, audit logs or report control for common users. Role
upgrades must be handled by an authorized administrator and audited.

## Safe Owner/Admin Promotion

For the current preview phase, role promotion is handled by a local operator
script against the configured database. It must only be run by the project owner
or a trusted operator with database access.

Usage:

```powershell
tsx scripts/promoteOwnerRole.ts --email owner@example.com --role ADMIN --confirm
```

Allowed target roles:

- `OPERATOR`
- `ANALYST`
- `INSTITUTIONAL_ADMIN`
- `ADMIN`
- `SUPER_ADMIN`

The script masks email output and does not print document hashes, passwords,
tokens or connection strings. After a role change, the user should sign out and
sign in again if the current session still shows the old role.

For a safe user inventory without sensitive fields:

```powershell
tsx scripts/listUsersSafe.ts
```
