# ARGUS Map Symbol System

ARGUS GRID uses a tactical symbol grammar so the map communicates operational meaning without relying only on color.

## Principles

- Shape / icon = event type.
- Color = severity or operational priority.
- Border = confidence or source quality.
- Pulse = active, recent, high-priority or critical state.
- Size = operational importance.
- Perimeter / area = estimated, confirmed or predictive affected zone.

## Event Symbols

| Type | Shape | Use |
| --- | --- | --- |
| User location | Cyan ring with center point | Current device/user position |
| Earthquake | Diamond with crack | USGS, GDACS earthquake events |
| Tsunami | Inverted triangle with wave | NOAA tsunami watch/advisory/warning |
| Fire / thermal anomaly | Flame | NASA FIRMS thermal detections and fire events |
| Weather / wind / smoke | Flow/cloud glyph | Weather and environmental risk |
| Citizen report | Circle with dashed/reported border | Citizen reports and demo reports |
| Force report | Shield | SOS, responder or force-style reports |
| Official source / intelligence | Square with I | Official, institutional or verified OSINT nodes |
| Live camera | Camera glyph | Public cameras and visual streams |

## Severity Colors

| Severity | Meaning |
| --- | --- |
| inactive | Grey, offline or inactive |
| info | Cyan/blue, informational |
| low | Green, low priority |
| medium | Yellow, medium priority |
| high | Orange, high priority |
| critical | Red, critical priority |

Color never defines the event type. Type is always expressed by shape/icon.

## Confidence Borders

| Confidence | Border |
| --- | --- |
| raw | Thin/simple border |
| reported | Dashed border |
| verified | Solid border |
| official | Strong solid border |
| multi_source | Double border/halo |
| unknown | Muted grey border |

Examples:

- USGS earthquake: diamond, severity color by magnitude/severity, official border.
- GDACS earthquake confirmation: diamond, multi-source border.
- NOAA tsunami watch: inverted triangle, medium/high severity, official border.
- NASA FIRMS thermal focus: flame, raw border until confirmed by other sources.
- Citizen report: circle, dashed reported border.
- SOS/force report: shield, verified/reported border depending source.
- Live camera: camera glyph, reported or official border.

## Perimeters And Areas

- Confirmed zone: solid outline with soft fill.
- Estimated zone: dashed outline with transparent fill and "estimated" label.
- ARGUS hypothesis: reinforced dashed/double outline with "ARGUS hypothesis" label.

The current implementation keeps existing risk geometry and improves marker grammar first. More explicit perimeter labeling can be expanded later.
