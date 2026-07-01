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
# ARGUS iOS Safety Agent Spec

## Estado

Especificacion futura. No existe app iOS real en este sprint.

## Capacidades

- Core Motion.
- APNs.
- Foreground sensing.
- Check-ins.
- Notificaciones.

## Limitaciones

- Background sensing limitado.
- No prometer always-on.
- Critical Alerts requieren aprobacion Apple.
- Fallback principal: check-in y notificacion.

## Permisos

- Motion & Fitness.
- Location When In Use / precise solo si corresponde.
- Notifications.

## Privacidad

- No audio/camara.
- No tracking continuo.
- Payload minimo.
- Datos medicos nunca en pantalla bloqueada.

## Testing

- QA por dispositivo.
- Pruebas de background.
- Pruebas de bateria.
- Pruebas de falsas alarmas.
