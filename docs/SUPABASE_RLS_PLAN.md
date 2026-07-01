# Supabase RLS Plan

No RLS migration was created in this phase because ARGUS still uses a custom
cookie auth model rather than Supabase Auth JWT claims. Applying generic RLS now
could break runtime access without a tested role-claim strategy.

## Tables Detected

- `User`: high sensitivity. Contains email, identity hash, status and trust.
- `Report`: medium/high sensitivity. Contains citizen reports and location.
- `HelpRequest`: high sensitivity. Contains SOS and location.
- `AuditLog`: high sensitivity. Admin/security audit.
- `Sanction`: high sensitivity. Moderation/account status.
- `ExternalEvent`: low/medium. External source events.
- `RiskAssessment`: medium. ARGUS estimates and evidence.
- `HazardKnowledgeDocument`: low/medium.
- `HazardKnowledgeFact`: low/medium.

## Suggested Roles

- `CITIZEN`
- `ANALYST`
- `ADMIN`
- `INSTITUTIONAL`
- `SUPER_ADMIN`

## Suggested Policies

- Citizens can read their own account profile, reports and help requests.
- Public APIs expose only sanitized aliases and aggregate trust fields.
- Operators/analysts can read operational reports and incidents.
- Admins can manage users, sanctions and audit views.
- Audit logs are append-only for application code.

## Blockers

- Supabase Auth is not the active auth provider.
- No stable JWT role claims.
- Admin RBAC is implemented in application routes, not database policies.
- Need staging validation before enabling RLS on production tables.

## Next Step

Define a Supabase auth/RLS strategy or database role gateway, implement in
staging, then create a non-destructive SQL migration for RLS.
