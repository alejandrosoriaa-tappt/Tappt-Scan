# Memoria de trabajo de TapptScan

## 2026-08-24 — scanner nativo híbrido

- Se mantuvo el scanner web existente sin cambios de arquitectura.
- Se creó el módulo local Expo `tappt-document-scanner`:
  - iOS presenta VisionKit `VNDocumentCameraViewController` y guarda cada página como JPEG temporal.
  - Android presenta Google ML Kit Document Scanner 16.0.0 en modo `BASE` y copia cada JPEG a caché.
- Se agregó `EscanearScreen.native.js`; Metro conserva `EscanearScreen.js` para web y elige automáticamente la pantalla nativa en iOS/Android.
- Las páginas nativas se convierten al contrato actual del borrador como imágenes ya recortadas, con marco completo y filtro `color`, evitando doble detección, doble recorte o mejora destructiva.
- El borrador ahora puede agregar varias páginas atómicamente y conserva el flujo existente de mosaico, reordenar, eliminar, editar y guardar PDF en Drive.
- Se agregó `expo-dev-client` y documentación en `app/NATIVE_SCANNER.md` para desarrollo local/EAS.
- Verificación completada: 30/30 pruebas Node, export web, bundle JavaScript iOS y bundle JavaScript Android; autolinking detecta el módulo en ambas plataformas.
- Pendiente: instalar Xcode completo (y Android Studio para Android) y ejecutar el primer build nativo en dispositivos físicos.
- Publicación 2026-08-25: commit funcional `8643ff1` integrado con los guardrails remotos de `main`; merge final `3cd80f9` publicado en `origin/main` para disparar el deployment. Verificación final posterior al merge: 30/30 pruebas y build web correctos.

### Decisión de producto confirmada

- Arquitectura definitiva de captura:
  - iPhone nativo: Apple VisionKit.
  - Android nativo: Google ML Kit Document Scanner.
  - Web/PWA: motor propio DocQuad ONNX + OpenCV + estabilizador One Euro.
  - WhatsApp: recorte conservador; no alterar agresivamente la fotografía.
- Los cuatro canales desembocan en el mismo contrato de página y borrador multipágina de TapptScan.
- VisionKit y ML Kit pueden formar parte de un producto comercial. TapptScan monetiza su flujo, clasificación, organización, Drive, WhatsApp, OCR y gestión documental; no se presenta como propietario de los motores de Apple o Google.
- WeScan queda únicamente como alternativa futura si se requiere personalización profunda de la cámara iOS. No se integró porque VisionKit ofrece mejor mantenimiento, guía y escaneo multipágina para el MVP.
- Scanbot se considera solamente como alternativa comercial futura si las pruebas físicas demuestran limitaciones graves; no forma parte del código actual.
- Próximo paso operativo: instalar Xcode completo, abrirlo una vez y ejecutar `npx expo run:ios --device` desde `app/` con un iPhone físico. Después validar captura automática, lote, proporción, filtros y retorno al mosaico.
# 2026-09-01 — Inicio de preparación de APK Android

- Se confirmó la ruta comercial: no crear una cuenta personal de Play Console para intentar acelerar producción; TapptScan seguirá la ruta de organización cuando D&B entregue el D-U-N-S.
- El Motorola G86 5G será el dispositivo físico principal para las pruebas Android.
- Se revisó la configuración Android existente: paquete `lat.tappt.scan`, perfil EAS `preview` con salida APK y módulo nativo `tappt-document-scanner` basado en Google ML Kit Document Scanner 16.0.0.
- `expo-doctor` completó 18/21 verificaciones. Los controles restantes fallaron por el problema TLS `unable to get local issuer certificate` ya documentado y por la presencia esperada de carpetas nativas; no se detectó todavía un error de código Android.
- La caché global de npm contiene archivos propiedad de root; para no modificar permisos del sistema, EAS se ejecuta con `NPM_CONFIG_CACHE=/tmp/tapptscan-npm-cache`.
- La Mac no tenía una sesión Expo/EAS iniciada. Se dejó `eas-cli login` esperando autorización mediante navegador.
- Siguiente paso: completar el acceso de Expo en el navegador; después ejecutar `eas build:configure` si hace falta, lanzar `eas build --profile preview --platform android`, instalar el APK mediante enlace/QR en el Motorola y recorrer `docs/CHECKLIST-QA-USUARIO.md` con foco en ML Kit, Drive, clasificación, editor, firma, PDF y WhatsApp.

