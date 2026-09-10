# Comparativa TapptScan vs. CamScanner — 9 de septiembre de 2026

_Última actualización: 2026-09-09_

Primera comparativa con **el mismo documento físico** escaneado por las dos
apps: una escritura notarial de 17 páginas, texto impreso sobre papel blanco
con sellos y anotaciones a mano, engargolada.

| | TapptScan | Referencia |
|---|---|---|
| Dispositivo | Motorola (Android, ML Kit) | iPhone |
| Build | `0.1.6 (14)` | — |
| Productor del PDF | `pdf-lib` | `Quartz PDFContext` (iOS 26.6) |
| Páginas entregadas | **21** | 17 |
| Peso total | **10.0 MB** | 4.7 MB |

Métricas por página en `scanner/fixtures/comparativas/2026-09-09-notaria.json`.
Los PDF no se versionan (contienen datos personales de terceros).

## Lo que se midió

| Métrica (mediana) | TapptScan | Referencia | Lectura |
|---|---|---|---|
| Resolución | **3.97 MP** | 1.49 MP | Guardamos 2.7× más píxeles |
| **Nitidez normalizada** | **3293** | **3317** | **Empate (0.7% de diferencia)** |
| Contraste | 50.2 | 59.7 | La referencia separa mejor tinta de papel |
| Brillo | 238.3 | 233.1 | Los dos blanquean el fondo |
| Compresión | 120 KB/MP | 193 KB/MP | Comprimimos más fuerte |
| Peso por página | 570 KB | 305 KB | Casi el doble |
| Dispersión de proporción | 0.517 | 0.464 | Encuadres menos consistentes |

Nitidez = varianza del laplaciano **tras llevar ambas a 1000 px de ancho**. Sin
esa normalización el resultado no significa nada: más píxeles inflan la
varianza aunque no haya más detalle. Es el error de método documentado en
`CLAUDE.md` ("🔴 ABIERTO 2026-08-20") y aquí se evitó a propósito.

## Los tres hallazgos

### 1. No estamos borrosos — el detalle percibido es idéntico

Con 2.7× más píxeles, TapptScan entrega **la misma nitidez** al ver las dos
páginas al mismo tamaño (3293 vs. 3317). La hipótesis de "nuestra captura sale
suave" **no aplica a este camino**: la regresión de nitidez abierta desde el
20 de agosto vive en la cámara **web** (`CamaraDoc.web.js`, selección de
ultra-wide vía `getUserMedia`). El APK de Android no pasa por ahí — usa el
escáner nativo de ML Kit, con su propia cámara. Son dos caminos distintos y
conviene dejar de tratarlos como uno.

### 2. La brecha real es encuadre y enderezado

Es lo único que se ve de inmediato al poner las dos páginas lado a lado:

- **Página 1 nuestra:** el recorte deja fondo alrededor y la hoja queda
  **inclinada**, con el borde izquierdo curvado. La referencia entrega la hoja
  rectificada, de borde a borde, sin fondo.
- **Página 2 nuestra:** entró **el reverso de la hoja** (la tinta del frente
  transparentándose, espejeada) y encima se coló la página vecina y el
  engargolado. La referencia, en esa misma posición, trae el frente correcto y
  limpio.

Eso explica también la dispersión de proporción (0.517 vs. 0.464) y las cuatro
páginas de más: **21 entregadas contra 17 reales**. Ese sobrante es peso y
revisión manual para el usuario, no contenido.

Ojo con la atribución: parte de esto es del operador (fotografiar el reverso
es del usuario), pero parte es nuestra —el recorte flojo y la falta de
enderezado sí los devolvió ML Kit y nosotros los aceptamos tal cual.
`escanerNativo.js` manda `esquinas: MARCO_COMPLETO` y no vuelve a mirar la
página, por decisión explícita (evitar recortar dos veces). Esta comparativa
dice que esa decisión deja pasar páginas torcidas sin ninguna red.

### 3. Pesamos el doble sin ganar nada

10.0 MB contra 4.7 MB por el mismo documento, con la misma nitidez percibida.
Bajar la resolución de la página a ~1.5–2 MP no costaría detalle visible y
resolvería de paso el riesgo P1 de la auditoría de Android: 50 páginas en
Base64 dentro de un solo `JSON.stringify` (`app/src/lib/api.js`). Menos bytes
por página es menos memoria, menos payload y menos timeout.

## Qué hacer con esto

1. **Control de calidad por página antes de guardar.** Detectar página torcida,
   casi vacía o con fondo de sobra, y ofrecer ajustar o descartar. Es lo que
   habría evitado las cuatro páginas de más y las dos torcidas.
2. **Normalizar la salida:** bajar a ~1.5–2 MP y subir un poco el contraste
   (estamos 10 puntos abajo de la referencia).
3. **Arreglar el tamaño de página del PDF.** `pdf-lib` está escribiendo cada
   página a 72 dpi con el tamaño en píxeles, así que una hoja carta sale
   declarada como ~19×35 pulgadas. Se abre bien en pantalla y se imprime mal.
   Debería ser un tamaño real (carta/oficio) a 200–300 dpi.
4. **Dejar de mezclar los dos caminos de captura** al diagnosticar: web
   (`getUserMedia`, regresión de nitidez abierta) y nativo (ML Kit, este
   documento).
