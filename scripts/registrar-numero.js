#!/usr/bin/env node
'use strict';

/**
 * Registra el número en WhatsApp Cloud API.
 *
 *   node scripts/registrar-numero.js <pin-de-6-dígitos>
 *
 * POR QUÉ EXISTE
 * --------------
 * Un número recién dado de alta en Meta todavía NO puede mandar ni recibir
 * por la API: falta registrarlo, y ese paso solo existe por Graph. Hasta
 * entonces el webhook nunca dispara y parece que el backend está roto
 * cuando en realidad nadie le está hablando.
 *
 * Corre donde ya viven las credenciales (Railway → Console, o local con el
 * .env cargado). Usa las mismas variables que el server, así que registra
 * exactamente el número que el backend va a usar — no uno que se tecleó
 * aparte.
 *
 * EL PIN es la verificación en dos pasos del número. Si nunca se puso, este
 * comando lo establece; si ya existía, hay que mandar el mismo o Meta
 * responde 133005. No se guarda en el repo: va al gestor de contraseñas.
 */

require('dotenv').config();

const GRAPH = 'https://graph.facebook.com/v19.0';

async function main() {
  const pin = process.argv[2];
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, EXPECTED_WHATSAPP_PHONE_NUMBER_ID } = process.env;

  if (!/^\d{6}$/.test(pin || '')) {
    console.error('Uso: node scripts/registrar-numero.js <pin-de-6-dígitos>');
    process.exit(1);
  }
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.error('Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID en el entorno.');
    process.exit(1);
  }
  // Mismo guardrail que el server: registrar el número equivocado es
  // justo el error que la variable EXPECTED existe para evitar.
  if (EXPECTED_WHATSAPP_PHONE_NUMBER_ID && WHATSAPP_PHONE_NUMBER_ID !== EXPECTED_WHATSAPP_PHONE_NUMBER_ID) {
    console.error('[guardrail] el id no coincide con EXPECTED_WHATSAPP_PHONE_NUMBER_ID. No se registra nada.');
    process.exit(1);
  }

  console.log(`Registrando ${WHATSAPP_PHONE_NUMBER_ID}…`);
  const respuesta = await fetch(`${GRAPH}/${WHATSAPP_PHONE_NUMBER_ID}/register`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
  });

  const cuerpo = await respuesta.json().catch(() => ({}));

  if (respuesta.ok && cuerpo.success) {
    console.log('✅ Registrado. El número ya puede recibir y mandar por la API.');
    return;
  }

  const codigo = cuerpo?.error?.code;
  console.error(`❌ Meta respondió ${respuesta.status}:`, JSON.stringify(cuerpo, null, 2));
  if (codigo === 133005) console.error('\n→ El PIN no coincide con el que ya tenía el número. Se reinicia desde WhatsApp Manager → Verificación en dos pasos.');
  if (codigo === 133006) console.error('\n→ Falta verificar el número en Meta antes de registrarlo.');
  if (codigo === 133009) console.error('\n→ Demasiados intentos seguidos; Meta pide esperar antes de reintentar.');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