### Avance posterior

- Se creó y autenticó la cuenta Expo `tapptscan` y la organización/equipo `tapptscan-team`.
- La app móvil quedó vinculada correctamente a EAS como `@tapptscan-team/tappt-scan`, project ID `6bb36fe4-fa13-4386-9fbd-fb9ccc6cb8b0`. El enlace vive en `app/app.json`; un primer enlace creado accidentalmente en la raíz del monorepo se eliminó antes del build.
- EAS normalizó los nombres de permisos Android y agregó `RECORD_AUDIO` por la configuración de `expo-camera`; no se cambió lógica funcional.
- La Mac intercepta TLS para procesos Node. La solución segura para EAS fue exportar las CA confiables de macOS a `/tmp/tapptscan-system-ca.pem` y ejecutar con `NODE_EXTRA_CA_CERTS=/tmp/tapptscan-system-ca.pem`; no se desactivó la validación TLS.
- EAS generó y almacenó la primera keystore Android remota (`Build Credentials Plkxv4uYjf`). Debe conservarse para todas las versiones futuras de `lat.tappt.scan`.
- Build APK `preview` enviado: ID `17b36c16-deac-4862-80f8-72c43d8bec14`, URL `https://expo.dev/accounts/tapptscan-team/projects/tappt-scan/builds/17b36c16-deac-4862-80f8-72c43d8bec14`. Al último chequeo seguía `IN_QUEUE`, sin error.
- Siguiente paso inmediato: esperar `FINISHED`, obtener el `applicationArchiveUrl`, abrirlo en el Motorola G86, permitir la instalación desde el navegador e instalar. Después ejecutar el checklist completo Android.
# 2026-09-01 — Decisión de producto: un solo WhatsApp Tappt

- El número actual de WhatsApp ya está validado por Meta y su nombre visible es **Tappt**. Hoy tiene como máximo 10 usuarios F&F de Tappt Agenda y TapptScan todavía no tiene usuarios, por lo que éste es el momento adecuado para unificar sin una migración compleja.
- Se conservará ese único número como entrada de la marca Tappt. No se abrirá otro número exclusivo para TapptScan.
- Arquitectura acordada: webhook único → router de intención → motores internos separados `Agenda` y `Scan`. Texto/audio irá normalmente a Agenda; imágenes, PDF y documentos a Scan; los casos ambiguos pedirán elegir entre guardar documento o crear recordatorio.
- La identidad común será el número de WhatsApp. La autorización de Google Drive se solicitará sólo la primera vez que el usuario use Scan; Agenda debe seguir funcionando aunque Drive no esté autorizado.
- Integración diferenciadora futura: después de clasificar y guardar un documento, Scan podrá detectar vencimientos u otras acciones y ofrecer crearlas como recordatorios en Agenda.
- Mantener servicios, colas y fallos aislados: que falle clasificación/Drive no debe derribar Agenda. Actualizar consentimiento y privacidad antes de abrir a usuarios reales.
- Mensaje de producto sugerido: **Tappt — agenda y documentos por WhatsApp**.

# 2026-09-01 — QA físico Android: limpieza ML y acceso a firma

