# Checklist maestro de aceptación — TapptScan

_Actualizado: 2026-09-01_

Este documento convierte las pruebas en un recorrido fijo desde la visión del
usuario. No se avanza a la siguiente etapa si un punto crítico falla.

## Cómo ejecutar cada ciclo

- Dispositivo principal actual: **iPhone ASA conectado físicamente a la Mac**.
- Rama nativa: `claude/build-nativo-ios-docs-jud3zt`.
- API: `https://scan.tappt.lat`.
- Marcar cada prueba como `✅ pasa`, `❌ falla`, `⚠️ parcial` o `⏭️ bloqueada`.
- Ante un fallo, guardar: captura, hora exacta, acción realizada, resultado y
  texto literal del error. La hora permite encontrar el evento en Railway.
- Repetir primero el camino feliz completo. Después ejecutar errores y casos
  límite; no alternarlos aleatoriamente.

## Datos de prueba preparados

- [ ] iPhone desbloqueado, con internet, WhatsApp y Google Drive instalados.
- [ ] Mac con Metro abierto y el iPhone seleccionado como dispositivo.
- [ ] Cuenta nueva de WhatsApp que pueda borrarse de verdad.
- [ ] Cuenta existente con Drive conectado y documentos previos.
- [ ] Fotografía de un recibo de una página.
- [ ] Contrato o identificación de tres páginas.
- [ ] PDF ya existente en Archivos.
- [ ] Foto de una firma sobre papel blanco.
- [ ] Documento con monto/fecha/emisor claros para validar clasificación.

---

## Recorrido A — usuario nuevo: entrada y autorización

### A1. Primera apertura

- [ ] La app abre sin pantalla blanca, crash ni errores técnicos visibles.
- [ ] Login muestra marca, explicación de privacidad y botón de WhatsApp.
- [ ] La barra inferior no aparece antes de iniciar sesión.
- [ ] Los textos caben sin cortarse con el tamaño normal del sistema.

### A2. Login por WhatsApp

- [ ] “Entrar con WhatsApp” abre el chat correcto con mensaje prellenado.
- [ ] Al enviar el mensaje, el bot responde con el enlace de acceso.
- [ ] El enlace vuelve a TapptScan y no deja al usuario atrapado en Safari.
- [ ] La sesión queda iniciada al cerrar y volver a abrir la app.
- [ ] Reutilizar un enlace expirado muestra una explicación útil.
- [ ] Cancelar WhatsApp permite regresar a la app sin romper la navegación.

### A3. Conectar Google Drive

- [ ] La app explica para qué necesita Drive antes de pedir autorización.
- [ ] Google muestra el nombre y dominio correctos de TapptScan.
- [ ] Aceptar autorización regresa a la app.
- [ ] La app confirma visualmente que Drive está conectado.
- [ ] Cancelar o negar autorización muestra una salida clara y reintentable.
- [ ] Desconectar/revocar el permiso en Google provoca “Reconectar Drive”, no
  un error técnico como `invalid_grant`.

**Puerta de avance:** sesión persistente y Drive conectado.

---

## Recorrido B — escaneo principal con VisionKit

### B1. Preparación

- [ ] Tocar `+` y elegir escanear abre primero la guía de uso.
- [ ] La primera instrucción resaltada indica: volver con la flecha superior
  izquierda desde la revisión y después tocar la palomita azul.
- [ ] Se entiende que `Shutter` permite captura manual.
- [ ] Cancelar regresa a la pantalla anterior.

### B2. Captura de una página

- [ ] VisionKit abre; no aparece la cámara web/personalizada.
- [ ] El documento enfoca y el contorno corresponde a la hoja.
- [ ] Se puede cambiar a captura manual para evitar disparos automáticos.
- [ ] La página capturada se puede revisar, recortar, filtrar y rotar con los
  controles de Apple.
- [ ] Flecha superior izquierda regresa a la cámara.
- [ ] Palomita azul superior derecha termina el lote.

### B3. Captura multipágina

- [ ] Capturar tres páginas produce exactamente tres páginas, sin duplicados.
- [ ] El contador de VisionKit coincide con las capturas.
- [ ] Al finalizar se abre el borrador de TapptScan, no queda “Abriendo
  escáner…” ni aparece un error de navegación `REPLACE`.
- [ ] Las miniaturas conservan el orden de captura.

