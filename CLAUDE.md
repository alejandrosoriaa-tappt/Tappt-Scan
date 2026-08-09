# CLAUDE.md — Memoria del proyecto (tappt-scan)

## Qué es este repo

`tappt-scan`: servicio **Node.js/Express 4 (CommonJS)** independiente, en su
propio proceso (`server.js`). Es una **vertical propia**, separada de
`tappt-backend` — su propio repo, su propio número de WhatsApp, su propio
proyecto/schema de Supabase, su propio deploy en Railway. No compartir
credenciales ni tablas con `tappt-backend` o `tappt-broker`.

## Qué hace

Escaneo de documentos por WhatsApp: el usuario manda una foto, Claude
(visión) clasifica el documento y extrae datos clave (tipo, emisor, fecha,
monto), se confirma por chat con botones, y el archivo se sube directo al
Google Drive del propio usuario — no se persiste el archivo en nuestros
servidores, solo la metadata en Supabase. Una app nativa (fuera de este
repo) sirve de dashboard, editor de PDF/firmas, cámara de respaldo y
explorador de Drive.

## Stack

- Runtime: Node ≥ 18, Express 4 (CommonJS).
- Datos: Supabase (Postgres) propio, vía `services/supabase.js`
  (service-role key, sin RLS por usuario). Tablas en `scan_schema.sql`.
- IA: Anthropic (Claude, visión) para clasificar/extraer — `services/vision.js`.
- Mensajería: WhatsApp Cloud API (Meta Graph v19) — `services/whatsapp.js`.
- Almacenamiento: Google Drive del usuario vía OAuth — `services/drive.js`.
- Pagos: MercadoPago (planes Personal/Negocio), cobro fuera de la app nativa
  para evitar comisión de las tiendas (mismo patrón que `tappt-broker`).

## Comandos

```bash
npm install
npm run dev     # nodemon server.js → http://localhost:3000
npm start       # node server.js
```

Health check: `GET /health`. **Guardrail de identidad**: el server NO
arranca si `WHATSAPP_PHONE_NUMBER_ID` no coincide con
`EXPECTED_WHATSAPP_PHONE_NUMBER_ID` (aborto a propósito, evita cruzar
credenciales con otra vertical).

## Estructura

- `server.js` — arranque, guardrail de identidad, montaje de rutas.
- `routes/webhook.js` — verificación + recepción de eventos de WhatsApp
  Cloud API (imagen, texto, botones interactivos).
- `services/whatsapp.js` — mandar texto/botones, resolver y descargar media.
- `services/vision.js` — llamada a Claude vision, clasifica y extrae JSON.
- `services/naming.js` — arma carpeta destino y nombre de archivo desde el
  JSON extraído.
- `services/drive.js` — OAuth de Google, crea `TapptScan/` + subcarpetas
  (`Identificaciones`, `Recibos`, `Contratos`, `Otros`), sube archivos.
- `services/linking.js` — código de un solo uso que amarra
  número de WhatsApp ↔ cuenta ↔ carpeta de Drive.
- `services/supabase.js` — cliente Supabase (service-role).
- `scan_schema.sql` — tablas `scan_users`, `scan_documents`, `scan_links`.

## Modelo de negocio (referencia)

| Plan | Precio | Incluye |
|---|---|---|
| Gratis | $0 | 5 escaneos/mes, marca de agua, sin edición de PDF ni firmas |
| Personal | $299 MXN/año | Escaneos ilimitados, edición de PDF + firmas |
| Negocio | $499 MXN/año | + control de gastos automático, multi-usuario, recordatorios |

Cobro por WhatsApp (link de MercadoPago), nunca dentro de la app nativa.
El webhook de MercadoPago actualiza `scan_users.plan`; app y bot solo
lo consultan.

## Convenciones

- **Idioma: español** en código, docs y commits.
- **Commits:** estilo `tipo(scope): descripción`, p. ej. `feat(webhook): …`.
- Rutas en `routes/` = controladores HTTP delgados; lógica en `services/`.
- Estado durable → Supabase (proyecto/schema propio de TapptScan).
- No mezclar con `tappt-backend` ni `tappt-broker`: ni tablas, ni número de
  WhatsApp, ni env vars.

## Rama de trabajo

Rama activa: **`claude/new-session-9mhtdk`**. Desarrollar, commitear y
pushear ahí. No abrir PR salvo que se pida explícitamente.

## Estado / pendientes

- Esqueleto de backend recién creado — falta probar contra un número de
  WhatsApp Cloud API real y un proyecto de Supabase propio.
- `services/drive.js` usa OAuth de usuario final (no cuenta de servicio):
  falta el flujo completo de conexión desde la app nativa (`authUrl` /
  `exchangeCode` ya están, falta wiring del lado de la app).
- App nativa (dashboard, editor de PDF/firmas, cámara, explorador de
  Drive) vive fuera de este repo — pendiente de arrancar.
- Integración MercadoPago (webhook + generación de link de pago) pendiente.
