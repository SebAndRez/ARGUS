# ARGUS Auth Gate And Identity

## Implemented In This Step

- `/app`, `/dashboard`, `/dashboard/fenix`, `/app/perfil`, `/profile` and `/onboarding` are protected by middleware.
- Anonymous access to the operational map redirects to `/login?next=/app`.
- `/login` now shows a clear Google login button, local login, account creation, legal links and emergency guidance.
- `/onboarding` prepares minimum profile completion without storing sensitive documents in plain text.
- Local login requires email and password.
- Local registration requires password, password confirmation, public alias,
  country, national document and legal acceptance.
- Google onboarding now allows completing alias, country, document and legal
  acceptance, then redirects to `next`.

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

Updated database fields:

- `passwordHash`
- `countryCode`
- `city`
- `region`
- `preferredLanguage`
- `unitSystem`
- `termsAcceptedAt`
- `privacyAcceptedAt`
- `profileCompletedAt`

Password hashes use Node `crypto.scrypt`; no plain password is stored.

## Profile Persistence

Registration and onboarding now require a city/locality field and can store an
optional region/state. `/app/perfil` reads the persisted account profile through
`/api/profile/me` and allows updating only non-sensitive profile fields:

- public alias
- display name
- country
- city
- region
- preferred language
- unit system

The endpoint does not expose document values, password hashes or provider
secrets. It only returns whether a document hash is registered. Email and
document changes remain separate future verification flows.
