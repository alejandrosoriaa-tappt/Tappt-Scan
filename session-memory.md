# Memoria de trabajo de TapptScan

## 2026-09-01 — Checklist maestro de pruebas desde la visión del usuario

- Se creó `docs/CHECKLIST-QA-USUARIO.md` para sustituir pruebas aleatorias por recorridos repetibles con puertas de avance.
- Cubre: primera apertura, login por WhatsApp, autorización/revocación de Drive, VisionKit y lote, recorte/filtros, clasificación y ruta, documentos/búsqueda/carpetas, editor/firma, importación, WhatsApp, gastos, cuenta/IAP/borrado, errores y calidad visual.
- Cada fallo debe registrar captura, hora, acción, resultado y texto literal; la hora se usa para correlacionar Railway.
- Pendiente inmediato: comenzar por el recorrido A y ejecutar A → B → C sin saltos en `iPhone ASA`; sólo después continuar con D y E.

## 2026-09-01 — Corrección de portada para verificación OAuth de Google

- Se confirmó en producción que `https://scan.tappt.lat/` sólo mostraba la pantalla “Entrar con WhatsApp”; Google la considera una portada detrás de acceso aunque la URL responda sin redirección.
- Se creó una portada pública específica de TapptScan en `/`, con descripción del producto, flujo de uso, explicación transparente del permiso `drive.file`, tratamiento de la autorización y enlaces visibles a privacidad y términos.
- La aplicación web autenticada se separó en `/app`; el retorno web del callback de Google y el `start_url` del manifest ahora apuntan a esa ruta.
- Se amplió `/privacidad.html` con las operaciones realizadas sobre datos de Google, conservación de tokens y declaración de cumplimiento de Uso Limitado.
- Verificación local: `git diff --check`, 32/32 pruebas Node y export web completados. No se pudo abrir un puerto HTTP local por la restricción del sandbox, pero se verificaron los artefactos generados y las rutas en código.
- La configuración recomendada para Google Cloud queda: principal `https://scan.tappt.lat/`, privacidad `https://scan.tappt.lat/privacidad.html`, términos `https://scan.tappt.lat/terminos.html`, dominio autorizado `tappt.lat`. No se envió una nueva solicitud de verificación.
- Pendiente inmediato: publicar estos cambios en la rama que despliega Railway, comprobar las cuatro URLs en producción y sólo entonces actualizar los enlaces de Información de la marca y pedir confirmación antes de “Enviar para verificación”.

## 2026-09-01 — Editor: texto movible y tapado negro

- Las anotaciones de texto ya colocadas se pueden arrastrar sobre la página; su nueva posición se conserva en coordenadas normalizadas y llega así al PDF final.
- Los rectángulos de “Tapar” también se pueden mover y ahora son negros por defecto en la vista previa y en el PDF generado. El blanco anterior parecía un defecto visual y no una censura.
- Se agregó una prueba que rasteriza el PDF editado y comprueba que el tapado predeterminado realmente produce píxeles negros.
- Pendiente inmediato: reinstalar en `iPhone ASA` y validar arrastre de texto, colocación/movimiento del tapado y guardado de la versión en Drive.

## 2026-09-01 — Instrucción explícita para terminar VisionKit

- La guía previa de iPhone ahora comienza con un aviso resaltado: desde la revisión de páginas hay que tocar la flecha superior izquierda para regresar a la cámara y después la palomita azul superior derecha para finalizar el lote.
- VisionKit permanece sin cambios como escáner oficial de iOS; sólo se aclaró el recorrido impuesto por su interfaz.
- Pendiente inmediato: recompilar en `iPhone ASA` y confirmar que el aviso se lea completo antes de abrir el escáner.

## 2026-09-01 — Guardado del lote y vista real de filtros

- Los logs de Railway de las 07:07 confirmaron que `error_escaneo_lote` no provenía de VisionKit ni del PDF: Supabase devolvió `PGRST204` porque su caché aún no encontraba la columna `persona` de `scan_documents`.
- El registro del documento ahora reintenta sin `persona` únicamente ante ese error exacto. La clasificación, el PDF ya subido y la ruta de Drive ya no se pierden por un desfase de caché; cualquier otro error continúa fallando normalmente.
- En el editor propio, tocar Original/Gris/B/N/Mejorar ahora actualiza la previsualización grande mediante la misma tubería que se usa al guardar. Antes sólo cambiaba el chip seleccionado y parecía que el control no funcionaba.
- VisionKit se conserva como escáner iOS. Su editor de páginas no ofrece un botón final: la flecha vuelve a la cámara y la palomita azul superior termina el lote.
- Verificación: 31/31 pruebas Node y bundle iOS completados.
- Pendiente inmediato: desplegar el fallback en producción, reinstalar la app en `iPhone ASA` y validar VisionKit → palomita → Guardar PDF → clasificación → detalle con ruta de Drive; después validar visualmente los cuatro filtros.

## 2026-09-01 — VisionKit: instrucciones y regreso al borrador

- Regla operativa confirmada: durante esta etapa, todas las pruebas nativas se hacen con `iPhone ASA` conectado físicamente a la Mac.
- Tras terminar VisionKit, la app quedaba en “Abriendo escáner…” y React Navigation mostraba una acción `REPLACE` no manejada. Causa: `EscanearScreen.native.js` intentaba reemplazar hacia `Borrador`, pero la ruta registrada se llama `BorradorEscaneo`.
- Se corrigió el destino y el resultado ahora debe regresar al borrador multipágina, desde donde continúa guardado y clasificación.
- VisionKit ya no se abre automáticamente: primero aparece una guía de tres pasos para encuadrar, cambiar a `Shutter` manual y terminar con la palomita. Esto también elimina la presentación prematura durante la transición del Stack.
- Verificación: bundle iOS completado y 31/31 pruebas Node.
- Pendiente inmediato: recompilar en el iPhone conectado y validar captura → palomita → borrador → guardar → clasificación.

