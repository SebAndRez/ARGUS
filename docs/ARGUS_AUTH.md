# ARGUS Auth

ARGUS mantiene el login local existente y agrega Google como proveedor opcional
de identidad. Google se usa solo para autenticacion basica, no para leer Gmail.

## Variables

Configurar sin exponer secretos:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `AUTH_SECRET` o `SESSION_SECRET`

## Redirect URIs

Local:

```text
http://localhost:3000/api/auth/google/callback
```

Produccion:

```text
https://argus-five-flame.vercel.app/api/auth/google/callback
```

Las previews de Vercel tienen URL distinta. Si se quiere probar OAuth en una
preview, esa URL tambien debe agregarse en Google Cloud Console.

## Scopes

ARGUS solicita solo:

- `openid`
- `email`
- `profile`

No se solicitan permisos de Gmail API.

## Login UI

- `/login` mantiene el login local existente.
- El boton `Continuar con Google` usa un SVG inline del logo Google; no descarga
  imagenes externas ni agrega librerias.
- Si faltan variables Google, `/api/auth/google/start` redirige a `/login` con
  un error controlado.
- `/app` sin sesion muestra solo un boton compacto `Login`.

## Identidad y RUT

- `googleSub` identifica la cuenta Google.
- `governmentIdHash` identifica la persona/documento y sigue siendo unico.
- Google no reemplaza el RUT/documento.
- El documento no se guarda en texto plano; el registro usa hash.
- Si el documento/RUT ya existe, el registro responde:
  `Este RUT ya esta registrado.`

Una cuenta Google puede iniciar sesion sin documento para acceso basico. Las
reglas de producto futuras pueden pedir completar identidad para reportes
formales, manteniendo SOS como prioridad operativa.

## Sesion

La cookie `argus-grid-session` es httpOnly, `sameSite=lax` y `secure` en
produccion. Si `AUTH_SECRET` o `SESSION_SECRET` existe, la cookie se firma con
HMAC SHA-256.