### B4. Borrador previo a guardar

- [ ] Cambiar de página actualiza la vista principal.
- [ ] Mosaico abre todas las páginas.
- [ ] Mover antes/después cambia el orden.
- [ ] Eliminar pide confirmación y no permite dejar cero páginas.
- [ ] Agregar vuelve al escáner y conserva las páginas anteriores.
- [ ] Editar abre recorte/filtros de TapptScan.

### B5. Recorte y filtros propios

- [ ] Arrastrar cada esquina modifica el marco correctamente.
- [ ] “Toda la foto” restaura el marco completo.
- [ ] Original, Gris, B/N y Mejorar cambian visiblemente la imagen grande.
- [ ] “Enderezar y revisar” muestra el resultado real.
- [ ] “Guardar cambios” vuelve al borrador con la miniatura actualizada.

**Puerta de avance:** borrador correcto, completo y ordenado.

---

## Recorrido C — guardar, clasificar y organizar

### C1. Guardar PDF

- [ ] “Guardar PDF” muestra progreso y no acepta dobles toques.
- [ ] No aparece `error_escaneo_lote`.
- [ ] Termina en el detalle del documento, no en una pantalla anterior.
- [ ] El PDF en Drive contiene todas las páginas y en el orden elegido.

### C2. Clasificación por IA

- [ ] Tipo de documento es razonable.
- [ ] Emisor, fecha, monto y moneda coinciden cuando aplican.
- [ ] Sección/subcarpeta corresponden al documento.
- [ ] El nombre generado es legible y no contiene `null` o `undefined`.
- [ ] Si la IA no sabe un dato, la app muestra una ausencia limpia y no un
  código interno.

### C3. Ruta de Google Drive

- [ ] El detalle muestra una ruta legible de Drive.
- [ ] “Abrir en Drive” abre exactamente el archivo recién guardado.
- [ ] El archivo está dentro de la carpeta mostrada.
- [ ] Guardar otro documento no sobrescribe el anterior.

**Puerta de avance:** clasificación visible y archivo comprobado en Drive.

---

## Recorrido D — Documentos, búsqueda y carpetas

- [ ] El documento nuevo aparece en Recientes.
- [ ] Favorito se puede activar/desactivar y filtrar correctamente.
- [ ] “Por revisar” muestra sólo documentos correspondientes.
- [ ] Buscar por emisor, nombre o tipo encuentra el documento.
- [ ] Limpiar búsqueda restaura la lista.
- [ ] Tarjetas no muestran rutas técnicas como `/99/`.
- [ ] “Documentos” no se parte en dos líneas en la barra inferior.
- [ ] Iconos y etiquetas de tabs no saltan al cambiar de pantalla.
- [ ] Carpetas reproduce la jerarquía de Drive y permite regresar de nivel.
- [ ] Abrir un documento desde búsqueda y desde carpeta lleva al mismo detalle.

---

## Recorrido E — editar y firmar

### E1. Abrir editor

- [ ] “Editar y firmar” carga la página sin `error_pagina`.
- [ ] En PDF multipágina funcionan anterior, siguiente y mosaico.

### E2. Texto

- [ ] Texto abre el diálogo, acepta contenido y lo coloca donde se tocó.
- [ ] El texto colocado se puede arrastrar a otra posición.
- [ ] Deshacer elimina la última anotación.

### E3. Firma

- [ ] Firma ofrece biblioteca, “Dibujar nueva” e “Importar de foto”.
- [ ] Dibujar registra el trazo con el dedo y permite limpiar/repetir.
- [ ] Importar detecta el trazo, elimina el fondo y permite elegir color.
- [ ] La firma elegida aparece en la página correcta.
- [ ] Una firma guardada puede reutilizarse y eliminarse de la biblioteca.

### E4. Otras herramientas

- [ ] Emoji permite elegir y colocar una marca.
- [ ] Imagen abre la galería y coloca la imagen seleccionada.
- [ ] Tapar crea un rectángulo negro, lo deja mover y realmente oculta el
  contenido en el PDF final.

### E5. Guardar versión

- [ ] Guardar sin cambios informa que no hay cambios.
- [ ] Guardar con cambios crea `*_firmado.pdf` junto al original.
- [ ] El original permanece intacto.
- [ ] El historial muestra la nueva versión y su enlace abre en Drive.

