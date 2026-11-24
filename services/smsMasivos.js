/**
 * Cliente de SMS Masivos — único uso: mandar el código de acceso por SMS
 * en iOS (ver `services/otpSms.js`). La API key vive solo en el backend;
 * nunca debe llegar al cliente, a logs, ni a archivos versionados.
 */

const ENDPOINT = 'https://api.smsmasivos.com.mx/v2/otp';

function apiKey() {
  const valor = process.env.SMS_MASIVOS_API_KEY;
  if (!valor) throw new Error('falta_sms_masivos_api_key');
  return valor;
}

/**
 * Envía el código ya generado por el backend (`code_custom`): SMS Masivos
 * nunca decide el código, solo lo entrega. `code_rotate` evita que
 * reenvíe un código viejo si el reto sigue vigente.
 */
async function enviarCodigo(telefono10, codigo) {
  const respuesta = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      apikey: apiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      country_code: '52',
      phone_number: telefono10,
      channel: 'sms',
      company: 'Tappt',
      message: 'Tu codigo de {{company}} es {{code}}. No lo compartas.',
      code_custom: codigo,
      code_rotate: true,
    }),
  });

  const resultado = await respuesta.json().catch(() => null);
  if (!respuesta.ok || resultado?.success !== true) {
    // No se registra el cuerpo de la respuesta: podría traer el código.
    const detalle = typeof resultado?.error === 'string' && /^[a-z0-9_]+$/.test(resultado.error)
      ? resultado.error : 'respuesta_invalida';
    throw new Error(`sms_masivos_rechazo_${respuesta.status}_${detalle}`);
  }

  return true;
}

module.exports = { enviarCodigo };