- La primera APK se instaló correctamente en el Motorola y confirmó que Google ML Kit Document Scanner es más fluido que el flujo probado en iOS: detecta contorno, permite captura manual, multipágina, recorte y rotación.
- La prueba reveló que el módulo Android estaba configurado en `SCANNER_MODE_BASE`; por eso no ofrecía la limpieza avanzada de sombras/manchas/dedos. Se cambió a `SCANNER_MODE_FULL`, conservando ML Kit como motor definitivo de Android.
- El filtro propio `Mejorar` convertía una sombra grande en una silueta negra por recortar 3% del histograma. Se redujo el recorte agresivo a 0.5% y se mezcla 28% de la imagen original para evitar negros destructivos. La limpieza principal para escaneos Android queda a cargo de ML Kit FULL.
- La firma no faltaba ni era una pantalla vacía: está implementada en `EditorScreen` y se abre después de guardar/clasificar el PDF, desde `Documento > Editar y firmar`. Para aclarar el flujo, el borrador ahora dice “Después podrás editar, firmar y ver la ruta en Google Drive” y el botón dice “Guardar PDF y continuar”.
- Se incrementó `android.versionCode` de 1 a 2. Verificación: 32/32 pruebas Node y export del bundle Android exitoso.
- Se lanzó una nueva APK preview en EAS: build ID `a8332be1-bd91-4ff6-93ff-a21600a79794`, URL `https://expo.dev/accounts/tapptscan-team/projects/tappt-scan/builds/a8332be1-bd91-4ff6-93ff-a21600a79794`.
- Pendiente inmediato: esperar a que el build termine, instalar la actualización en el Motorola y repetir la misma foto con sombra. En la interfaz ML Kit probar sus filtros antes de tocar “Siguiente”; después guardar, confirmar clasificación/ruta de Drive y entrar a “Editar y firmar”. El ajuste del filtro propio requiere también desplegar el backend para verse en producción.

# 2026-09-01 — Portadas visuales de documentos

- Se adoptó el patrón observado en el benchmark: reconocer documentos por la miniatura real de su primera página, sin perder la insignia de clasificación.
- Se agregó `GET /api/documentos/:id/miniatura`. Descarga el original desde el Drive del usuario bajo demanda, rasteriza únicamente la primera página a tamaño reducido y no guarda copias persistentes en el backend.
- Se creó `DocumentoMiniatura`, con caché de sesión en el dispositivo, fallback al icono genérico y contador cuando el documento tiene varias páginas.
- La portada aparece ahora en tres lugares: pantalla de resultado/detalle después de clasificar, lista general de Documentos y lista compacta de Recientes en Inicio. En el detalle conserva una insignia visible con el tipo clasificado.
- Se incrementó Android a `versionCode` 3 para que la próxima APK incluya tanto ML Kit FULL como las portadas.
- Verificación local: 32/32 pruebas Node, archivos JS válidos y export Android correcto (1061 módulos).
- El cambio funcional quedó en `033610e` en la rama nativa y se llevó a `main` como `bb30312`. Railway respondió saludable y la ruta nueva respondió `401 falta_token`, confirmando que el endpoint quedó desplegado.
- APK Android v3 enviada a EAS: build `7b654b68-81a7-4c09-9c2d-f5792ea85b31`, URL `https://expo.dev/accounts/tapptscan-team/projects/tappt-scan/builds/7b654b68-81a7-4c09-9c2d-f5792ea85b31`.
- Pendiente: esperar `FINISHED`, instalar la APK v3 y validar que las miniaturas aparezcan después de guardar, al volver a Documentos y en Inicio; confirmar comportamiento con PDF multipágina e imagen individual.

# 2026-11-21 — Login por SMS en iOS (riesgo de rechazo de Apple) + build 8 pendiente de subir a TestFlight

## Por qué existe esto
Apple ya rechazó MuralEx (otro producto del ecosistema) por exigir WhatsApp como único método de alta -- guía 4.8 (no se puede obligar a instalar otra app para registrarse). TapptScan/Tappt en iOS tenía el MISMO riesgo, pero peor: WhatsApp era el único método de acceso, sin alternativa. Se implementó un segundo camino exclusivo de iOS: login por SMS (6 dígitos, proveedor SMS Masivos), sin tocar WhatsApp en Android/Web.

