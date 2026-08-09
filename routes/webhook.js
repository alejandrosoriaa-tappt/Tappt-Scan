const express = require('express');
const router = express.Router();

const whatsapp = require('../services/whatsapp');
const procesarDocumento = require('../services/procesarDocumento');
const linking = require('../services/linking');
const planes = require('../services/planes');
const stripe = require('../services/stripe');
const supabase = require('../services/supabase');
const { t, detectarIdioma } = require('../services/i18n');

// Verificación del webhook (Meta llama a esto al configurar la app).
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Eventos entrantes: imagen, documento, texto, botones.
router.post('/', async (req, res) => {
  res.sendStatus(200); // ack inmediato, Meta reintenta si tardamos

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const msg = value?.messages?.[0];
    if (!msg) return;

    const from = msg.from;

    if (msg.type === 'image') {
      await handleImage(from, msg.image);
    } else if (msg.type === 'document') {
      await handleDocument(from, msg.document);
    } else if (msg.type === 'text') {
      await handleText(from, msg.text.body);
    } else if (msg.type === 'interactive') {
      await handleButton(from, msg.interactive);
    }
  } catch (err) {
    console.error('[webhook] error procesando mensaje', err);
  }
});

async function traerUsuario(from) {
  const { data } = await supabase
    .from('scan_users')
    .select('*')
    .eq('whatsapp_phone', from)
    .maybeSingle();
  return data;
}

// El idioma del usuario manda; si aún no tiene, se intenta adivinar del
// mensaje y se guarda para no volver a adivinar.
async function idiomaDe(usuario, texto = null) {
  if (usuario?.idioma) return usuario.idioma;

  const detectado = detectarIdioma(texto);
  if (detectado && usuario) {
    await supabase.from('scan_users').update({ idioma: detectado }).eq('id', usuario.id);
  }
  return detectado || 'es';
}

// Fotos y PDFs reenviados comparten todo: mismas validaciones, misma
// tubería. Solo cambia el tipo de medio que llega.
async function recibirArchivo(from, medio, mimePorDefecto) {
  const user = await traerUsuario(from);
  const idioma = await idiomaDe(user);

  if (!user || !user.drive_tokens) {
    await whatsapp.sendText(from, t(idioma, 'sinDrive'));
    return;
  }

  const cupo = await planes.puedeEscanear(user);
  if (!cupo.permitido) {
    await whatsapp.sendText(from, t(idioma, 'limite', { limite: cupo.limite }));
    return;
  }

  const mediaUrl = await whatsapp.getMediaUrl(medio.id);
  const buffer = await whatsapp.downloadMedia(mediaUrl);

  const { nombreArchivo, nombreCarpeta, paginas } = await procesarDocumento.procesarArchivo(
    user,
    buffer,
    medio.mime_type || mimePorDefecto,
    medio.filename || null
  );

  await whatsapp.sendButtons(
    from,
    t(idioma, 'guardado', {
      archivo: nombreArchivo,
      carpeta: nombreCarpeta,
      paginas: paginas > 1 ? t(idioma, 'paginas', { n: paginas }) : '',
    }),
    [
      { id: 'ok', title: t(idioma, 'botonGuardar') },
      { id: 'app', title: t(idioma, 'botonApp') },
      { id: 'otra_cosa', title: t(idioma, 'botonOtra') },
    ]
  );
}

const handleImage = (from, image) => recibirArchivo(from, image, 'image/jpeg');

// PDF reenviado desde otro chat. WhatsApp manda cualquier adjunto como
// `document`; solo aceptamos PDF e imágenes.
async function handleDocument(from, documento) {
  const mime = documento.mime_type || '';
  if (!mime.includes('pdf') && !mime.startsWith('image/')) {
    const idioma = await idiomaDe(await traerUsuario(from));
    await whatsapp.sendText(from, t(idioma, 'formatoNoSoportado'));
    return;
  }

  await recibirArchivo(from, documento, 'application/pdf');
}

// Intención de compra, en español o inglés.
const QUIERE_PLAN = /(quiero|dame|activar|i want|upgrade to|get)\s+(el\s+)?(plan\s+)?(personal|negocio|business)/i;

async function handleText(from, text) {
  const limpio = text.trim();
  const user = await traerUsuario(from);
  const idioma = await idiomaDe(user, limpio);

  if (QUIERE_PLAN.test(limpio)) {
    const plan = /negocio|business/i.test(limpio) ? 'negocio' : 'personal';

    if (!user) {
      await whatsapp.sendText(from, t(idioma, 'primeroApp'));
      return;
    }

    const link = await stripe.crearLinkDePago(user, plan);
    await whatsapp.sendText(from, t(idioma, 'linkPago', { plan, link }));
    return;
  }

  if (/^\d{6}$/.test(limpio)) {
    const userId = await linking.redeemLinkCode(limpio, from);
    await whatsapp.sendText(from, t(idioma, userId ? 'codigoOk' : 'codigoMal'));
    return;
  }

  await whatsapp.sendText(from, t(idioma, 'bienvenida'));
}

async function handleButton(from, interactive) {
  const id = interactive?.button_reply?.id;
  const idioma = await idiomaDe(await traerUsuario(from));

  if (id === 'app') {
    await whatsapp.sendText(from, t(idioma, 'verApp'));
  } else if (id === 'otra_cosa') {
    await whatsapp.sendText(from, t(idioma, 'otraCosa'));
  }
}

module.exports = router;
