# CLAUDE.md — Memoria del proyecto (tappt-scan)

## Qué es este repo

`tappt-scan`: monorepo con dos piezas del mismo producto —
**backend** (raíz, Node.js/Express 4 CommonJS, `server.js`) y **app nativa**
(`app/`, Expo / React Native). Es una **vertical propia**, separada de
`tappt-backend` — su propio repo, su propio número de WhatsApp, su propio
proyecto/schema de Supabase, su propio deploy en Railway. No compartir
credenciales ni tablas con `tappt-backend` o `tappt-broker`.

## Qué hace

Escaneo y firma de documentos. Claude (visión) clasifica el documento y
extrae datos clave (tipo, emisor, fecha, monto), y el archivo se sube
directo al Google Drive del propio usuario — no se persiste el archivo en
nuestros servidores, solo la metadata en Supabase.

**Tres caminos de entrada**, todos a la misma tubería:

1. **Foto por WhatsApp** — el atajo rápido para escanear al vuelo.
2. **PDF reenviado por WhatsApp** — te llega un PDF en otro chat, lo
   reenvías a TapptScan y queda listo para editar o firmar.
3. **Importar desde la app** — para trabajo con calma: archivos del
   teléfono, iCloud, Drive o la galería.

WhatsApp es el camino rápido; el trabajo detallado (editar, firmar,
organizar) se hace en la app.

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

Backend (raíz):

```bash
npm install
npm run dev     # nodemon server.js → http://localhost:3000
npm start       # node server.js
```

App nativa (`app/`):

```bash
cd app && npm install
npm start       # expo start (QR para Expo Go)
npm run ios     # simulador iOS
npm run android # emulador Android
```

Health check: `GET /health`. **Guardrail de identidad**: el server NO
arranca si `WHATSAPP_PHONE_NUMBER_ID` no coincide con
`EXPECTED_WHATSAPP_PHONE_NUMBER_ID` (aborto a propósito, evita cruzar
credenciales con otra vertical).

## Estructura

- `server.js` — arranque, guardrail de identidad, montaje de rutas.
- `routes/webhook.js` — verificación + recepción de eventos de WhatsApp
  Cloud API (imagen, texto, botones). Aplica el límite del plan antes de
  procesar y atiende "quiero personal/negocio" mandando el link de pago.
- `routes/cuenta.js` — perfil y consumo, generación del código para vincular
  WhatsApp, y alta de pago para subir de plan.
- `routes/documentos.js` — lista, gastos del mes, borrado, escaneo desde
  la cámara, importación de archivos, páginas rasterizadas para el editor
  y horneado de anotaciones.
- `routes/drive.js` — inicio de OAuth, callback (guarda tokens y crea
  carpetas) y listado de carpetas para el explorador.
- `routes/pagos.js` — webhook de MercadoPago; al aprobarse sube el plan.
- `services/auth.js` — valida el JWT de Supabase y da de alta al usuario
  la primera vez (`requireAuth` deja el usuario en `req.usuario`).
- `services/planes.js` — límites por plan (gratis: 5/mes) y conteo mensual.
- `services/mercadopago.js` — genera el link de pago y consulta el estado.
- `services/procesarDocumento.js` — tubería compartida (visión → Drive →
  DB) que usan tanto el webhook de WhatsApp como la cámara de la app.
- `services/pdf.js` — arma el PDF desde la imagen, hornea las anotaciones
  (texto, firma, imagen, emoji, tapar) con `pdf-lib`, y rasteriza páginas
  con `pdf.js` + `@napi-rs/canvas` para poder mostrarlas en la app. Ver
  `docs/EDITOR-PDF.md` y `assets/README.md`.
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

App nativa (`app/`, Expo / React Native, JS sin TypeScript):

- `App.js` — providers (navegación, safe area) y arranque.
- `src/navigation/RootNavigator.js` — stack raíz + tabs
  (Inicio · Escanear · Drive · Ajustes); `Documento` se abre como stack.
- `src/screens/DashboardScreen.js` — saludo, stats (documentos, gasto del
  mes), banner de upgrade y lista de recientes.
- `src/screens/EscanearScreen.js` — cámara de respaldo. Obligatoria por la
  guía 4.2 de Apple: la app no puede ser solo un puente a WhatsApp.
- `src/screens/DriveScreen.js` — explorador de la carpeta `TapptScan/`.
- `src/screens/DocumentoScreen.js` — detalle, datos extraídos y acciones
  (editar PDF, firmar, abrir en Drive).
- `src/screens/AjustesScreen.js` — cuenta, conexiones, plan y upgrade.
- `src/screens/LoginScreen.js` — correo + contraseña contra Supabase Auth.
- `src/screens/OnboardingScreen.js` — los dos pasos previos a escanear:
  código para vincular WhatsApp y conexión de Google Drive.
- `src/context/SesionContext.js` — sesión de Supabase + datos de la cuenta.
- `src/lib/supabase.js`, `src/lib/api.js` — cliente de auth y del backend
  (toda llamada va firmada con el JWT).
- `src/screens/EditorScreen.js` — editor multipágina: eliges herramienta y
  tocas el documento para colocar texto, firma, emoji, imagen o un tapado.
- `src/lib/importar.js` — importación desde archivos del dispositivo
  (`expo-document-picker`) o desde la galería (`expo-image-picker`).
- `src/components/FirmaPad.js` — lienzo de firma en WebView; devuelve PNG.
- `src/hooks/useCargar.js`, `src/components/DocumentoCard.js`, `src/theme.js`.

**Navegación:** tres puertas — sin sesión → Login; con sesión pero sin Drive
conectado → Onboarding; todo listo → tabs.

**Variables de la app** (`app/.env.example`): `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`.

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

Nada se ha probado todavía contra servicios reales — falta configurar el
número de WhatsApp Cloud API, el proyecto de Supabase, las credenciales de
Google OAuth y las de MercadoPago, y correr el flujo completo end-to-end.

Pendientes de código:

- **Recorte y enderezado** de la foto capturada — hoy se sube tal cual.
- **Editor**: falta arrastrar un elemento ya colocado y reemplazar texto de
  un PDF nativo en su sitio. Ver `docs/EDITOR-PDF.md`.
- **Migración pendiente en Supabase**: las columnas `mime_type`, `paginas`
  y `nombre_original` de `scan_documents` están al final de
  `scan_schema.sql` como `alter table` — hay que correrlas.
- **Fuente Unicode** (`assets/fuente-unicode.ttf`) — sin ella se omiten los
  caracteres fuera de WinAnsi. Ver `assets/README.md`.
- **Pestaña de Gastos** del plan Negocio — el endpoint
  `/api/documentos/gastos` ya existe; falta la pantalla y el Google Sheet
  en la carpeta del usuario.
- Refrescar el token de Google cuando expire (hoy se guarda tal cual).
- Recordatorios de vencimiento (plan Negocio) y multi-usuario.
