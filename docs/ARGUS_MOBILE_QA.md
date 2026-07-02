# ARGUS GRID Mobile QA

## QuakeSense And Safety Agent

- Open `/app` on iPhone Safari and Chrome mobile.
- Open `Modulos`.
- Open `ARGUS QuakeSense`.
- Confirm the panel explains experimental status and official-source limits.
- Tap `Probar demo`.
- Confirm the `Sacudida ciudadana` layer turns on and shows a QS marker.
- Open `Mobile Safety Agent`.
- Tap `Simular sacudida`.
- Confirm the blocking Safety Check modal appears.
- Tap `Estoy bien` and confirm the modal closes.
- Confirm the `Safety Checks` layer turns on and shows a marker.
- Confirm SOS and Reportar remain accessible after closing modules.

No mobile QA run should require real background sensing, push notifications or
real emergency contacts.

## Trust Profile

- Open `/profile`.
- Confirm medals fit on mobile.
- Confirm Credibilidad ARGUS badge is compact.
- Confirm no email, RUT, phone, medical data or private location appears.
- Confirm text says achievements are not emergency priority.

## Sensor Safety Suite

- Open `Modulos`.
- Open `Sensor Safety`.
- Simulate possible vehicle accident.
- Confirm Safety Check modal appears.
- Respond `Estoy bien`.
- Simulate possible fall.
- Simulate abnormal route stop.
- Simulate no response.
- Confirm `Safety Checks` layer can show demo state.
- Confirm SOS and Reportar remain accessible after closing the panel.

## Browsers and orientation

- Open `/app` in iPhone Safari.
- Open `/app` in Chrome mobile.
- Test portrait orientation.
- Rotate to landscape and return to portrait.
- Confirm the map resizes without leaving blank or displaced areas.

## Runtime and APIs

- Confirm `/api/events` returns a successful response.
- Confirm `/api/ingest/status` returns a successful response.
- Confirm `/api/risk-assessments?limit=3` returns a controlled response.
- Confirm `/api/knowledge/facts?hazardType=tsunami&country=Chile` returns a
  controlled response.
- Confirm `/api/knowledge/documents?hazardType=tsunami&country=Chile` returns a
  controlled response.
- Allow GPS and confirm the location state changes.
- Deny GPS and confirm ARGUS uses the fallback location.
- Confirm `/app` shows a visible error and retry action if the map cannot load.

## Map workflow

- Confirm the map loads and supports pan and zoom.
- Zoom out to global level and confirm ARGUS Orbit appears.
- Confirm ARGUS Orbit can be rotated with touch.
- Confirm zooming in or using the exit control returns to the 2D map.
- Open the layer panel and scroll through every control.
- Activate visual sources and open a popup.
- Activate live cameras, open a camera panel and close it.
- Confirm YouTube cameras load muted or show the external-source fallback.
- Confirm the expanded live camera catalog can be searched/scrolled without
  horizontal overflow.
- Open at least one camera marked `needs_review` and confirm the panel still
  shows source, location confidence and close control.
- Confirm closing a live camera returns focus to the map without moving layers
  or losing zoom.
- Activate routes and climate/risk.
- Activate NASA FIRMS and open a thermal event.
- Confirm the nearby events tray remains usable.
- Confirm marker symbols remain readable: earthquake diamond, tsunami triangle,
  thermal/fire glyph, citizen report circle, camera glyph and user ring.
- Open a USGS/GDACS/NOAA/FIRMS event and confirm **Analisis ARGUS** appears.
- Open a citizen report and confirm **Verificacion ARGUS** appears when there is
  no active assessment.
- Confirm the analysis block does not cover SOS, Report or the close control.

## Mobile layout

- Switch between `Vista mapa`, `Paneles` and `Capas`.
- Reload and confirm the last selected view is restored when storage is available.
- Confirm `Vista mapa` keeps SOS, Report and GPS controls visible.
- Confirm `Capas` opens a vertically scrollable layer panel.
- Confirm there is no horizontal overflow.
- Confirm the HUD respects the top safe area.
- Confirm SOS and Report remain tappable above the bottom safe area.
- Confirm the layer panel does not cover the entire viewport.
- Confirm report and SOS forms scroll when the keyboard is open.
- Confirm widgets can be hidden and restored individually from the module rail.
- Confirm the live camera panel is usable in iPhone Safari portrait and
  landscape, with the close button visible.
- Confirm ReliefWeb is not shown as an active UI layer while the endpoint remains
  available for future work.
- Confirm `/app` without session shows only a compact `Login` button.
- Confirm the `Login` button opens `/login`.
- Confirm `/login` shows local login, `Continuar con Google` and `Crear cuenta`.
- Confirm Google start redirects to Google or returns a controlled missing-config
  message.
- Confirm duplicate RUT/document registration is rejected.
- Confirm SOS and Report are aligned in a single bottom-right action stack.
- Confirm on 390x844: HUD sits with safe margins, the toolbar is higher,
  Prediccion sits below controls and Clima does not overlap it.

## Final mobile layout QA

Browsers to verify before production:

- iPhone Safari.
- iPhone Chrome.
- Android Chrome.
- Samsung Internet.
- Firefox Android.

