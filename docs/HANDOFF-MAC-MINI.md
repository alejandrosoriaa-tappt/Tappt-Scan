# Handoff — sesión de Claude Code en el Mac mini

_Escrito el 2026-08-31 desde una sesión remota, para una sesión que corra
directamente en el Mac mini de Alejandro._

## Tu ventaja sobre la sesión que escribió esto

La sesión remota no puede tocar esta máquina: no ejecuta `sudo`, no abre
Xcode, no ve el iPhone conectado. **Tú sí.** Por eso este handoff está
escrito como una secuencia de comandos, no como contexto.

## Antes de nada

```bash
cd <ruta-del-repo>/Tappt-Scan
git pull origin main
```

Lee en este orden:
1. `docs/BUILD-NATIVO-IOS.md` — el estado del build y el riesgo de versión
2. `docs/HANDOFF-2026-08-31.md` — el resto del proyecto
3. `CLAUDE.md` — quién trabaja aquí y con qué convenciones

## El objetivo

Compilar TapptScan e instalarlo en el iPhone físico de Alejandro, firmado
con **`Alejandro Soria (Personal Team)`** (firma gratuita — no requiere el
programa de Apple de 99 USD, que sigue en trámite).

ChatGPT/Codex ya dejó listo lo pesado: `app/ios` generado, 89 pods
instalados y `app/ios/TapptScan.xcworkspace` creado. **No repitas eso.**

## Paso 1 — Diagnóstico (antes de tocar nada)

```bash
sw_vers -productVersion          # versión de macOS
xcode-select -p                  # a qué apunta hoy
ls -d /Applications/Xcode.app ~/Downloads/Xcode.app 2>/dev/null
xcrun xcodebuild -version 2>/dev/null || echo "sin Xcode activo"
```

**El número que decide todo es el primero.**

## Paso 2 — La decisión de Xcode

| `sw_vers` dice | Qué hacer |
|---|---|
| **≥ 15.6** | Instalar **Xcode 26.x** y usar ese. Camino limpio: el iPhone corre iOS 26.6 y Xcode 26 lo soporta nativo. **No hace falta actualizar macOS.** |
| **< 15.6** | Seguir con Xcode 16.2 (ya descargado). Si falla al instalar en el dispositivo, subir macOS a Sequoia 15.6 y pasar a Xcode 26. |

Confirmar con Alejandro antes de descargar Xcode 26 — son varios GB.

## Paso 3 — Dejar Xcode operativo

Este es el bloqueo actual: Xcode sigue en `~/Downloads` y `xcode-select`
apunta a CommandLineTools.

```bash
sudo mv ~/Downloads/Xcode.app /Applications/
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
xcodebuild -runFirstLaunch
```

Verificar:

```bash
xcode-select -p                  # debe decir /Applications/Xcode.app/...
xcodebuild -version
```

## Paso 4 — Confirmar el iPhone

```bash
xcrun devicectl list devices
```

Debe aparecer el iPhone con su UDID y su versión de iOS. Si no aparece:
desbloquear el teléfono, aceptar "Confiar en esta computadora", y revisar
que Developer Mode siga activo (Ajustes → Privacidad y seguridad).

**Guarda el UDID**, se usa en el siguiente paso.

## Paso 5 — Compilar

La **primera** instalación conviene hacerla desde la interfaz de Xcode: la
firma con Personal Team suele necesitar que se acepte el equipo y se genere
el perfil, y eso es más fiable en la GUI.

```bash
open app/ios/TapptScan.xcworkspace
```

En Xcode: seleccionar el target `TapptScan` → pestaña **Signing &
Capabilities** → *Team* = `Alejandro Soria (Personal Team)` → elegir el
iPhone como destino → ⌘R.

Ya con el perfil generado, las siguientes se pueden hacer por CLI:

```bash
cd app/ios
xcodebuild -workspace TapptScan.xcworkspace \
  -scheme TapptScan -configuration Debug \
  -destination 'id=<UDID_DEL_IPHONE>' build
```

## Si falla

| Error | Qué significa | Salida |
|---|---|---|
| `Failed to start remote service` / iOS no soportado | Xcode 16.2 no tiene los device support files de iOS 26.6 | Ir a Xcode 26 (ver Paso 2) |
| Errores de firma / provisioning | El Personal Team no generó perfil | Revisar Signing & Capabilities en la GUI; el bundle id debe ser único |
| Fallos de compilación en pods | Algo del prebuild quedó a medias | **No borres `app/ios` sin preguntar** — son 89 pods. Intentar `pod install` dentro de `app/ios` primero |

⚠️ **`app/ios` no está versionado y costó una hora de descargas.** Antes de
cualquier `rm -rf` o `expo prebuild --clean`, consúltalo con Alejandro.

## Cuando avances

Actualiza **`docs/BUILD-NATIVO-IOS.md`** con lo que pasó y haz push a `main`.
Ese archivo es la fuente de verdad del build para todas las sesiones —
Alejandro trabaja por turnos entre Claude y ChatGPT, y lo que no quede en
GitHub se pierde entre uno y otro.

Registra sobre todo:
- Qué macOS resultó y qué Xcode se usó al final
- **Si iOS 26.6 pasó o no** (es la incógnita grande)
- Dependencias o workarounds nuevos
- Errores que se atoraron, aunque se hayan resuelto

## Contexto que no debes perder

- La app **no corre en Expo Go**: tiene el módulo nativo propio
  `TapptDocumentScanner`. `docs/DISTRIBUCION.md` está desactualizado en la
  parte de iOS, ya lleva el aviso.
- Se agregó `react-native-nitro-modules@0.36.5` como dependencia directa
  porque `react-native-iap` 16.3.0 lo exige para autoenlazarse.
- El prebuild usó la **plantilla local de SDK 51** porque la caché global de
  npm tenía permisos rotos y Node rechazaba el certificado del registro. Si
  vuelve a aparecer, ese es el contexto.
- Hay un pendiente que **bloquea producción** y no tiene que ver con el
  build: correr en Supabase
  `alter table scan_documents add column if not exists persona text;`
