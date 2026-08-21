/**
 * Textos del bot de WhatsApp.
 *
 * El idioma del usuario vive en `scan_users.idioma`. Si no está definido se
 * detecta del primer mensaje (ver `detectarIdioma`) y se guarda.
 *
 * Para agregar un idioma: añadir su clave a MENSAJES. Lo que falte cae al
 * español, así que un idioma incompleto degrada en vez de romper.
 */
const IDIOMA_POR_DEFECTO = 'es';

const MENSAJES = {
  es: {
    bienvenida:
      'Hola, soy TapptScan. Mándame la foto de un documento —o reenvíame un PDF— y lo guardo directo en tu Google Drive.',
    sinDrive:
      'Todavía no tienes tu Google Drive conectado. Baja la app de TapptScan para conectarlo y guardar tus documentos automáticamente.',
    driveExpirado:
      'Tu conexión con Google Drive venció o fue revocada. Vuelve a conectarla aquí y después mándame la foto otra vez:\n{appUrl}',
    limite:
      'Ya usaste tus {limite} escaneos gratis de este mes. Pásate al plan Personal y escanea sin límite — escríbeme "quiero personal" y te mando el link.',
    guardado: 'Listo 📄\n\n*{archivo}*{paginas}\n📁 {ruta}{drive}{editar}\n\n¿Todo bien?',
    // El link a Drive va en el CUERPO, no como cuarto botón: Meta topa los
    // botones de respuesta en 3 —ya ocupados— y no deja mezclarlos con un
    // botón de URL en el mismo mensaje. Como línea queda igual de tocable.
    guardadoDrive: '\n\n📂 Abrir en Drive:\n{driveLink}',
    guardadoEditar: '\n\n✏️ ¿Quieres editarlo o firmarlo? Entra a la app:\n{appUrl}',
    paginas: ' ({n} páginas)',
    formatoNoSoportado:
      'Por ahora solo puedo con PDF e imágenes. Reenvíame el documento en alguno de esos formatos.',
    accesoOk: '¡Listo! Ya puedes volver a la app, tu sesión está abierta. 👋',
    codigoMal: 'Ese código no es válido o ya venció. Genera uno nuevo desde la app.',
    primeroApp: 'Primero conecta tu cuenta desde la app de TapptScan.',
    linkPago: 'Aquí está tu link para activar el plan {plan}:\n{link}',
    planActivo:
      'Tu plan {plan} quedó activo. Ya tienes escaneos ilimitados y edición de PDF. Se renueva solo cada año; puedes cancelar cuando quieras escribiéndome "cancelar".',
    planRenovado:
      'Renové tu plan {plan} por un año más. Todo sigue igual, no tienes que hacer nada.',
    cobroFallido:
      'No pude cobrar tu renovación — parece que la tarjeta falló. Lo intento otra vez en unos días. Si quieres cambiarla, escríbeme "mi suscripción".',
    planTerminado:
      'Tu plan terminó y volviste al gratis: 5 escaneos al mes. Tus documentos siguen intactos en tu Drive. Cuando quieras volver, escríbeme "quiero personal".',
    portalPago: 'Aquí puedes cambiar tu tarjeta o cancelar cuando quieras:\n{link}',
    sinSuscripcion: 'Todavía no tienes un plan de pago activo.',
    verApp:
      '📂 Tu documento: {driveLink}\n\nPara editarlo o firmarlo, entra a la app:\n{appUrl}',
    gastosEsNegocio:
      'Esa pregunta la contesto con el plan Negocio: llevo tus gastos en una hoja dentro de tu Drive y te respondo aquí mismo. Escríbeme "quiero negocio" y te mando el link.',
    otraCosa: 'Ok, dime qué tipo de documento es o mándame otra foto.',
    botonGuardar: 'Guardar',
    botonApp: 'Editar en la app',
    botonOtra: 'Es otra cosa',
  },

  en: {
    bienvenida:
      "Hi, I'm TapptScan. Send me a photo of a document — or forward me a PDF — and I'll save it straight to your Google Drive.",
    sinDrive:
      "You haven't connected your Google Drive yet. Download the TapptScan app to connect it and save your documents automatically.",
    driveExpirado:
      'Your Google Drive connection expired or was revoked. Reconnect it here, then send me the photo again:\n{appUrl}',
    limite:
      'You\'ve used your {limite} free scans this month. Upgrade to Personal for unlimited scans — reply "I want personal" and I\'ll send you the link.',
    guardado: 'Done 📄\n\n*{archivo}*{paginas}\n📁 {ruta}{drive}{editar}\n\nAll good?',
    guardadoDrive: '\n\n📂 Open in Drive:\n{driveLink}',
    guardadoEditar: '\n\n✏️ Want to edit or sign it? Open the app:\n{appUrl}',
    paginas: ' ({n} pages)',
    formatoNoSoportado:
      "For now I can only handle PDFs and images. Please forward the document in one of those formats.",
    accesoOk: "You're in! Head back to the app, your session is open. 👋",
    codigoMal: "That code isn't valid or has expired. Generate a new one from the app.",
    primeroApp: 'First connect your account from the TapptScan app.',
    linkPago: "Here's your link to activate the {plan} plan:\n{link}",
    planActivo:
      'Your {plan} plan is active. Unlimited scans and PDF editing from now on. It renews yearly on its own — cancel any time by messaging me "cancel".',
    planRenovado:
      'I renewed your {plan} plan for another year. Nothing for you to do.',
    cobroFallido:
      "I couldn't charge your renewal — looks like the card failed. I'll retry in a few days. To update it, message me \"my subscription\".",
    planTerminado:
      'Your plan ended and you\'re back on free: 5 scans a month. Your documents are untouched in your Drive. Message me "I want personal" to come back.',
    portalPago: 'Here you can change your card or cancel any time:\n{link}',
    sinSuscripcion: "You don't have a paid plan yet.",
    verApp: '📂 Your document: {driveLink}\n\nTo edit or sign it, open the app:\n{appUrl}',
    gastosEsNegocio:
      'That one comes with the Business plan: I keep your expenses in a sheet inside your Drive and answer right here. Reply "I want business" and I\'ll send you the link.',
    otraCosa: "Okay — tell me what kind of document it is, or send me another photo.",
    botonGuardar: 'Save',
    botonApp: 'Edit in app',
    botonOtra: "It's something else",
  },
};

function t(idioma, clave, valores = {}) {
  const catalogo = MENSAJES[idioma] || MENSAJES[IDIOMA_POR_DEFECTO];
  const plantilla = catalogo[clave] ?? MENSAJES[IDIOMA_POR_DEFECTO][clave] ?? clave;

  return plantilla.replace(/\{(\w+)\}/g, (_coincidencia, nombre) =>
    valores[nombre] !== undefined ? String(valores[nombre]) : ''
  );
}

// Detección barata por palabras funcionales — suficiente para elegir el
// idioma del primer saludo. En cuanto el usuario abre la app, su
// preferencia explícita manda sobre esto.
const PISTAS = {
  es: /\b(hola|buenos|buenas|gracias|quiero|necesito|puedes|documento|factura|recibo|por favor)\b/i,
  en: /\b(hi|hello|hey|thanks|thank|please|want|need|can you|document|invoice|receipt)\b/i,
};

function detectarIdioma(texto) {
  if (!texto) return null;
  if (PISTAS.en.test(texto) && !PISTAS.es.test(texto)) return 'en';
  if (PISTAS.es.test(texto)) return 'es';
  return null;
}

const IDIOMAS = Object.keys(MENSAJES);

module.exports = { t, detectarIdioma, IDIOMAS, IDIOMA_POR_DEFECTO };
