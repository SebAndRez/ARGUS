# ARGUS Trust & Achievements

ARGUS Trust & Achievements separates cosmetic motivation from operational
credibility.

## Purpose

- Logros and Medallas motivate useful participation.
- Credibilidad ARGUS estimates how much confidence a report author contributes.
- Operational reputation helps review abuse, verification and trust.

The priority of an emergency never depends only on medals.

## Achievements

The base catalog has 10 achievements, each with 10 levels:

1. Reporte confirmado.
2. Verificador local.
3. Fuente confiable.
4. Observador sismico.
5. Observador climatico.
6. Cartografo ARGUS.
7. Apoyo medico basico.
8. Historial limpio.
9. Alerta comunitaria util.
10. Colaborador de crisis.

Default thresholds:

`1, 3, 5, 10, 25, 50, 100, 250, 500, 1000`.

Sensitive achievements can use lower or special thresholds. Medical, SOS and
missing-person workflows must not be gamified by volume.

## Credibilidad ARGUS

The current engine estimates trust from:

- 60% confirmed vs rejected report history.
- 20% independent or official cross-validation.
- 10% identity/account maturity.
- 10% relevant achievements, capped.

Medals cannot hide false reports. Strikes and sanctions reduce trust and can
cap the maximum score.

## Anti-abuse Rules

- Raw report count does not raise trust by itself.
- Confirmed reports count more than volume.
- Duplicate reports do not add progress.
- Rejected reports reduce credibility.
- False reports reduce credibility strongly.
- SOS does not give achievements by quantity.
- Missing Persons does not give achievements by quantity.
- Medical reports do not give points by volume.
- New-account confirmations weigh less.
- Verified independent confirmations weigh more.
- Ten suspicious confirmations do not unlock trust automatically.

## Public vs Private

Public trust profile may show:

- public alias
- trust band
- rounded trust score
- public achievements
- aggregate confirmed report count

It must not show:

- RUT or government id
- email
- phone
- private location
- medical data
- detailed sanctions

## RUT / Government ID

A unique government identity hash can help verify one-person-one-account. It
does not make a user an official authority and must not be displayed publicly.
Google login does not replace government ID.

## Current Implementation

Current implementation is runtime/calculated from existing User, Report,
AuditLog and Sanction data plus demo fallback. New Prisma trust tables are not
created in this phase to avoid unsafe migrations without RLS policy.

Future DB models can include `UserTrustProfile`, `UserAchievement` and
`TrustEvent` after RLS, retention and admin audit are ready.
