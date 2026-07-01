# ARGUS Command Center

## Experimental Citizen Signals

ARGUS command APIs can include `earthquake_sensor` and `mobile_safety`
incidents generated from QuakeSense clusters and Safety Checks. These entries
are explicitly experimental and demo-scoped.

Operational rules:

- Treat QuakeSense as an alerta preliminar, not a confirmed earthquake.
- Treat Safety Checks as user response workflow, not automatic dispatch.
- Do not mark P0 based only on citizen motion sensors or safety check silence.
- Human review and official source correlation are required for escalation.

ARGUS Command Center turns events, reports and source context into operational
incident views. This phase uses a TypeScript/demo fallback and does not add a
Prisma migration.

## Incident

An incident is an operational file with title, type, status, priority,
severity, confidence, evidence, timeline, links and recommended actions.

## Priorities

- `P0_CRITICAL`: immediate high-impact review.
- `P1_HIGH`: strong operational concern.
- `P2_MEDIUM`: relevant but uncertain.
- `P3_LOW`: low urgency or isolated report.
- `P4_INFO`: context or informational signal.

Priority is not truth. It is an operational queue for human review.

## Evidence

Evidence is classified as official, technical, citizen, camera, weather,
historical or ARGUS rule. Historical context supports decisions but does not
confirm a current event.

## Timeline

The timeline records creation, evidence, ARGUS updates, priority changes,
status changes, official updates and closure. The demo implementation generates
timeline entries in memory.

## Actions

Allowed actions are cautious: verify official source, review nearby citizen
reports, review cameras, monitor, escalate to operator and follow competent
authority instructions when officially confirmed.

## Limitations

ARGUS estimates. It does not confirm by itself, does not issue mandatory public
orders and does not replace official information.

## AI Without Tokens

This phase uses rules, evidence scoring and context. It does not call OpenAI,
Claude, Gemini, embeddings or vector databases.