## 2026-08-31 — Pase de pulido visual de la app

- Se corrigió la barra inferior: “Documentos” ya no se parte en dos líneas, iconos y etiquetas ocupan cajas de altura fija y el escalado de texto no desplaza verticalmente los tabs.
- Se corrigió el filtro activo de Documentos (antes blanco sobre blanco), se igualaron anchos y se agregó estado de accesibilidad. La búsqueda ahora tiene borde consistente y botón para limpiar.
- Las rutas dejan de mostrar códigos internos como `/99 · Por revisar/` y se presentan como migas limpias.
- El botón atrás nativo deja de mostrar el nombre técnico “Tabs”. Se reforzaron alineaciones con texto grande en detalle del documento, selector de mes, tarjetas de carpetas y Ajustes.
- Verificación: 31/31 pruebas Node, export web y bundle iOS completados.
- Pendiente: reinstalar el build del iPhone y hacer una pasada visual física por Inicio, Documentos, Gastos, Carpetas, detalle y Ajustes; cualquier diferencia propia de Dynamic Type debe validarse en dispositivo.

## 2026-08-31 — Editor y firma: `error_pagina` corregido

- “Editar y firmar” fallaba al abrir una página PDF con `error_pagina`. Los logs de Railway mostraron que el `NodeCanvasFactory` interno de `pdfjs-dist` intentaba usar el paquete opcional `canvas`, cuyo binding no estaba disponible.
- Se agregó `NapiCanvasFactory` en `services/pdf.js` y se entrega a `pdfjs` desde `getDocument`; los lienzos principal y temporales ahora usan `@napi-rs/canvas`, que ya forma parte del backend.
- Se agregó una prueba de regresión que crea un PDF con una imagen y lo rasteriza nuevamente a PNG. Pasan 31/31 pruebas.
- El arreglo quedó en `c5da817` en la rama nativa y se llevó aisladamente a `main` como `81cbe7e`. Railway reportó deployment exitoso para `scan.tappt.lat`.
- Pendiente: tocar nuevamente “Editar y firmar” en el iPhone y validar carga, anotación/firma y guardado sobre el documento real.

## 2026-08-31 — Clasificación visual más económica

- Se confirmó que VisionKit continúa siendo el escáner definitivo de iOS; este cambio no modifica la captura nativa.
- La clasificación y reclasificación de documentos cambió de Claude Opus a `claude-haiku-4-5-20251001`, conservando `CLAUDE_VISION_MODEL` como override.
- Las 30 pruebas Node pasaron. El cambio quedó en `3081f5a` en la rama nativa y se llevó aisladamente a `main` como `988270a` para no mezclar todavía los demás cambios de iOS.
- Railway desplegó `988270a` correctamente y `/health` respondió OK.
- Pendiente: reenviar una imagen real por WhatsApp después de agregar/recargar la columna `persona` en Supabase; ese problema de esquema es independiente del modelo.

## 2026-08-31 — VisionKit recuperado en la rama de build Expo 57

- La primera instalación física de la rama `claude/build-nativo-ios-docs-jud3zt` compiló y abrió, pero mostró la cámara personalizada de `expo-camera`: tomaba frames cada 1.4 segundos para el detector remoto, dibujaba contornos falsos y no estaba usando VisionKit.
- Causa confirmada: la rama de build divergió antes del commit `8643ff1`; el scanner nativo sí existía en `origin/main`, pero nunca había entrado en los seis commits de Expo 57/borrado de cuenta/IAP.
- Se integró `origin/main` en la rama de build, conservando Expo SDK 57, React 19, Navigation 7, IAP 16.5, borrado de cuenta y los scripts locales `expo run:ios`/`expo run:android`.
- Se recuperó el módulo Expo local `tappt-document-scanner`: iOS usa `VNDocumentCameraViewController` de VisionKit y Android usa Google ML Kit Document Scanner.
- Se actualizó `escanerNativo.js` a la API de archivos de Expo 57 (`new File(uri).base64()`), evitando la API legacy retirada.
- CocoaPods instaló correctamente `TapptDocumentScanner (0.1.0)` y lo enlazó con VisionKit. El bundle JavaScript iOS se exportó correctamente y las 30 pruebas Node pasaron.
- El primer rebuild con Expo 57 reveló que `Module` ya no satisface `NSObjectProtocol`, requerido por `VNDocumentCameraViewControllerDelegate`. Se corrigió separando el delegado UIKit en `TapptDocumentScannerDelegate: NSObject`; el módulo Expo conserva la promesa y el delegado sólo reenvía los tres callbacks de VisionKit.
- En la primera ejecución posterior, la pantalla quedó indefinidamente en “Abriendo escáner…”: la llamada se hacía al montar, antes de terminar la transición del Stack, y UIKit podía ignorar la presentación. Se agregó una espera de 450 ms y una guarda nativa que devuelve `ERR_VIEW_NOT_READY` en vez de dejar una promesa colgada.
- Pendiente inmediato: recompilar/reinstalar en `iPhone ASA` desde Xcode y confirmar que al elegir Escanear aparezca la interfaz oficial de Apple, capture varias páginas y regrese al borrador. La compilación CLI dentro de Codex no puede hablar con CoreSimulator/Xcode XPC; la validación final se hace desde la GUI de Xcode.

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
- Pendiente: desplegar el endpoint en Railway, construir/instalar la APK v3 y validar que las miniaturas aparezcan después de guardar, al volver a Documentos y en Inicio; confirmar comportamiento con PDF multipágina e imagen individual.
