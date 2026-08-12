// No hay tienda que cobre en un navegador — este canal (IAP) solo existe en
// la app nativa. En web el cobro sigue siendo Stripe vía WhatsApp/Web App
// (ver AjustesScreen). Este stub existe para que nada intente cargar
// `react-native-iap` (módulo nativo) en el bundle web — Metro resuelve
// `compras.web.js` aquí en vez de `compras.native.js`.
export const PRODUCTOS_IAP = {};
export const iapDisponible = false;

async function comprarPlan() {
  throw new Error('iap_no_disponible_en_web');
}

export const comprasIAP = { iniciar: async () => {}, detener: () => {}, comprarPlan };
