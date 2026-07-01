# Android Safety Agent Spec

## Goal

Provide a future native Android implementation for ARGUS Mobile Safety Agent
with explicit consent, local detection and emergency check-in.

## Candidate Capabilities

- Foreground service for active emergency monitoring.
- Local accelerometer processing.
- Offline queue for safety check responses.
- High-priority notifications for check-in.
- Optional coarse location only when a safety event is triggered.

## Safety Constraints

- No continuous location by default.
- No automatic emergency dispatch.
- No exact earthquake prediction language.
- No hidden sensor capture.
- Clear consent screen for emergency contacts and command center sharing.

## Open Work

- Battery profiling.
- Permission UX.
- Local storage encryption.
- Offline retry policy.
- Integration with official alerts when available.
