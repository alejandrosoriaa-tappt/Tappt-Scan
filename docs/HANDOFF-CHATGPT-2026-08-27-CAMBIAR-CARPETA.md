# Handoff — Cambiar carpeta de documento ya guardado

Fecha: 2026-08-27

## Objetivo
Permitir que, después de guardar un documento desde WhatsApp en Google Drive, el usuario pueda corregir la clasificación o pedir otra carpeta sin reenviar el archivo.

## Base usada
Rama de origen: `claude/tappt-scan-memory-review-u0oook`
Base SHA: `6de857710ecf97cc59fdb178251608566d5fadf3`

Esa base ya incluye la sección `08 · Educación`, el nivel dinámico `persona` y la ruta de ejemplo:
`08 · Educación / Patricio Soria / Colegiaturas y pagos / Colegio / 2026`.

## Trabajo de esta sesión
Rama: `codex/cambiar-carpeta-drive`
PR: #1 — `WhatsApp: cambiar carpeta de documento ya guardado`

Cambios principales:

1. La confirmación de guardado de WhatsApp muestra ahora el botón `Cambiar carpeta` en lugar de `Es otra cosa`.
2. Al pulsarlo, se conserva el contexto y el usuario puede escribir en lenguaje natural la carpeta o explicar qué tipo de documento es.
3. Se mantiene compatibilidad con el id antiguo `otra_cosa` para botones enviados antes del despliegue.
4. Se agregaron comandos directos que no dependen del estado en memoria, por ejemplo: `mueve el último documento a Educación / Colegiaturas`.
5. Se agregó recuperación contextual para el caso real observado: después del guardado, un texto como `Es un comprobante de pago de colegiatura de Patricio Soria` se interpreta como corrección si existe un documento de los últimos 30 minutos.
6. El movimiento usa `drive.moverArchivo`: no vuelve a subir el archivo, conserva `drive_file_id`, cambia parent/nombre en Drive y actualiza ruta, carpeta y metadatos en `scan_documents`.

## Por qué se cambió
El estado anterior dependía de un `Map` en memoria después de tocar `Es otra cosa`. Si Railway reiniciaba/redeployaba entre el botón y la respuesta, el texto caía al mensaje de bienvenida. Ahora el Map sigue ayudando en el camino normal, pero ya no es un punto único de falla.

## Estado de validación
- Diff contra la base: 2 archivos funcionales modificados (`routes/webhook.js`, `services/i18n.js`) más este handoff.
- No se detectó workflow automático asociado al commit desde el conector de GitHub; por tanto queda pendiente correr `npm test` / `node --check routes/webhook.js` en un host de desarrollo o CI antes de desplegar a producción.
- Prueba funcional recomendada en producción/staging:
  1. Enviar foto de comprobante de colegiatura.
  2. Confirmar mensaje con nombre/ruta y botón `Cambiar carpeta`.
  3. Pulsar el botón y responder `Educación, Patricio Soria, colegiaturas`.
  4. Verificar que el mismo `drive_file_id` cambió de carpeta y que WhatsApp confirma la nueva ruta.
  5. Repetir sin tocar botón: enviar otro documento y responder directamente `Es un comprobante de pago de colegiatura de Patricio Soria`.
  6. Simular reinicio entre confirmación y respuesta y verificar que el paso 5 sigue funcionando dentro de 30 minutos.

## Arquitectura base acordada
`iPhone ChatGPT → Remoto/Codex → host cloud → GitHub → Railway/Supabase`.

La fuente de verdad para retomar es GitHub; documentar siempre rama, SHA/PR, validación y siguiente paso.