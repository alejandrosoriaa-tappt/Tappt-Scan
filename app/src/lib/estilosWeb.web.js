/**
 * Lo que hace que la web app se sienta app y no página.
 *
 * Se inyecta desde JS en lugar de editar un HTML: así vale igual en
 * desarrollo (`expo start --web`) y en el sitio exportado, sin depender de
 * plantillas del bundler.
 *
 * Cada bloque arregla algo concreto que delata a una web:
 *  - el scroll horizontal y el rebote elástico al llegar al borde,
 *  - el zoom por doble toque y el destello gris al tocar un botón,
 *  - la selección de texto accidental al arrastrar,
 *  - el `100vh` de los navegadores móviles, que cuenta la barra de
 *    direcciones y deja la app cortada.
 */

const CSS = `
  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    width: 100%;
    /* Nada de scroll a nivel documento: el que scrollea es el contenido. */
    overflow: hidden;
    overscroll-behavior: none;
    background: #0F172A;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      "Helvetica Neue", Arial, sans-serif;
  }

  /* El contenedor que monta React Native Web. */
  #root {
    height: 100%;
    width: 100%;
    display: flex;
    overflow: hidden;
  }

  * {
    /* El destello gris al tocar es la marca más delatora de una web. */
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
  }

  /* Arrastrar no debe seleccionar texto, salvo donde se escribe. */
  body, #root {
    user-select: none;
    -webkit-user-select: none;
  }
  input, textarea, [contenteditable="true"] {
    user-select: text;
    -webkit-user-select: text;
  }

  /* Scroll vertical con inercia, y sin barras visibles. */
  * {
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  *::-webkit-scrollbar {
    display: none;
  }

  /* Nada puede empujar el ancho y provocar scroll lateral. */
  img, video, canvas, svg {
    max-width: 100%;
  }
`;

function inyectarEstilos() {
  if (document.getElementById('tappt-scan-estilos')) return;

  const estilo = document.createElement('style');
  estilo.id = 'tappt-scan-estilos';
  estilo.textContent = CSS;
  document.head.appendChild(estilo);
}

// `viewport-fit=cover` y `user-scalable=no`: sin esto, iOS deja zoom por
// doble toque y no respeta el notch.
function ajustarViewport() {
  let meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    document.head.appendChild(meta);
  }
  meta.content =
    'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
}

// En iOS, "agregar a pantalla de inicio" abre sin barra del navegador solo
// si se declara así.
function marcarComoApp() {
  const metas = {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
    'mobile-web-app-capable': 'yes',
    'theme-color': '#0F766E',
  };

  for (const [nombre, contenido] of Object.entries(metas)) {
    let meta = document.querySelector(`meta[name="${nombre}"]`);
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = nombre;
      document.head.appendChild(meta);
    }
    meta.content = contenido;
  }
}

// Los navegadores móviles mienten con 100vh: incluyen la barra de
// direcciones, así que la app queda cortada por abajo. Se mide el alto real
// y se publica como variable CSS.
function medirAltoReal() {
  const medir = () => {
    const alto = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--alto-real', `${alto}px`);
  };

  medir();
  window.addEventListener('resize', medir);
  window.visualViewport?.addEventListener('resize', medir);
}

// Safari en iOS hace zoom con doble toque aunque el viewport lo prohíba.
function bloquearDobleToque() {
  let ultimo = 0;
  document.addEventListener(
    'touchend',
    (evento) => {
      const ahora = Date.now();
      if (ahora - ultimo <= 300) evento.preventDefault();
      ultimo = ahora;
    },
    { passive: false }
  );
}

export function aplicarEstilosWeb() {
  if (typeof document === 'undefined') return;

  inyectarEstilos();
  ajustarViewport();
  marcarComoApp();
  medirAltoReal();
  bloquearDobleToque();
}
