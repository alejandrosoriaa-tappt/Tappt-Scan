# Escáner nativo de TapptScan

## Arquitectura

- iOS usa `VNDocumentCameraViewController` de VisionKit.
- Android usa Google ML Kit Document Scanner en modo `BASE`.
- Web conserva `EscanearScreen.js`, DocQuad/OpenCV y su cámara actual.
- Los motores nativos entregan varias páginas ya recortadas y enderezadas.
- JavaScript las convierte al contrato del borrador existente. Desde ahí se
  pueden ver en mosaico, reordenar, eliminar, editar y guardar como un PDF.
- La página nativa se manda al backend con las cuatro esquinas del marco
  completo y filtro `color`, para evitar un segundo recorte o mejora destructiva.

## Probar en un iPhone físico

VisionKit no funciona en Expo Go ni en el simulador. Requiere un development
build instalado en el teléfono.

1. Instalar Xcode completo desde la Mac App Store y abrirlo una vez.
2. Desde `app/`, ejecutar `npx expo run:ios --device`.
3. Elegir el iPhone, el equipo de firma y aceptar el perfil de desarrollador
   en el teléfono si iOS lo solicita.
4. Para cambios posteriores solo de JavaScript, ejecutar `npx expo start
   --dev-client`. Hay que recompilar únicamente cuando cambie Swift, Kotlin o
   alguna dependencia nativa.

También se puede crear un build interno con `eas build --profile development
--platform ios`. Para instalarlo en un iPhone físico con distribución interna,
el dispositivo debe estar registrado en el perfil de aprovisionamiento.

## Probar en Android

1. Instalar Android Studio y un SDK de Android compatible.
2. Desde `app/`, ejecutar `npx expo run:android --device`.
3. En el primer uso, Google Play Services puede descargar el módulo del scanner.

ML Kit requiere Android API 21 o posterior, Google Play Services y al menos
aproximadamente 1.7 GB de RAM. El flujo funciona en el dispositivo y no necesita
que TapptScan implemente su propia cámara Android.

## Nota de versión

La app sigue en Expo SDK 51. Antes de publicar conviene actualizar Expo y volver
a compilar ambos proyectos nativos con las versiones de Xcode y Android Studio
soportadas por el SDK elegido.
