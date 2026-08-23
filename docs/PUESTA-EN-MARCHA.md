# Puesta en marcha — todo lo que hay que crear y configurar

_Última actualización: 2026-08-10_

Orden recomendado. Cada paso depende del anterior, y el paso 4 (Google)
necesita la URL que sale del paso 3 (Railway).

---

## 0 · El atajo: `npm run variables`

Son 20 variables repartidas en cinco consolas distintas. En vez de teclearlas
una por una en el panel de Railway:

```bash
npm run variables            # modo guiado: pregunta una por una
npm run variables -- --raw   # solo imprime la plantilla, sin preguntar
npm run variables:revisar    # revisa el .env que ya tienes
```

El script **genera** los dos secretos que se pueden generar (`JWT_SECRET`,
`WHATSAPP_VERIFY_TOKEN`), **deriva** los que salen de otros
(`EXPECTED_WHATSAPP_PHONE_NUMBER_ID`, `GOOGLE_REDIRECT_URI`), **valida** el
formato de lo que pegas, y escupe un bloque que se pega de una sola vez en el
**Raw Editor** de Railway (*Variables → `{}` Raw Editor → Save*). También
escribe `.env` y `app/.env` locales.

Escribe `PENDIENTE` en cualquier respuesta para dejarla para después —
`STRIPE_WEBHOOK_SECRET` no existe hasta que crees el endpoint, que a su vez
necesita el dominio de Railway.

> Ojo con la lista de **"Suggested Variables"** de Railway: detecta las que el
> código lee, pero **se salta las que tienen valor por defecto**
> (`WHATSAPP_NUMERO`, `CLAUDE_*_MODEL`, `STRIPE_MONEDA`, `STRIPE_SUCCESS_URL`,
> `STRIPE_CANCEL_URL`). Si te guías solo por esa lista, faltan seis.

---

## 1 · Supabase — base de datos y sesiones

Proyecto **propio** de TapptScan. No reutilizar el de Tappt ni el del bróker.

1. Crear proyecto en [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → pegar **`scan_schema.sql`** completo y correrlo.
   Crea las cuatro tablas, los índices y activa RLS. Es idempotente.
3. **No hay que tocar Authentication.** TapptScan no usa Supabase Auth: la
   identidad del usuario es su número de WhatsApp, verificado al entrar
   (ver `services/sesiones.js`). Supabase queda solo como base de datos.
4. Copiar de **Project Settings → API**:

| Dato | Va en |
|---|---|
| Project URL | `SUPABASE_URL` |
| Secret key (`sb_secret_…`, o `service_role` en la pestaña *Legacy*) | `SUPABASE_SERVICE_ROLE_KEY` |

> Ambas van **solo en Railway**. La app no necesita ninguna llave de
> Supabase: solo habla con nuestro backend.

---

## 2 · Anthropic

1. Crear API key en [console.anthropic.com](https://console.anthropic.com).
2. `ANTHROPIC_API_KEY`.

Se usa en dos lugares: clasificar el documento (`CLAUDE_VISION_MODEL`) y
responder preguntas de gasto (`CLAUDE_CONSULTAS_MODEL`). Ambos se pueden
bajar a un modelo más chico para reducir costo por escaneo.

### Corroboración óptica opcional con OpenAI

El fallback visual posterior a la captura queda apagado de forma segura. Para
probarlo en backend/Railway agrega `OPENAI_API_KEY`, configura
`OPENAI_ALIGNMENT_MODEL=gpt-5.6-luna` y finalmente activa
`OPENAI_ALIGNMENT_ENABLED=true`. La llave vive únicamente en Railway; nunca
se incluye en Expo ni en el navegador. La IA no controla el recuadro en vivo:
solo corrobora un quad parcial si coincide geométricamente con el detector
local.

---

## 3 · Railway — el backend

1. **New Project → Deploy from GitHub repo** → `Tappt-Scan`, rama
   `claude/new-session-9mhtdk`.
2. Railway detecta Node y corre `npm start`. No hace falta Dockerfile.
3. **Settings → Networking → Generate Domain**. Esa URL es la base de todo
   lo que sigue; llamémosla `https://TU-APP.up.railway.app`.
4. **Variables → `{}` Raw Editor**: pegar de un jalón el bloque que genera
   `npm run variables` (ver paso 0). `PORT` lo inyecta Railway solo.

Mientras falten variables el servicio va a aparecer como **Crashed** en cada
deploy. Es lo esperado: el proceso arranca, no encuentra lo que necesita y se
sale. Se arregla solo en cuanto guardes las variables completas — Railway
redespliega al guardar.

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
   - Eventos (los cuatro cubren el ciclo completo de la suscripción):
     - `checkout.session.completed` — primera compra
     - `invoice.paid` — renovación anual
     - `invoice.payment_failed` — la tarjeta falló
     - `customer.subscription.deleted` — canceló y venció su periodo
   - Copiar el **Signing secret** → `STRIPE_WEBHOOK_SECRET`.
3. **Settings → Billing → Customer portal**: activarlo. Es donde el usuario
   cambia su tarjeta o cancela; el bot le manda el link si escribe
   "cancelar" o "mi suscripción".
4. `STRIPE_SUCCESS_URL` y `STRIPE_CANCEL_URL`: dos páginas cualesquiera de
   tu sitio.
5. Precios por moneda en `services/planes.js` (`PRECIOS`). Para vender en
   otro país basta agregar la divisa ahí.

No hay que crear productos ni precios en el panel: las sesiones se arman con
`price_data` en el código. Es **suscripción anual**, no pago único — Stripe
renueva solo y avisa por webhook.

---

## 7 · La app

`app/.env` — una sola variable:

```
EXPO_PUBLIC_API_URL=https://TU-APP.up.railway.app
```

`EXPO_PUBLIC_API_URL` **nunca** debe apuntar a `localhost`: el teléfono de un
tester no ve tu máquina.

Probar: `cd app && npm install && npm start`, escanear el QR con Expo Go.
Para repartirla, ver `docs/DISTRIBUCION.md`.

---

## Resumen de variables

**Railway (backend) — 18 variables base y 3 opcionales** (`PORT` la pone Railway):

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

# Opcionales: fallback óptico posterior a captura
OPENAI_ALIGNMENT_ENABLED          OPENAI_API_KEY
OPENAI_ALIGNMENT_MODEL
```

**App — 1 variable:** `EXPO_PUBLIC_API_URL`. Nada más: el acceso es por
WhatsApp y todo pasa por el backend.

---

## Primera prueba, en este orden

1. `GET /health` responde `{"ok":true}`.
2. Abrir la app → **Entrar con WhatsApp** → se abre WhatsApp con el mensaje
   escrito → tocar enviar → la app debe entrar sola en un par de segundos.
3. **Conectar Drive** → revisar que aparezcan las **36 carpetas** en tu Drive.
4. **Mandar una foto de un recibo por WhatsApp.** Es la prueba que importa:
   debe contestar con el nombre y la ruta, y el PDF debe aparecer archivado
   en tu Drive.
5. Repetir con **cinco documentos distintos** (recibo de luz, ticket de
   súper, identificación, contrato, factura) y ver dónde cae cada uno. Ahí
   se descubre si el catálogo de `services/taxonomia.js` aguanta documentos
   reales — ajustarlo es una sola edición.
6. Reenviar un **PDF** desde otro chat.
7. Llegar a los 5 escaneos y comprobar que ofrece el upgrade.
8. Pagar con una tarjeta de prueba de Stripe y verificar que el plan sube.
