# Tablero operativo de Tappt

## Qué muestra

- Usuarios totales y nuevos.
- Instalaciones, desinstalaciones, dispositivos activos, crashes y ANR de Google Play.
- Suscripciones activas, altas pagadas, renovaciones, cancelaciones y cobros fallidos.
- Documentos y páginas procesadas.
- Tasa de éxito, errores y latencia promedio/p95.
- Origen: WhatsApp, cámara, lote o importación.
- Llamadas y costo estimado de clasificación con IA.
- Actividad diaria y los 25 errores recientes sin datos del documento.

No almacena imágenes, OCR, nombres de archivo, teléfonos ni correos. El id
interno del usuario se convierte en un hash no reversible con `OPS_HASH_SALT`.

## Activación

1. Ejecutar `migrations/20260916_ops_dashboard.sql` en Supabase SQL Editor.
2. Agregar en Railway:

   - `OPS_DASHBOARD_USER`
   - `OPS_DASHBOARD_PASSWORD`
   - `OPS_HASH_SALT`
   - `OPS_AI_COST_PER_DOCUMENT_USD=0.004`

3. Desplegar el backend.
4. Abrir `https://scan.tappt.lat/operaciones` e ingresar las credenciales.

## Fuentes oficiales pendientes de conectar

El tablero ya está preparado para recibir los datos de Google Play en
`scan_play_daily_metrics`. Para poblarla se necesita dar acceso de solo lectura
a una cuenta de servicio en Play Console y configurar el bucket privado de
reportes. Las instalaciones y desinstalaciones no se calculan desde Supabase:
deben venir del reporte oficial de Google. Los crashes y ANR deben sincronizarse
desde Play Developer Reporting API.

Las compras verificadas por la app y los eventos de Stripe ya generan eventos
comerciales. Para que una cancelación hecha directamente en Google Play se
refleje de inmediato falta activar Real-time Developer Notifications (RTDN) con
Pub/Sub; hasta entonces `Suscripciones activas` se calcula por la vigencia
guardada en `scan_users`.

El tablero actualiza cada minuto y permite consultar 7, 30 o 90 días. Los
eventos empiezan a acumularse desde el despliegue; no reconstruye latencias o
errores históricos que nunca se registraron.
