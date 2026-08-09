# Puesta en marcha — todo lo que hay que crear y configurar

_Última actualización: 2026-08-09_

Orden recomendado. Cada paso depende del anterior, y el paso 4 (Google)
necesita la URL que sale del paso 3 (Railway).

---

## 1 · Supabase — base de datos y sesiones

Proyecto **propio** de TapptScan. No reutilizar el de Tappt ni el del bróker.

1. Crear proyecto en [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → pegar **`scan_schema.sql`** completo y correrlo.
   Crea las cuatro tablas, los índices y activa RLS. Es idempotente.
3. **Authentication → Providers → Email**: activarlo. Si se quiere probar sin
   confirmar correos, desactivar *Confirm email* mientras dure la beta.
4. Copiar de **Project Settings → API**:

| Dato | Va en |
|---|---|
| Project URL | `SUPABASE_URL` (backend) y `EXPO_PUBLIC_SUPABASE_URL` (app) |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` — **solo backend, nunca en la app** |
| `anon` key | `EXPO_PUBLIC_SUPABASE_ANON_KEY` (app) |

> La `service_role` ignora RLS: si acaba en el bundle de la app, cualquiera
> puede leer y escribir toda la base. Va únicamente en Railway.

---

## 2 · Anthropic

1. Crear API key en [console.anthropic.com](https://console.anthropic.com).
2. `ANTHROPIC_API_KEY`.

Se usa en dos lugares: clasificar el documento (`CLAUDE_VISION_MODEL`) y
responder preguntas de gasto (`CLAUDE_CONSULTAS_MODEL`). Ambos se pueden
bajar a un modelo más chico para reducir costo por escaneo.

---

## 3 · Railway — el backend

1. **New Project → Deploy from GitHub repo** → `Tappt-Scan`, rama
   `claude/new-session-9mhtdk`.
2. Railway detecta Node y corre `npm start`. No hace falta Dockerfile.
3. **Settings → Networking → Generate Domain**. Esa URL es la base de todo
   lo que sigue; llamémosla `https://TU-APP.up.railway.app`.
4. **Variables**: pegar todas las de `.env.example` con sus valores.
   `PORT` lo inyecta Railway solo.

**No hace falta base de datos en Railway.** Los datos viven en Supabase y los
archivos en el Drive del usuario. Railway solo corre el proceso.

Comprobación: `GET https://TU-APP.up.railway.app/health` → `{"ok":true}`.

> Si el server no arranca y el log dice `[guardrail]`, es a propósito:
> `WHATSAPP_PHONE_NUMBER_ID` y `EXPECTED_WHATSAPP_PHONE_NUMBER_ID` no
> coinciden. Deben tener el mismo valor.

---

## 4 · Google Cloud — Drive

Detalle y el porqué del scope en **`docs/GOOGLE-DRIVE.md`**. Resumen:

1. Proyecto nuevo → habilitar **Google Drive API**.
2. **Pantalla de consentimiento**: External, nombre `TapptScan`, correos de
   contacto, dominio autorizado (verificado en Search Console) y URLs
   públicas de privacidad y términos.
3. **Scope: solo `.../auth/drive.file`.** Agregar `drive` o `drive.readonly`
   mete el proyecto en el carril de evaluación de seguridad y atrasa el
   lanzamiento meses.
4. **Credenciales → OAuth client ID → Web application**. Un solo cliente
   sirve para iOS, Android y web, porque quien habla con Google es el
   backend.
   - **Authorized redirect URI**:
     `https://TU-APP.up.railway.app/api/drive/callback`
   - Ese mismo valor va en `GOOGLE_REDIRECT_URI`.
5. **Publicar a producción** antes de repartir la beta: en modo *Testing*
   los refresh tokens caducan a los **7 días** y hay tope de 100 usuarios.

---

## 5 · WhatsApp Cloud API

Número **propio** de TapptScan, distinto al de Tappt y al del bróker.

> ### ⚠️ Un número = un webhook = una app de Meta
>
> El webhook se configura **por app de Meta**, no por número. De ahí salen
> dos trampas:
>
> 1. Apuntar a TapptScan un número que ya usa otra vertical **la deja sin
>    recibir mensajes**, en silencio. No falla: simplemente dejan de llegar.
> 2. Meter un número nuevo en la **misma app** de otra vertical hace que los
>    eventos de ambos números caigan en la **misma URL**. Por eso cada
>    vertical necesita su propia app de Meta, no solo su propio número.
>
> **Si se recicla un número de otra vertical** (por ejemplo el de Tania IA,
> del bróker), hay que además:
> - Confirmar que esa vertical ya no opera ahí.
> - Cambiar el **perfil de empresa**: nombre visible, descripción, categoría
>   y sitio web. Si no, quien escriba a TapptScan verá la marca anterior.
> - Sacar el número de la app vieja y darlo de alta en la app de TapptScan.

1. [developers.facebook.com](https://developers.facebook.com) → nueva app de
   tipo **Business** → agregar producto **WhatsApp**.
2. De **API Setup**: `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`.
   Copiar el mismo id también en `EXPECTED_WHATSAPP_PHONE_NUMBER_ID`.
3. De **Configuración → Básica**: la clave secreta de la app →
   `WHATSAPP_APP_SECRET`.
4. **Configurar el webhook**:
   - Callback URL: `https://TU-APP.up.railway.app/webhook`
   - Verify token: el string que hayas puesto en `WHATSAPP_VERIFY_TOKEN`.
   - Suscribirse al campo **`messages`**.
5. El token de API Setup es temporal (24 h). Para producción hay que generar
   un token permanente de usuario de sistema en Business Manager.

---

## 6 · Stripe — cobros

1. `STRIPE_SECRET_KEY` desde **Developers → API keys**.
2. **Developers → Webhooks → Add endpoint**:
   - URL: `https://TU-APP.up.railway.app/api/pagos/webhook`
   - Evento: **`checkout.session.completed`**
   - Copiar el **Signing secret** → `STRIPE_WEBHOOK_SECRET`.
3. `STRIPE_SUCCESS_URL` y `STRIPE_CANCEL_URL`: dos páginas cualesquiera de
   tu sitio.
4. Precios por moneda en `services/planes.js` (`PRECIOS`). Para vender en
   otro país basta agregar la divisa ahí.

No hay que crear productos ni precios en el panel de Stripe: las sesiones se
arman con `price_data` en el código.

---

## 7 · La app

`app/.env` (a partir de `app/.env.example`):

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_API_URL=https://TU-APP.up.railway.app
```

`EXPO_PUBLIC_API_URL` **nunca** debe apuntar a `localhost`: el teléfono de un
tester no ve tu máquina.

Probar: `cd app && npm install && npm start`, escanear el QR con Expo Go.
Para repartirla, ver `docs/DISTRIBUCION.md`.

---

## Resumen de variables

**Railway (backend) — 18 variables** (`PORT` la pone Railway):

```
WHATSAPP_TOKEN                    WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_VERIFY_TOKEN             WHATSAPP_APP_SECRET
EXPECTED_WHATSAPP_PHONE_NUMBER_ID
SUPABASE_URL                      SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY                 CLAUDE_VISION_MODEL
CLAUDE_CONSULTAS_MODEL
GOOGLE_CLIENT_ID                  GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
STRIPE_SECRET_KEY                 STRIPE_WEBHOOK_SECRET
STRIPE_MONEDA                     STRIPE_SUCCESS_URL
STRIPE_CANCEL_URL
```

**App — 3 variables:** las tres `EXPO_PUBLIC_*` de arriba.

---

## Primera prueba, en este orden

1. `GET /health` responde `{"ok":true}`.
2. Crear cuenta en la app → llegar al onboarding.
3. **Conectar Drive** → revisar que aparezcan las **36 carpetas** en tu Drive.
4. Generar el código de 6 dígitos y mandarlo por WhatsApp → debe responder
   que quedó conectado.
5. **Mandar una foto de un recibo por WhatsApp.** Es la prueba que importa:
   debe contestar con el nombre y la ruta, y el PDF debe aparecer archivado
   en tu Drive.
6. Repetir con **cinco documentos distintos** (recibo de luz, ticket de
   súper, identificación, contrato, factura) y ver dónde cae cada uno. Ahí
   se descubre si el catálogo de `services/taxonomia.js` aguanta documentos
   reales — ajustarlo es una sola edición.
7. Reenviar un **PDF** desde otro chat.
8. Llegar a los 5 escaneos y comprobar que ofrece el upgrade.
9. Pagar con una tarjeta de prueba de Stripe y verificar que el plan sube.
