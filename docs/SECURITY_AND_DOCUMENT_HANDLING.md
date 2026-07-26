# ARGUS — Manejo de documentación interna y sensible

Este repositorio es **público**. Cualquier archivo confirmado (`git add` + commit) en cualquier rama es, en la práctica, público desde el momento en que se hace `push` — sin importar si la rama es la principal o una rama de trabajo.

## Qué es interno y dónde vive

| Categoría | Ejemplos | Ubicación | ¿Versionado? |
|---|---|---|---|
| Documentación pública | Guías de usuario, changelog público | `docs/PUBLIC_CHANGELOG.md`, `docs/ARGUS_USER_GUIDE.md` | Sí |
| Doctrina fundacional interna | Filosofía, Doctrina Operacional, Modelo de Dominio, Diccionario Oficial | `docs/files/` | **No** — ignorado por `.gitignore`, salvo el `README.md` de esa carpeta |
| Auditorías internas | Auditorías de base de datos, seguridad, endpoints, backlog técnico | `docs/audit/`, `docs/audits/`, `docs/final-audit/` | **No** — ignorado por `.gitignore` en su totalidad |
| Arquitectura interna | Diseño e implementación de motores/canónicos, arquitectura de datos, planes de migración | `docs/architecture/` | **No** — ignorado por `.gitignore` en su totalidad |
| Seguridad, operación y mantenimiento | Modelos de permisos, rate limiting, runbooks, SLOs, telemetría, deuda técnica, cobertura de pruebas P0 | `docs/security/`, `docs/operations/`, `docs/maintenance/`, `docs/testing/` | **No** — ignorado por `.gitignore` en su totalidad |
| Especificaciones internas de producto/módulos/móvil | Matrices de capacidad, specs de apps nativas, estado de roadmap | `docs/mobile/`, `docs/modules/`, `docs/product/` | **No** — ignorado por `.gitignore` en su totalidad |
| Borradores legales pendientes de revisión | Términos, privacidad, licencia de datos — aún no revisados por un abogado | `docs/legal/private/` | **No** — ignorado por `.gitignore`, pendiente de decisión humana explícita sobre si publicar, sanitizar o retirar |

Cada carpeta admite una subcarpeta `public/` para una versión sanitizada, si en algún momento se decide publicar una contraparte de ese material.

## Reglas

1. **No uses `git add -f`** sobre ninguna ruta cubierta por `.gitignore`. Si `git status` no muestra un archivo que esperabas ver, revisa primero si está ignorado (`git check-ignore -v <ruta>`) antes de forzarlo.
2. **No copies secretos a documentación.** Ninguna cadena de conexión real, token, clave API o contraseña debe aparecer en un archivo Markdown/texto, ni siquiera "temporalmente". Usa `.env` (ya ignorado) o un gestor de secretos.
3. **Verificar antes de commitear**: `git status` y revisa cada archivo nuevo antes de `git add`. Si dudas si algo es sensible, trátalo como sensible.
4. **Crear una versión pública sanitizada**: si un documento interno necesita una contraparte pública, créala como archivo nuevo y explícito bajo una carpeta pública (p. ej. `docs/audits/public/`), nunca renombrando o moviendo el original — revisión manual obligatoria antes de commitear esa versión.
5. **Reportar una exposición accidental**: si un archivo sensible aparece en `git log` o ya fue empujado al remoto, no lo borres localmente ni intentes "arreglarlo" solo. Avisa de inmediato a quien administre el repositorio — retirar el archivo del índice (`git rm --cached`) no elimina el contenido de commits anteriores ya publicados; eso requiere una decisión y un procedimiento aparte.
6. **Respaldo**: la documentación sensible (`docs/files/`, `docs/audits/`) debe conservarse también en un respaldo local cifrado, no solo en el disco de trabajo — este repositorio nunca es su único lugar de conservación.

## Verificar si un archivo está protegido

```bash
git check-ignore -v docs/files/"NOMBRE DEL ARCHIVO.docx"
```

Si el comando no imprime nada, el archivo **no** está ignorado — no lo agregues sin revisar antes con quien administre el repositorio.
