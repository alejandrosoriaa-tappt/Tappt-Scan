import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  getSubscriptions,
  requestSubscription,
  purchaseUpdatedListener,
  purchaseErrorListener,
  finishTransaction,
  getAvailablePurchases,
} from 'react-native-iap';
import { api } from './api';

// Mismos IDs que `services/iap.js` (PRODUCTOS) en el backend — deben
// coincidir EXACTO con los productos dados de alta en App Store Connect
// y Play Console, o la compra no aparece ahí para comprarse.
export const PRODUCTOS_IAP = {
  personal: 'lat.tappt.scan.personal.anual',
  negocio: 'lat.tappt.scan.negocio.anual',
};

// Segundo canal de cobro (docs/DIRECCION-DISENO.md, decisión 2026-08-12):
// dentro de la app nativa el pago es IAP de la tienda, nunca Stripe — Apple
// y Google no dejan usar una pasarela externa para bienes digitales adentro
// de la app. No existe en web: no hay tienda que cobre ahí, ese canal sigue
// siendo Stripe vía WhatsApp/Web App (ver AjustesScreen).
export const iapDisponible = Platform.OS !== 'web';

const PRODUCTOS_IAP_IDS = Object.values(PRODUCTOS_IAP);

let suscripcionActualizada = null;
let suscripcionError = null;

function iniciar() {
  if (!iapDisponible) return Promise.resolve();
  return initConnection();
}

function detener() {
  if (!iapDisponible) return;
  suscripcionActualizada?.remove();
  suscripcionError?.remove();
  endConnection();
}

/**
 * Compra un plan y activa la suscripción en el backend.
 *
 * El flujo real: 1) la tienda cobra y confirma la compra al dispositivo,
 * 2) mandamos el recibo/token al backend, 3) el backend valida contra
 * Apple/Google (nunca confiamos en lo que diga el cliente) y activa el
 * plan, 4) recién ahí se "termina" la transacción ante la tienda — si se
 * termina antes y el paso 3 falla, el usuario pagó sin quedar activado.
 */
export async function comprarPlan(plan) {
  if (!iapDisponible) throw new Error('iap_no_disponible_en_web');

  const productoId = PRODUCTOS_IAP[plan];
  if (!productoId) throw new Error(`plan_sin_producto_iap: ${plan}`);

  await iniciar();
  const [producto] = await getSubscriptions({ skus: [productoId] });
  if (!producto) throw new Error('producto_no_encontrado_en_tienda');

  return new Promise((resolve, reject) => {
    suscripcionActualizada = purchaseUpdatedListener(async (compra) => {
      try {
        const plataforma = Platform.OS === 'ios' ? 'apple' : 'google';
        const body =
          plataforma === 'apple'
            ? { plataforma, recibo: compra.transactionReceipt }
            : { plataforma, productoId, token: compra.purchaseToken };

        const resultado = await api.verificarCompraIAP(body);
        await finishTransaction({ purchase: compra, isConsumable: false });
        resolve(resultado);
      } catch (err) {
        reject(err);
      } finally {
        suscripcionActualizada?.remove();
        suscripcionError?.remove();
      }
    });

    suscripcionError = purchaseErrorListener((err) => {
      suscripcionActualizada?.remove();
      suscripcionError?.remove();
      reject(err);
    });

    requestSubscription({ sku: productoId }).catch(reject);
  });
}

/**
 * Restaurar compras — Apple lo exige (guía 3.1.1) en cualquier app con
 * suscripciones, y además resuelve un problema real: el usuario cambia de
 * teléfono o reinstala, ya pagó, y la app lo dejaría en plan gratis sin
 * salida.
 *
 * `getAvailablePurchases()` le pregunta a la tienda qué compras tiene ESTE
 * Apple ID / cuenta de Google, sin cobrar nada. Cada una se manda al mismo
 * endpoint que valida una compra nueva: el backend es quien decide, igual
 * que en la compra — el cliente nunca dice qué plan tiene.
 *
 * Se manda TODO lo que devuelva la tienda, no solo lo último: en Apple el
 * recibo trae el historial completo y una compra vieja puede venir vencida.
 * Por eso nos quedamos con el primer resultado que el backend marque como
 * `vigente`, y si ninguno lo está, se devuelve `null` para poder decir
 * "no hay nada que restaurar" en vez de un "listo" que no cambió nada.
 */
export async function restaurarCompras() {
  if (!iapDisponible) throw new Error('iap_no_disponible_en_web');

  await iniciar();
  const compras = await getAvailablePurchases();
  if (!compras.length) return null;

  const plataforma = Platform.OS === 'ios' ? 'apple' : 'google';
  let ultimoError = null;

  for (const compra of compras) {
    if (plataforma === 'google' && !PRODUCTOS_IAP_IDS.includes(compra.productId)) continue;

    try {
      const body =
        plataforma === 'apple'
          ? { plataforma, recibo: compra.transactionReceipt }
          : { plataforma, productoId: compra.productId, token: compra.purchaseToken };

      const resultado = await api.verificarCompraIAP(body);
      if (resultado.vigente) return resultado;
    } catch (err) {
      // Una compra de otro producto o ya vencida hace que el backend
      // responda 400. No es motivo para abortar: puede haber otra más
      // adelante en la lista que sí sirva.
      ultimoError = err;
    }
  }

  // Solo se reporta el error si NINGUNA compra sirvió y además hubo fallas;
  // si simplemente estaban todas vencidas, es `null` y no es un error.
  if (ultimoError && compras.length === 1) throw ultimoError;
  return null;
}

export const comprasIAP = { iniciar, detener, comprarPlan, restaurarCompras };
