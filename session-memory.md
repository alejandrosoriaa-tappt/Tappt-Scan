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
