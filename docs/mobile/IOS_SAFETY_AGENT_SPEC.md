# iOS Safety Agent Spec

## Goal

Define the future iOS constraints for ARGUS Mobile Safety Agent. iOS background
sensor access is limited, so the design must prefer notification-first safety
checks and local foreground sensing.

## Candidate Capabilities

- Foreground motion sensing during active use.
- Push notification safety checks.
- Critical Alerts only if the product qualifies and is approved.
- Optional approximate location during emergency response.

## Safety Constraints

- No promise of background accelerometer detection.
- No hidden tracking.
- No automatic emergency dispatch.
- No official alert wording without official source correlation.

## Open Work

- Apple entitlement review.
- APNs architecture.
- Privacy manifest.
- Background mode feasibility.
