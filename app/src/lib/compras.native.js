import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  getSubscriptions,
  requestSubscription,
  purchaseUpdatedListener,
  purchaseErrorListener,
  finishTransaction,
} from 'react-native-iap';
import { api } from './api';

// Mismos IDs que `services/iap.js` (PRODUCTOS) en el backend — deben
// coincidir EXACTO con los productos dados de alta en App Store Connect
// y Play Console, o la compra no aparece ahí para comprarse.
export const PRODUCTOS_IAP = {
  personal: 'lat.tappt.scan.personal.anual',
  negocio: 'lat.tappt.scan.negocio.anual',
};

// Segundo canal de cobro (docs/DIRECCION-DISENO.md, decisión 2026-08-13):
// dentro de la app nativa el pago es IAP de la tienda, nunca Stripe — Apple
// y Google no dejan usar una pasarela externa para bienes digitales adentro
// de la app. No existe en web: no hay tienda que cobre ahí, ese canal sigue
// siendo Stripe vía WhatsApp/Web App (ver AjustesScreen).
export const iapDisponible = Platform.OS !== 'web';

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

export const comprasIAP = { iniciar, detener, comprarPlan };
