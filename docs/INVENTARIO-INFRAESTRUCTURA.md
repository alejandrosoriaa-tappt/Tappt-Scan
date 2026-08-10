# Inventario de infraestructura — TapptScan

_Última actualización: 2026-08-10_

Qué cuenta/proyecto usa cada pieza de TapptScan, y en qué org vive. Ningún
secreto va aquí — solo nombres, IDs y URLs, para que cualquier sesión de
Claude Code sepa dónde está cada cosa sin tener que preguntar de nuevo. Las
llaves reales viven **solo en Railway** (ver `docs/PUESTA-EN-MARCHA.md`).

> Regla de fondo (de `CLAUDE.md` de `tappt-backend`): cada vertical es un
> producto independiente con su propia infraestructura. TapptScan **no**
> comparte cuenta ni proyecto con Tappt (agenda) ni con el bróker en
> ninguna de las piezas de abajo.

## GitHub

- Repo: `alejandrosoriaa-tappt/tappt-scan` (creado como `Tappt-Scan`,
  GitHub normaliza la URL a minúsculas — "repository moved" al hacer push
  es cosmético, no un error).
- Rama de trabajo: `claude/new-session-9mhtdk`.

## Supabase — base de datos

- **Cuenta separada**, no la de `alejandrosoriaa-tappt` (esa ya tenía sus 2
  proyectos gratis ocupados por Colibri y Tappt/bróker, y el límite es **por
  cuenta**, no por organización — confirmado en pantalla el 2026-08-10).
- Organización: **`tappt-scan`**.
- Proyecto: **`tappt-scan`**.
- Project ID: `wwopvnxwlzzloilolkcc`.
- Región: US West (Oregon) — `us-west-2`.
- Plan: Free.
- Schema corrido: `scan_schema.sql` completo (`Success. No rows returned`
  el 2026-08-10).
- Llaves usadas: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (pestaña
  *Legacy anon, service_role API keys* → `service_role secret`). **No** la
  `anon`/`publishable` — esa no se usa en este proyecto porque el acceso es
  siempre vía backend con service-role.

## Railway — backend

- Proyecto: **`Tappt-Scan`**, servicio conectado al repo de GitHub, rama
  `claude/new-session-9mhtdk`.
- Dominio público generado: `https://tappt-scan-production.up.railway.app`.
- Puerto: `3000` (detectado solo).
- Variables: ver `docs/PUESTA-EN-MARCHA.md` §0 y §Resumen — se cargaron a
  mano, una por una, por el Raw Editor de Railway dando problemas al pegar
  el bloque completo de golpe (se perdían líneas silenciosamente). Si hay
  que repetir esto, mejor variable por variable con `+ New Variable`.

## Google Cloud — Drive OAuth

- **Proyecto propio**: `TapptScan` (⚠️ ojo, existe un proyecto viejo
  llamado `Tappt` de la vertical de agenda — confirmar en el selector de
  proyecto, arriba a la izquierda de la consola, antes de tocar nada).
- Sin organización (`Organización: Sin organización`).
- Google Drive API: habilitada.
- Scope a usar: **solo** `drive.file` (nunca `drive` ni `drive.readonly` —
  dispara la evaluación de seguridad de Google y atrasa meses, ver
  `docs/GOOGLE-DRIVE.md`).
- Pantalla de consentimiento: en configuración (2026-08-10, en curso).
- Redirect URI a registrar: `https://tappt-scan-production.up.railway.app/api/drive/callback`.

## WhatsApp Cloud API

- App de Meta propia: **`TapptScan`** (Business, portfolio "Tappt").
- Número migrado desde la app del bróker: `+52 1 56 4417 0712`
  (`WHATSAPP_PHONE_NUMBER_ID = 1328916286960986`). La migración exige que el
  nombre visible de origen y destino coincidan primero; ya migrado, se
  intentó renombrar a `TapptScan` y Meta lo **rechazó** (motivo no
  detallado). El límite de cambios de nombre visible es mensual, así que no
  se reintenta ahora.
- **Decisión (2026-08-10):** este número se queda con el nombre "Tappt
  TaniaIA" solo para las pruebas técnicas (el nombre visible no afecta el
  funcionamiento de la API). Antes de lanzar a producción se va a **dar de
  alta un número nuevo** dentro de esta misma WABA/app, ya con el nombre
  "TapptScan" limpio desde el inicio, y se apunta `WHATSAPP_PHONE_NUMBER_ID`
  /`EXPECTED_WHATSAPP_PHONE_NUMBER_ID` a ese número nuevo en Railway.
- Token: **permanente**, generado con un usuario de sistema propio
  (`TapptScan Backend`, rol Employee — el límite de admins del portfolio
  "Tappt" ya estaba tomado por `tappt-system`) con acceso total a la app
  `TapptScan` y a su cuenta de WhatsApp, permisos
  `whatsapp_business_messaging` + `whatsapp_business_management`,
  caducidad "Nunca". Cargado en Railway el 2026-08-10.

## Stripe — cobros

- Cuenta: **Nkuvo Labs** (existente, compartida entre verticales a nivel de
  cuenta de Stripe — pero cada vertical usa sus propias `price_data`
  generadas en código, no productos fijos en el panel, así que no hay
  cruce de datos).
- Modo: probar primero con **Test mode** (tarjeta `4242 4242 4242 4242`)
  antes de pasar a llaves `live`.
- Webhook a crear: `https://tappt-scan-production.up.railway.app/api/pagos/webhook`.

## Pendiente de completar en este inventario

- Confirmación de que Stripe quedó en modo live y con qué webhook secret
  (sin escribir el secret aquí — solo la fecha en que se activó).
- Configurar el webhook de Meta (Callback URL + Verify token) — falta el
  paso 5B de `docs/PUESTA-EN-MARCHA.md`.
- Dar de alta el número nuevo con nombre "TapptScan" limpio antes de lanzar
  a producción (ver nota en la sección de WhatsApp arriba).
