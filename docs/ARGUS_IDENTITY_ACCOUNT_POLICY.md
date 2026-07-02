# ARGUS Identity And Account Policy

## Principle

ARGUS treats a national identity document/RUT as the account identity anchor. Email and Google login are access/contact channels, not sovereign identity.

## One Document, One Principal Account

- One RUT/national ID/document maps to one principal ARGUS account.
- The document must never be stored as plain text.
- ARGUS stores `governmentIdHash` and enforces uniqueness at the database layer.
- If a user tries to register an already attached document, ARGUS must reject the duplicate and ask the user to sign in with the associated email or request an email change.

## Email

- Email is required as an access/contact channel.
- Google can verify email ownership when `email_verified` is true.
- Local/demo login does not provide real email verification.
- Public production must not launch without a real email verification provider.

## Email Change

- Email change must happen from an authenticated profile flow.
- The previous email remains active until the new email is verified.
- The change must be audited.
- ARGUS must not activate a false or unverified email for a public production account.

## Privacy

- Never expose RUT, document number, email, medical data or precise private location publicly.
- Public identity should use `publicAlias`.
- Recovery workflows must verify the document ownership without storing the document in plain text.

## Production Gaps

- Real email verification provider.
- Account recovery and email change flow.
- Strong audit trail for identity changes.
- RLS/policies for private profile data.

