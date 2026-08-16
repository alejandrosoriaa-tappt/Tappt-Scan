const crypto = require('crypto');
const express = require('express');
const router = express.Router();

const whatsapp = require('../services/whatsapp');
const procesarDocumento = require('../services/procesarDocumento');
const sesiones = require('../services/sesiones');
const planes = require('../services/planes');
const stripe = require('../services/stripe');
const consultas = require('../services/consultas');
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

/**
 * Meta firma cada webhook con HMAC-SHA256 del cuerpo crudo usando el secreto
 * de la app. Sin verificarlo, cualquiera que descubra la URL puede simular
 * mensajes de un número ya registrado: gastarle sus escaneos, o provocar que
 * le mandemos links de pago.
 */
// La misma URL para cualquiera: no distingue si quien la abre trae la app
// nativa instalada o no — siempre es la web app (Railway sirve el mismo
// build de React Native Web), así que abre en cualquier navegador, en
// cualquier dispositivo. Si RAILWAY_PUBLIC_DOMAIN no está configurado en
// el servicio de Railway, no hay URL que mandar.
function appUrlPublica() {
  return process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null;
}

function firmaValida(req) {
  const secreto = process.env.WHATSAPP_APP_SECRET;
  if (!secreto) return true; // sin secreto configurado no se puede verificar

  const recibida = req.headers['x-hub-signature-256'];
  if (!recibida) return false;

  const esperada =
    'sha256=' + crypto.createHmac('sha256', secreto).update(req.body).digest('hex');

  const a = Buffer.from(recibida);
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Eventos entrantes: imagen, documento, texto, botones.
router.post('/', async (req, res) => {
  if (!firmaValida(req)) {
    console.error('[webhook] firma inválida');
    return res.sendStatus(403);
  }

  res.sendStatus(200); // ack inmediato, Meta reintenta si tardamos

  let msg, from;
  try {
    // El cuerpo llega crudo (Buffer) porque la firma se calcula sobre él.
    const cuerpo = JSON.parse(req.body.toString('utf8'));
    const entry = cuerpo.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    msg = value?.messages?.[0];
    if (!msg) return;

    from = msg.from;

    // Palomita azul + "escribiendo..." mientras procesamos. Esto es
    // cosmético — si Meta lo rechaza (p. ej. la cuenta aún no tiene
    // habilitado typing_indicator) NO debe tumbar el procesamiento del
    // archivo, por eso va en su propio try/catch y nunca se relanza.
    try {
      const mostrarTyping = msg.type === 'image' || msg.type === 'document';
      await whatsapp.markAsRead(msg.id, mostrarTyping);
    } catch (errRead) {
      console.warn('[webhook] no se pudo marcar como leído (no bloqueante)', {
        status: errRead.response?.status,
        data: errRead.response?.data,
      });
    }

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
    // Antes esto solo se logueaba y el usuario se quedaba sin ninguna
    // respuesta — ni confirmación ni error — sin forma de saber que su
    // archivo no se procesó. Ahora: log con más contexto + aviso al usuario.
    console.error('[webhook] error procesando mensaje', {
      tipo: msg?.type,
      from,
      error: err.message,
      stack: err.stack,
    });

    if (from) {
      try {
        await whatsapp.sendText(
          from,
          'Algo falló al procesar tu archivo 😕 Ya quedó registrado, ¿puedes intentar mandarlo de nuevo?'
        );
      } catch (_) {
        // si ni el aviso de error se pudo mandar, no hay más que hacer aquí
      }
    }
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

  const { documento, nombreArchivo, ruta, paginas } = await procesarDocumento.procesarArchivo(
    user,
    buffer,
    medio.mime_type || mimePorDefecto,
    medio.filename || null
  );

  const appUrl = appUrlPublica();

  await whatsapp.sendButtons(
    from,
    t(idioma, 'guardado', {
      archivo: nombreArchivo,
      ruta,
      paginas: paginas > 1 ? t(idioma, 'paginas', { n: paginas }) : '',
      // Igual que con la app: sin link no se manda la línea vacía. Drive
      // devuelve webViewLink al subir, pero no se da por hecho.
      drive: documento?.drive_link
        ? t(idioma, 'guardadoDrive', { driveLink: documento.drive_link })
        : '',
      // Si no hay dominio público configurado en Railway, no se inventa un
      // link roto — se omite la línea completa en vez de mandarla vacía.
      editar: appUrl ? t(idioma, 'guardadoEditar', { appUrl }) : '',
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

// Cancelar, cambiar tarjeta o ver la facturación.
const QUIERE_SUSCRIPCION =
  /\b(cancelar|cancelaci[óo]n|mi suscripci[óo]n|dar de baja|cambiar (mi )?tarjeta|facturaci[óo]n|cancel|my subscription|unsubscribe|billing)\b/i;

async function handleText(from, text) {
  const limpio = text.trim();
  const user = await traerUsuario(from);
  const idioma = await idiomaDe(user, limpio);

  // Cancelar o cambiar tarjeta: se manda al portal de Stripe.
  if (QUIERE_SUSCRIPCION.test(limpio)) {
    if (!user) {
      await whatsapp.sendText(from, t(idioma, 'primeroApp'));
      return;
    }

    const link = await stripe.portalDeCliente(user);
    await whatsapp.sendText(
      from,
      link ? t(idioma, 'portalPago', { link }) : t(idioma, 'sinSuscripcion')
    );
    return;
  }

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

  // Preguntas de gasto: "¿cuánto gasté el mes pasado en restaurantes?"
  if (user && consultas.pareceConsulta(limpio)) {
    if (!planes.tieneControlDeGastos(user)) {
      await whatsapp.sendText(from, t(idioma, 'gastosEsNegocio'));
      return;
    }

    const respuesta = await consultas.responder(user, limpio);
    if (respuesta) {
      await whatsapp.sendText(from, respuesta);
      return;
    }
    // Si no la entendió como pregunta de gastos, sigue al flujo normal.
  }

  // Acceso a la app: el usuario manda el código que la app le prellenó.
  const codigo = sesiones.extraerCodigo(limpio);
  if (codigo) {
    const usuario = await sesiones.verificarDesdeWhatsapp(codigo, from);
    await whatsapp.sendText(from, t(idioma, usuario ? 'accesoOk' : 'codigoMal'));
    return;
  }

  await whatsapp.sendText(from, t(idioma, 'bienvenida'));
}

async function handleButton(from, interactive) {
  const id = interactive?.button_reply?.id;
  const user = await traerUsuario(from);
  const idioma = await idiomaDe(user);

  if (id === 'app') {
    // El botón no trae el id del documento (WhatsApp solo manda 'app'),
    // así que se asume que se refiere al más reciente del usuario — es
    // el que acaba de llegar en el mensaje anterior. Se manda el link
    // directo a Drive porque siempre funciona; la app todavía no tiene
    // una ruta por documento a la que enlazar desde fuera.
    const { data: reciente } = await supabase
      .from('scan_documents')
      .select('drive_link')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const appUrl = appUrlPublica();

    await whatsapp.sendText(
      from,
      t(idioma, 'verApp', { driveLink: reciente?.drive_link || '', appUrl: appUrl || '' })
    );
  } else if (id === 'otra_cosa') {
    await whatsapp.sendText(from, t(idioma, 'otraCosa'));
  }
}

module.exports = router;
