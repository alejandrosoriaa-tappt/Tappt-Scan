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

- Pendiente: crear app de Meta propia para TapptScan (no reutilizar la app
  de Tania IA / bróker). Ver `docs/PUESTA-EN-MARCHA.md` §5.

## Stripe — cobros

- Cuenta: **Nkuvo Labs** (existente, compartida entre verticales a nivel de
  cuenta de Stripe — pero cada vertical usa sus propias `price_data`
  generadas en código, no productos fijos en el panel, así que no hay
  cruce de datos).
- Modo: probar primero con **Test mode** (tarjeta `4242 4242 4242 4242`)
  antes de pasar a llaves `live`.
- Webhook a crear: `https://tappt-scan-production.up.railway.app/api/pagos/webhook`.

## Pendiente de completar en este inventario

- IDs de la app de Meta / número de WhatsApp una vez creados.
- Client ID de Google OAuth una vez generado.
- Confirmación de que Stripe quedó en modo live y con qué webhook secret
  (sin escribir el secret aquí — solo la fecha en que se activó).
