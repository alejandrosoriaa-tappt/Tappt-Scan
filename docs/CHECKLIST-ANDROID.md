# Checklist de aceptación — APK/AAB de Android

_Última actualización: 2026-09-07_

Este documento existe por una razón concreta: **v8 se compiló, se instaló y
se cerró al arrancar**, y nada en el proceso lo detectó antes de que el
usuario lo viviera. El APK no traía la clase Kotlin del escáner
(`app/.gitignore` la excluía sin darse cuenta), así que
`requireNativeModule('TapptDocumentScanner')` reventaba durante la carga y
se llevaba la app entera por delante.

La conclusión operativa es esta: **compilar no es evidencia, y "las pruebas
pasan" tampoco.** Lo que hay que verificar es el artefacto que se va a
instalar.

## 1. Verificar el artefacto (sin dispositivo)

```bash
npm run verificar:apk -- ~/Descargas/build.apk --version 0.1.1 --codigo 9
```

Comprueba, sobre el archivo mismo:

| Comprobación | Dura | Por qué |
|---|---|---|
| `Llat/tappt/documentscanner/TapptDocumentScannerModule;` en el dex | ✅ | **Es exactamente la falla de v8** |
| `Lcom/google/mlkit/vision/documentscanner/GmsDocumentScanning;` en el dex | ✅ | Sin ML Kit la clase existe pero no abre nada |
| `package` = `lat.tappt.scan` | ✅ | No confundir artefactos de otra vertical |
| `versionName` / `versionCode` esperados | ✅ (si se pasan) | Instalar el APK equivocado y depurar el anterior |
| `scan.tappt.lat` embebido en el bundle | ⚠️ aviso | Confirma `EXPO_PUBLIC_API_URL` del perfil de EAS |
| Permisos del manifiesto final | ⚠️ aviso | Los plugins agregan permisos que `app.json` no lista |
| SHA-256 y tamaño | — | Es el identificador del artefacto para el registro |

Sale con código 1 si falla una comprobación dura: **ese artefacto no se
instala ni se sube**. En `.aab` el manifiesto va en protobuf y se omite; las
comprobaciones de dex sí aplican.

## 2. Prueba de humo en el dispositivo

Con el teléfono conectado y depuración USB activa:

```bash
npm run smoke:android -- ~/Descargas/build.apk            # instalación limpia
npm run smoke:android -- ~/Descargas/build.apk --conservar # actualización encima
```

Hace instalación limpia, imprime versión y permisos concedidos según el
dispositivo, arranca en frío **tres veces** comprobando que el proceso siga
vivo, y revisa el logcat buscando `FATAL EXCEPTION`,
`Cannot find native module` y errores de `ReactNativeJS`. Deja todo en
`work/smoke-<fecha>/` como evidencia (esa carpeta no se versiona).

Los dos casos —limpio y encima de la versión anterior— son distintos y hay
que correr los dos: una migración de runtime o de esquema solo falla en el
segundo.

## 3. Matriz manual (lo que ningún script cubre)

Marcar sobre el **mismo APK** que se va a repartir.

### Arranque y cuenta

- [ ] Arranque sin red (avión) — la app abre, no se cierra.
- [ ] Login por WhatsApp: el código llega y la sesión queda amarrada.
- [ ] Conectar Drive: se crea el árbol de carpetas completo.
- [ ] Ajustes muestra versión `0.1.1 (9)`, plan y consumo correctos.

### Escaneo (ML Kit)

- [ ] Primer uso con el modelo aún sin descargar (cuenta nueva, red lenta).
- [ ] Sin red: el error se ve y la app no se cierra.
- [ ] Play Services desactualizado o dispositivo sin soporte: mensaje claro.
- [ ] Cancelar el escáner y volver a abrirlo (dos veces seguidas).
- [ ] Lotes de **1, 5, 10, 25 y 50 páginas**, anotando en cada uno:
      memoria pico, tiempo total, tamaño del envío y si la subida completa.
- [ ] Color / gris / B-N; vertical y horizontal; poca luz; ticket largo.
- [ ] Agregar páginas a un lote existente, reordenar, borrar una página.
- [ ] Cerrar la app a media captura y volver a abrir.

### Importación

- [ ] Foto de la galería, PDF de Archivos, PDF de Drive, PDF de WhatsApp.
- [ ] Archivo grande (> 20 MB) y archivo corrupto.

### Clasificación y archivo

- [ ] El documento aparece en Drive con nombre y ruta correctos.
- [ ] Un documento ambiguo cae en `99 · Por revisar`, no en una carpeta mala.
- [ ] Editar y firmar un PDF; el resultado se abre bien en Drive.

### Red y límites

- [ ] Red lenta, pérdida de red a media subida, timeout y reintento:
      **no debe quedar el documento duplicado**.
- [ ] Un error de subida **no** descuenta cupo del plan.

### Cobertura

- [ ] Repetir el recorrido mínimo en al menos **dos marcas/chipsets** y en
      **dos versiones de Android** de las soportadas.

## 4. Registro de evidencia

Antes de repartir el APK, dejar archivado:

```
build ID de EAS · commit (SHA) · SHA-256 del artefacto · salida de
verificar:apk · salida de smoke:android · matriz marcada · quién aprobó
```

Sin ese registro no se sabe qué se probó ni sobre qué binario, que es
justamente lo que hizo tan caro depurar v5–v9.

## 5. Go / no-go

**No-go** con cualquier P0/P1 abierto, con una comprobación dura en rojo, o
si la matriz se corrió sobre un APK distinto al que se va a repartir.

**Go** cuando: el verificador pasa, el humo es limpio, el recorrido mínimo
(escanear → editar → guardar, más importar) funciona, y los lotes de 1/10/50
páginas terminan sin cierres ni timeouts.

## 6. Antes de iOS / TestFlight

- [ ] Cerrar Android primero: los mismos casos, no supuestos.
- [ ] Subir `ios.buildNumber` en **cada** carga (hoy va en `1`, Android en 9).
- [ ] `eas credentials`: verificar certificados y perfiles, no regenerarlos
      si los actuales sirven.
- [ ] Prebuild y Pods limpios; el autolinking debe listar
      `TapptDocumentScanner`.
- [ ] Inspeccionar el IPA: módulo presente, bundle id, versión, privacidad.
- [ ] VisionKit: terminar, cancelar, error, agregar páginas, 1/5/10/25/50.
- [ ] Importar desde Archivos, iCloud Drive, Google Drive y Fotos.
- [ ] Permisos de cámara y fotos: primera solicitud, denegación y Ajustes.
- [ ] Nunca publicar OTA que cruce `appVersion` o código nativo.

## Regla de OTA que sale de esta auditoría

v5 a v8 compartieron `runtimeVersion` fijo `1.0.0` mientras el código nativo
cambiaba debajo. Eso permite publicar JS incompatible sobre un binario que
no lo soporta. Desde v9 la política es `appVersion`:

> **Cualquier cambio de módulo nativo, dependencia nativa o configuración
> nativa obliga a subir `expo.version`.** Una OTA nunca cruza runtimes.
