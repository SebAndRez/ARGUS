# ARGUS GRID - Product Direction

## Civic Calm Interface

ARGUS debe sentirse como un mapa de emergencia claro, tranquilo y confiable. La interfaz civil prioriza lenguaje simple, botones grandes y una respuesta directa a seis preguntas:

1. Qué está pasando.
2. Qué tan confiable es.
3. De dónde viene.
4. Cuándo se actualizó.
5. Por qué importa.
6. Qué hacer ahora.

La información técnica existe, pero no domina la primera lectura.

## Civil y operador

- **Modo civil:** explica la situación, la distancia, la confianza y la acción recomendada con lenguaje cotidiano.
- **Modo operador:** conserva severidad, estado, fuente, coordenadas, análisis asistido y contexto técnico.
- **Regla de accesibilidad:** no depender solo del color. Usar siempre texto, indicador visual y contexto.
- **Regla de densidad:** el mapa parte limpio. Las capas especializadas se activan cuando aportan valor.

## Confianza

ARGUS cruza señales y expresa confianza; no promete certeza del 100%.

La confianza debe considerar progresivamente:

- tipo y reputación de la fuente;
- coincidencia entre fuentes;
- cercanía temporal y geográfica;
- validación institucional u operador;
- calidad de ubicación y metadata disponible.

La UI resume el resultado como **Alta**, **Media** o **Baja**, explica la fuente y, cuando exista, indica por qué la señal importa.

## Acción recomendada

Cada incidente debe ofrecer una respuesta clara:

- civil: qué hacer ahora sin lenguaje técnico;
- operador: siguiente acción operacional sugerida;
- fallback seguro: mantener distancia, seguir instrucciones oficiales y usar SOS ante peligro inmediato.

Las recomendaciones apoyan decisiones humanas. No sancionan ni ejecutan acciones automáticamente.

## Taxonomía visual

| Uso | Color | Significado |
| --- | --- | --- |
| Fuente gubernamental o institucional OSINT | Rojo institucional | Gobierno, policía, bomberos, meteorología, municipalidad, EMS |
| Fuente abierta pública o comercial | Morado | Cámara pública, EarthCam u otra webcam comercial |
| Fuente verificada ARGUS | Cian | Sensor propio o señal validada por ARGUS |
| Fuente pendiente o baja confianza | Ámbar | Sin confirmar, incompleta o bajo revisión |
| Estado normal u operativo | Verde | Seguro, validado u operativo |
| Fuente offline o histórica | Gris | Sin conexión, histórica o no verificada |

El rojo institucional debe incluir badge o etiqueta de fuente para no confundirse con el rojo de severidad crítica.

## Fuentes visuales

Las fuentes visuales futuras incluyen:

- cámaras públicas geolocalizadas;
- webcams comerciales o abiertas;
- streams institucionales y gubernamentales;
- streams ciudadanos verificados;
- sensores visuales propios de ARGUS.

Metadata prevista:

- nombre y categoría;
- URL de fuente y URL embebible;
- permiso de embed;
- ubicación y coordenadas;
- precisión: exact, venue, city, country o unknown;
- confianza y última actualización;
- clima o viento asociado;
- relación con alertas cercanas.

## Experiencia de stream

- Si el embed está permitido: video en vivo silenciado por defecto.
- Para audio o experiencia completa: abrir la fuente externa.
- Si el embed está restringido: mostrar **STREAM RESTRINGIDO** y una acción **Abrir fuente externa**.
- La metadata técnica se mantiene compacta y disponible para operadores.

No se implementará scraping ni integración real con EarthCam en esta etapa.

## Roadmap geoespacial

- capas OSINT, rutas, cámaras y viento;
- clima, dirección del viento y pluma estimada de humo o nube tóxica;
- relación espacial entre cámaras, alertas y rutas seguras;
- tablero compartido y anotaciones operacionales;
- modo crisis con jerarquía visual reforzada;
- colaboración entre civiles, operadores e instituciones.

Estas capacidades se incorporarán por etapas, con fuentes explícitas, revisión humana y límites claros de confianza.

## Visual Sources Foundation

La primera base local de fuentes visuales usa marcadores geolocalizados y datos demo:

- morado para cámaras públicas, abiertas o comerciales;
- rojo institucional para gobierno y organismos oficiales;
- cian para sensores ARGUS verificados;
- ámbar para fuentes pendientes;
- gris para fuentes offline o históricas.

El marcador de fuente usa forma e identificación de cámara para diferenciar el rojo institucional de una alerta crítica.

Al seleccionar una fuente:

- se abre un popup simple con nombre, estado y ubicación;
- un embed permitido se muestra sin autoplay ni audio;
- el audio y la experiencia completa requieren abrir la fuente original;
- una fuente restringida muestra **STREAM RESTRINGIDO** y un enlace externo;
- la metadata interna queda fuera de la vista civil principal.

Esta base no realiza scraping, no consume una API EarthCam ni analiza video. Los datos son locales y preparan la arquitectura para integraciones futuras revisadas fuente por fuente.
