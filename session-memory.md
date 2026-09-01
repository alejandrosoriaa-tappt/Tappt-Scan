# Memoria de trabajo de TapptScan

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