Viewport widths:

- 360 px.
- 375 px.
- 390 px.
- 414 px.
- 430 px.

Required checks:

- `/app` loads without black screen.
- The map remains the primary visible surface.
- HUD is compact and respects safe areas.
- The main toolbar and widget rail stay compact with horizontal scroll if needed.
- Opening CAPAS closes CLIMA, RIESGO and CERCANOS.
- Opening CLIMA closes CAPAS, RIESGO and CERCANOS.
- Opening RIESGO closes CAPAS, CLIMA and CERCANOS.
- Opening CERCANOS closes CAPAS, CLIMA and RIESGO.
- `Vista mapa` clears secondary panels and leaves only essential controls.
- CAPAS opens as a contained scrollable sheet.
- CLIMA is visible as a compact pill or card.
- RIESGO / Prediccion ARGUS appears below controls with internal scroll.
- CERCANOS behaves as a bottom sheet with internal scroll.
- SOS and Reportar stay symmetric in the bottom-right action stack.
- `/app` without session shows only compact `Login`.
- There are no floating `Ocultar` buttons outside panel headers.
- There is no horizontal overflow.
- Analysis blocks show `Estimacion ARGUS` and do not claim certainty.
- `Vista mapa` exits ARGUS Orbit and returns to the operational 2D map.
- `Salir de Orbit` behaves the same as `Vista mapa`.
- Orbit does not keep CAPAS, CLIMA, RIESGO or CERCANOS stacked over the globe on
  mobile.
- The `Desaparecidos` layer can be toggled from CAPAS.
- A missing-person report appears as an `MP` marker and keeps public data
  minimal.
- The `CONFLICTOS`, `ATAQUES`, `CONTROL`, `NOTICIAS` and
  `DESASTRES CONFIRMADOS` toggles are visible in CAPAS.
- Conflict zones open a compact neutral panel and do not cover SOS, Reportar or
  the map toolbar on iPhone Safari.
- Proximity warnings use neutral wording and remain dismissible by disabling the
  conflict/event layers.
- The `Modulos` button is visible without covering SOS or Reportar.
- Open `Modulos`, open Fenix, close Fenix, open AURA and close AURA.
- AURA Basic opens as a compact panel with internal scroll.
- `SOS Medico` does not permanently cover SOS, Reportar, Clima or CAPAS.
- COMANDO / Command Center content remains contained and does not create
  horizontal overflow.
- Test modules at 360, 390, 414 and 430 px wide.

## Auth, I18N, Units And Fenix QA

- Open `/app` without session and confirm redirect to `/login?next=/app`.
- Confirm `/login` shows a highly visible Google button.
- Confirm `/login` shows local login, create-account link, legal links and
  `Emergencia / SOS` guidance.
- Confirm a newly authenticated incomplete profile is sent to `/onboarding`.
- Confirm Spanish text shows Ñ, á, é, í, ó, ú, ü, ¿ and ¡ correctly.
- Confirm English and Portuguese dictionaries can load through `useI18n`.
- Confirm browser/device language detection works when no override exists.
- Confirm Chile/default locale uses metric units.
- Confirm United States locale/country uses US customary formatting.
- Open `/dashboard/fenix`.
- Confirm `Generar simulación` is visible.
- Generate a Fenix result.
- Confirm the result shows affected zones, route impacts, exposed population,
  connected users as aggregate only, report density, shelters, medical points,
  actions, confidence and limitations.
- Confirm Fenix never exposes names, RUT, email or individual user locations.
- Confirm routing responses label demo/open-data/official status honestly.
- Confirm login asks for email and password.
- Confirm registration asks for password and confirmation.
- Confirm registration asks for alias, country, document, terms and privacy.
- Confirm Google onboarding allows editing alias.
- Confirm Google onboarding allows entering RUT/document.
- Confirm country selector exposes the ISO country list, not just 4 countries.
- Complete onboarding and confirm redirect to `/app`.
- Confirm there is no loop between `/onboarding?next=/app` and `/app/perfil#publico`.
- Confirm `/dashboard` for a non-operator shows the institutional access screen.
- Confirm Fenix shows a map/visual projection.
- Confirm Fenix map centers on the entered coordinates, not a schematic-only map.
- Confirm Fenix route lines and estimated zones align around the coordinate.
- Confirm Fenix shows sources used and data-quality limitations.
- Confirm Fenix shows 3 prediction frames.
- Confirm Fenix enables institutional action plan only for OPERATOR/ANALYST/ADMIN
  style roles.
- Confirm citizens see public Fenix mode and a clear institutional restriction.
- Confirm Fenix action wording says verify/evaluate/prepare, not automatic orders.

## Profile Persistence QA

- Register a new account and confirm city/locality is required.
- Complete onboarding and confirm city/locality is required.
- Open `/app/perfil`.
- Confirm persisted email, alias, country, city, region, language and units are
  visible.
- Confirm document value is not displayed; only document registered/pending state
  is shown.
- Update city/region/language/unit system and refresh.
- Confirm data remains visible after refresh.
- Confirm duplicate document registration is rejected without exposing the
  existing user's data.
