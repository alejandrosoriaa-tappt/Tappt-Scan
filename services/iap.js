const axios = require('axios');
const { google } = require('googleapis');

/**
 * Segundo canal de cobro (decisión 2026-08-13, ver docs/DIRECCION-DISENO.md):
 * dentro de la app nativa el pago tiene que ser IAP de la tienda — Apple
 * prohíbe una pasarela externa ahí (guía 3.1.1) y Google Play tiene la
 * misma regla para bienes digitales. Stripe (`services/stripe.js`) se queda
 * acotado a WhatsApp y la Web App, que sí pueden cobrar afuera.
 *
 * Los IDs de producto deben coincidir EXACTO con lo que se dé de alta en
 * App Store Connect / Play Console — si cambian ahí, cambian aquí.
 */
const PRODUCTOS = {
  'lat.tappt.scan.personal.anual': 'personal',
  'lat.tappt.scan.negocio.anual': 'negocio',
};

function planDeProducto(productId) {
  const plan = PRODUCTOS[productId];
  if (!plan) throw new Error(`producto_desconocido: ${productId}`);
  return plan;
}

const APPLE_VERIFY_PROD = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_VERIFY_SANDBOX = 'https://sandbox.itunes.apple.com/verifyReceipt';

/**
 * Verifica un recibo de App Store contra los servidores de Apple.
 *
 * Devuelve la compra vigente más reciente entre las que reconocemos. Un
 * recibo trae el historial completo de transacciones del dispositivo, no
 * solo la última — por eso se ordena por fecha de compra.
 */
async function verificarApple(receiptData) {
  const secreto = process.env.APPLE_SHARED_SECRET;
  if (!secreto) throw new Error('falta_apple_shared_secret');

  const pedir = async (url) =>
    axios.post(url, {
      'receipt-data': receiptData,
      password: secreto,
      'exclude-old-transactions': true,
    });

  let { data } = await pedir(APPLE_VERIFY_PROD);

  // 21007: es un recibo de sandbox (TestFlight/desarrollo) mandado al
  // endpoint de producción — Apple pide reintentar contra sandbox.
  if (data.status === 21007) {
    ({ data } = await pedir(APPLE_VERIFY_SANDBOX));
  }

  if (data.status !== 0) {
    throw new Error(`recibo_apple_invalido: status ${data.status}`);
  }

  const transacciones = data.latest_receipt_info || [];
  if (!transacciones.length) throw new Error('recibo_apple_sin_transacciones');

  const reconocidas = transacciones.filter((t) => PRODUCTOS[t.product_id]);
  if (!reconocidas.length) throw new Error('recibo_apple_producto_desconocido');

  const masReciente = reconocidas.sort(
    (a, b) => Number(b.purchase_date_ms) - Number(a.purchase_date_ms)
  )[0];

  return {
    plan: planDeProducto(masReciente.product_id),
    productId: masReciente.product_id,
    originalTransactionId: masReciente.original_transaction_id,
    expiraEn: new Date(Number(masReciente.expires_date_ms)).toISOString(),
  };
}

let androidPublisherCache = null;
function androidPublisher() {
  if (androidPublisherCache) return androidPublisherCache;

  const credencialesJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!credencialesJson) throw new Error('falta_google_play_service_account');

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(credencialesJson),
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });

  androidPublisherCache = google.androidpublisher({ version: 'v3', auth });
  return androidPublisherCache;
}

/**
 * Verifica una compra de Google Play contra la Android Publisher API.
 *
 * A diferencia de Apple, aquí el cliente ya sabe qué producto compró
 * (`productId` viene del propio flujo de compra en la app) — solo hace
 * falta confirmar con Google que el token es válido y sigue vigente.
 */
async function verificarGoogle(productId, purchaseToken) {
  const packageName = process.env.ANDROID_PACKAGE_NAME || 'lat.tappt.scan';
  const plan = planDeProducto(productId); // valida el producto antes de gastar la llamada

  const { data } = await androidPublisher().purchases.subscriptions.get({
    packageName,
    subscriptionId: productId,
    token: purchaseToken,
  });

  // paymentState: 0 = pago pendiente, 1 = pagado, 2 = prueba gratis.
  if (data.paymentState !== 1 && data.paymentState !== 2) {
    throw new Error(`compra_google_no_pagada: paymentState ${data.paymentState}`);
  }

  return {
    plan,
    productId,
    purchaseToken,
    expiraEn: new Date(Number(data.expiryTimeMillis)).toISOString(),
  };
}

module.exports = { verificarApple, verificarGoogle, planDeProducto, PRODUCTOS };
