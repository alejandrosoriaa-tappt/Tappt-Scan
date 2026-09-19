// Número público único de Tappt (compartido con Tappt Agenda).
//
// Es deliberadamente distinto de WHATSAPP_PHONE_NUMBER_ID: ese ID identifica
// el transporte técnico del webhook, mientras que este número es el destino
// que debe abrir la app para acceso, documentos y soporte.
const NUMERO_ACCESO_TAPPT = '524429232611';

function numeroAccesoTappt() {
  return (process.env.WHATSAPP_ACCESS_NUMBER || NUMERO_ACCESO_TAPPT).replace(/\D/g, '');
}

module.exports = { NUMERO_ACCESO_TAPPT, numeroAccesoTappt };
