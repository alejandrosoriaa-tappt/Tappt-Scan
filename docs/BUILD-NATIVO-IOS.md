# Build nativo de iOS — estado

_Última actualización: 2026-08-31_

## Por qué existe este documento

`docs/DISTRIBUCION.md` dice que no hace falta Xcode porque EAS compila en la
nube. **Eso ya no aplica para iOS.** Desde que la app incluye el módulo
nativo propio `TapptDocumentScanner`, no corre en Expo Go y necesita
prebuild. ChatGPT/Codex está haciendo la compilación nativa en un **Mac
mini**, y este archivo es el registro de ese trabajo — que hasta ahora solo
vivía en un `session-memory.md` local de esa máquina, invisible para las
demás sesiones.

## Entorno

| Pieza | Versión / estado |
|---|---|
| Máquina | Mac mini |
| Xcode | **16.2** — elegido porque el macOS del equipo no admite Xcode 26.x |
| iPhone de prueba | **iOS 26.6**, Developer Mode activado, reconocido por Xcode |
| Firma | **`Alejandro Soria (Personal Team)`** — firma gratuita |
| Expo SDK | 51 (plantilla local oficial) |
| CocoaPods | 1.15.2 |

**La firma con Personal Team desbloquea las pruebas en dispositivo sin pagar
los 99 USD ni esperar el D-U-N-S.** Cada build caduca a los ~7 días. El
programa de Apple sigue haciendo falta para TestFlight y la tienda, pero ya
no bloquea probar en el teléfono.

## Lo que ya está hecho

- `app/ios` generado con **Expo Prebuild**, usando la plantilla local oficial
  de SDK 51 — se recurrió a la local porque la caché global de npm tenía
  permisos rotos y Node no aceptaba el certificado del registro.
- Se agregó **`react-native-nitro-modules@0.36.5`** como dependencia directa
  para que React Native lo autoenlace: lo exige `react-native-iap` 16.3.0 /
  NitroIap.
- **`pod install` terminó correctamente**: 85 dependencias del Podfile, 89
  pods totales, incluyendo `TapptDocumentScanner`, Expo, Hermes, NitroIap y
  NitroModules.
- Se creó **`app/ios/TapptScan.xcworkspace`**.

## 🔴 Bloqueo actual (trivial, dos comandos)

Xcode sigue en `~/Downloads`. Las herramientas de línea de comandos no
manejan bien el workspace desde ahí, y `xcode-select` todavía apunta a
CommandLineTools.

```bash
sudo mv ~/Downloads/Xcode.app /Applications/
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

## Siguiente paso

1. Correr los dos comandos de arriba.
2. Abrir `app/ios/TapptScan.xcworkspace`.
3. Seleccionar **Personal Team** y el iPhone físico.
4. Compilar e instalar.

## ⚠️ El riesgo que queda sin confirmar

**Xcode 16.2 contra iOS 26.6.** Xcode reconoció el teléfono, pero *reconocer*
no es *poder instalar*: Xcode necesita los device support files de la versión
de iOS del dispositivo, y 16.2 es de una generación muy anterior a iOS 26.6.
Lo normal en ese escenario es que el build compile y falle al instalar.

Si pasa: la salida es **actualizar macOS y usar Xcode 26.x**, que era la
alternativa que ya se había considerado al elegir la versión.

Nada de lo hecho hasta ahora se pierde si eso ocurre — los pods y el
workspace quedan; solo cambia el Xcode que los abre.