---

## Recorrido F — importar desde el iPhone

- [ ] Importar una foto desde Fotos/galería funciona.
- [ ] Importar un PDF desde Archivos/iCloud funciona.
- [ ] La app no duplica ni recorta nuevamente un PDF ya formado.
- [ ] Ambos caminos terminan en clasificación y ruta de Drive.
- [ ] Cancelar el selector vuelve sin crear documentos vacíos.
- [ ] Archivo corrupto o demasiado grande muestra un mensaje comprensible.

---

## Recorrido G — WhatsApp completo

### G1. Foto

- [ ] Enviar una foto al contacto TapptScan recibe confirmación.
- [ ] No responde “No pude procesar tu archivo”.
- [ ] La imagen se clasifica y se guarda como PDF en Drive.
- [ ] La respuesta incluye enlace al archivo y enlace para editar en la app.

### G2. PDF y varias páginas

- [ ] Enviar un PDF conserva todas sus páginas.
- [ ] Documento y nombre resultantes son razonables.
- [ ] El documento aparece en la app sin cerrar sesión.

### G3. Errores controlados

- [ ] Archivo no soportado recibe explicación y permite reintentar.
- [ ] Drive revocado pide reconexión.
- [ ] Reenviar el mismo archivo no deja al bot sin respuesta.

---

## Recorrido H — gastos

- [ ] Un recibo con monto se marca como gasto cuando corresponde.
- [ ] Aparece con monto, moneda, fecha, emisor y categoría correctos.
- [ ] Filtros/meses de Gastos funcionan y no desalinean la interfaz.
- [ ] Funciones exclusivas de Negocio muestran upsell en plan gratuito.
- [ ] Un documento sin monto no crea un gasto falso.

---

## Recorrido I — cuenta, plan y recuperación

- [ ] Ajustes muestra usuario, idioma, Drive y plan correctos.
- [ ] Cambiar idioma actualiza toda la navegación principal.
- [ ] Restaurar compras no crashea ni produce error de NitroModules.
- [ ] Mientras no existan productos reales, IAP falla como
  `producto_no_encontrado_en_tienda`; no se considera defecto.
- [ ] Al reinstalar, login recupera documentos porque viven en Drive.
- [ ] Cerrar/reabrir conserva sesión y estado esencial.

### Borrado de cuenta — ejecutar sólo con cuenta desechable

- [ ] La app explica consecuencias antes de borrar.
- [ ] Cancelar no modifica nada.
- [ ] Confirmar elimina realmente la cuenta y cierra sesión.
- [ ] El flujo permite crear una cuenta nueva después.
- [ ] Verificar qué ocurre con archivos del usuario en Drive según la política.

---

## Recorrido J — resistencia y calidad profesional

- [ ] Sin internet: cada acción dependiente de red explica el problema.
- [ ] Volver internet permite reintentar sin reiniciar toda la app.
- [ ] Tocar dos veces botones de guardar no crea duplicados.
- [ ] Suspender la app durante carga no rompe la navegación al volver.
- [ ] Botón atrás siempre regresa a una pantalla lógica.
- [ ] Ningún mensaje muestra claves internas (`error_*`, `PGRST*`, stack).
- [ ] No hay textos cortados, saltos de iconos ni botones fuera del área segura.
- [ ] Contraste, tamaños táctiles, spinners y estados deshabilitados son claros.
- [ ] La app no muestra datos sensibles en logs, alertas o nombres inesperados.

---

## Matriz mínima antes de declarar una versión candidata

| Canal | Caso mínimo obligatorio | Estado |
|---|---|---|
| iPhone físico | A → B → C → D → E completos | ⬜ |
| Importación iPhone | Foto y PDF | ⬜ |
| WhatsApp | Foto y PDF | ⬜ |
| Google Drive | Autorizar, guardar, abrir y revocar | ⬜ |
| Backend | Clasificación, ruta, edición y versión | ⬜ |
| Android | ML Kit + borrador + guardar (cuando haya build) | ⏭️ |
| IAP real | Comprar y restaurar (cuando existan productos) | ⏭️ |

## Registro de ejecución

Copiar esta tabla por cada ciclo:

| Fecha/hora | Build/commit | Recorrido | Resultado | Evidencia / error | Próximo paso |
|---|---|---|---|---|---|
| | | | | | |

