# ARGUS Mobile Safety Agent

ARGUS Mobile Safety Agent is a phase 2 foundation for a future native mobile
companion. The current implementation is a Web/PWA demo that models safety
check workflows after a possible shake.

## Current Web/PWA Demo

- Settings endpoint: `/api/mobile-safety/settings`
- Quake event endpoint: `/api/mobile-safety/quake-event`
- Check-in endpoint: `/api/mobile-safety/check-in`
- Escalation endpoint: `/api/mobile-safety/escalate`
- Map layer: `Safety Checks`
- UI module: `Modulos -> Mobile Safety Agent`

The demo does not send push notifications, does not contact emergency services
and does not track users in the background.

## Intended Native Capabilities

- Android foreground service for emergency sensing.
- iOS limited background behavior and notification-first flows.
- Local-only detection where possible.
- Optional approximate location only during emergency workflows.
- Explicit consent for emergency contacts and command center visibility.

## Escalation Rules

ARGUS can mark a check as demo-escalated, but the system must not automatically
sanction, dispatch or declare a person missing. Human review is required before
operational action.

## Limitations

The current Web/PWA implementation is not a real native safety agent. It is a
testable UX and API scaffold for future Android/iOS work.

## Sensor Safety Suite Expansion

The broader suite now includes RoadSense, FallSense, Route Guardian, Dead Man
Switch and ARGUS Black Box as demo/runtime foundations. These modules are
visible from `Modulos -> Sensor Safety` and require a native mobile app for
closed/minimized operation.