## Qué ya quedó hecho y mezclado a `main`
- Backend: `services/smsMasivos.js`, `services/otpSms.js`, rutas `POST /api/auth/sms/iniciar` y `POST /api/auth/sms/verificar` en `routes/auth.js`, tabla `scan_otp_retos` y columnas `scan_users.telefono_sms` / `scan_users.nombre` (migración ya corrida en Supabase, confirmada "Success. No rows returned").
- App iOS: `app/src/screens/LoginScreen.js` ahora muestra en iOS un formulario de nombre+teléfono (SMS) en vez de "Entrar con WhatsApp"; Android/Web no cambiaron.
- Variables ya puestas en Railway (producción, servicio Tappt-Scan): existen `SMS_MASIVOS_API_KEY`, `TAPPT_APP_REVIEW_PHONE` y `TAPPT_APP_REVIEW_CODE` (cuenta reservada para que Apple revise sin mandar SMS real). Los valores viven SOLO en Railway -- consultar con `railway variables` si se necesitan, nunca copiarlos a este archivo, a un commit, ni exponerlos fuera del campo User name/Password de App Review Information en App Store Connect.
- Todo esto va en el PR que mezcla `sms-login-sobre-main` a `main` (ya mergeado).
- `app/app.json` -> `ios.buildNumber` subido de 7 a 8 (ya commiteado en `main`), listo para el build nuevo.

## Pendiente -- lo que Codex necesita hacer ahora
1. En `app/` ejecutar el build de iOS con EAS, perfil `production` (es el que usa distribución "store", el mismo de siempre para TestFlight):
   ```
   NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem npx eas-cli build --platform ios --profile production
   ```
   (El `NODE_EXTRA_CA_CERTS` es obligatorio en esta Mac: Node no encuentra el CA bundle del sistema sin eso y EAS falla con error TLS.)
2. Va a pedir login de Apple. Confirmar "sí" a loguearse. Antes de escribir el Apple ID, revisar/limpiar el Llavero de macOS (buscar entradas "expo"/"apple"/"EAS") -- quedó una entrada corrupta de un intento fallido anterior (un login a medio escribir guardó texto incorrecto como si fuera el Apple ID/password, y eso provocó que Apple bloqueara brevemente la cuenta con el error `-20209`; ya se confirmó que la cuenta NO sigue bloqueada, pero conviene no repetir el error).
3. Si pregunta "Generate a new Apple Distribution Certificate?" responder que SÍ (el intento anterior respondió "no" y eso llevó a pedir un archivo P12 que no existe localmente -- mejor dejar que EAS genere y guarde el certificado).
4. Si pregunta por un Provisioning Profile nuevo, también responder que sí / dejar que lo genere EAS.
5. Cuando el build termine (`FINISHED`), NO enviarlo a revisión de Apple todavía. Solo:
   - Confirmar que quedó disponible en TestFlight (grupo de pruebas internas).
   - Avisar a Alejandro con el link del build en expo.dev y en App Store Connect/TestFlight.
6. Alejandro probará en su iPhone (actualizando desde TestFlight, no reinstalando el build viejo) el flujo de SMS real con su número.
7. Instrucción permanente y explícita de Alejandro: NO reenviar esta versión a revisión de Apple (App Store Review) hasta recibir su autorización final. Subir a TestFlight para pruebas internas sí está autorizado; enviar a "Submit for Review" no.

## Checklist pendiente antes de autorizar el envío a revisión (ninguno hecho todavía)
- Probar el flujo de SMS en un iPhone real sin WhatsApp instalado.
- Probar desde cero la cuenta reservada de Apple y confirmar que el backend NO manda SMS real para ese número (ver variables en Railway).
- Confirmar que cerrar sesión y volver a entrar funciona con el nuevo flujo.
- Confirmar que borrar cuenta desde la app sigue funcionando con usuarios creados por SMS.
- Llenar App Review Information en App Store Connect: usuario/contraseña = teléfono reservado / código fijo de Railway (nunca por API ni en el cliente), y nota explicando que los usuarios normales entran por SMS y no necesitan WhatsApp.
