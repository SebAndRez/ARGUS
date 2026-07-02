# ARGUS Auth Gate And Identity

## Implemented In This Step

- `/app`, `/dashboard`, `/dashboard/fenix`, `/app/perfil`, `/profile` and `/onboarding` are protected by middleware.
- Anonymous access to the operational map redirects to `/login?next=/app`.
- `/login` now shows a clear Google login button, local login, account creation, legal links and emergency guidance.
- `/onboarding` prepares minimum profile completion without storing sensitive documents in plain text.

## SOS Exception

The full operational map requires login. The login page keeps an `Emergencia / SOS` block visible and tells the user to contact official emergency numbers if needed. A future minimal SOS flow can be added without exposing the full map anonymously.

## Minimum Profile

Expected minimum profile fields:

- email
- email verification status
- government/document hash
- country code
- public alias
- terms/privacy acceptance

Current database supports `email`, `emailVerifiedAt`, `governmentIdHash` and `publicAlias`. Terms/privacy timestamps require a future migration.

