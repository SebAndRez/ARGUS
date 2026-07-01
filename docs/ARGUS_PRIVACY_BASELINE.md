# ARGUS Privacy Baseline

## Data ARGUS May Process

- Approximate location.
- Precise location only when the user authorizes it.
- Citizen reports.
- SOS/help requests.
- Safety check status.
- Experimental QuakeSense signals.
- Emergency-contact status if explicitly configured.
- Minimal technical metadata for critical events.

## Data That Must Not Be Persisted Yet

- Raw QuakeSense sensor streams.
- Detailed movement history.
- Background tracking.
- Emergency contacts without explicit consent.
- Sensitive medical data unless optional, explicit and scoped.
- Audio or camera payloads from Sensor Safety.

## Temporary Policy

- QuakeSense and Sensor Safety stay runtime/demo until consent, retention and
  RLS are complete.
- QuakeSense and Safety do not trigger automatic sanctions.
- SOS is never blocked by reputation, achievements, sanctions automation or
  sensor safety automation.
- Public map views must not show RUT, email, phone, medical data or precise
  private location.

## Future Retention Recommendation

- Citizen reports: define retention by legal and operational need.
- Safety checks: short-term retention unless escalated.
- Aggregated sensor signals: anonymized/aggregated only.
- Admin logs: longer retention with audit controls.
- Sensitive data: minimum necessary, encrypted where appropriate.
