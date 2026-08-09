const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const supabase = require('./supabase');

/**
 * Sesiones propias, sin correo ni contraseña.
 *
 * El producto vive en WhatsApp, así que la identidad es el número de
 * teléfono. El flujo evita la restricción de Meta —no se puede escribir
 * primero a quien no te ha escrito, salvo con plantilla aprobada—
 * invirtiéndolo: es el usuario quien manda el código.
 *
 *   1. La app pide un código y abre WhatsApp con el mensaje ya escrito.
 *   2. El usuario solo toca "enviar".
 *   3. El webhook lo recibe, reconoce el código y amarra la sesión a ese
 *      número, dando de alta al usuario si es nuevo.
 *   4. La app, que estaba esperando, recibe su token.
 *
 * Un solo toque, sin teclear nada y sin trámites con Meta.
 */

const VIGENCIA_CODIGO_MIN = 10;
const VIGENCIA_TOKEN_DIAS = 90;

// Sin I, O, 0 ni 1: el código se lee en pantalla y se dicta en voz alta.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generarCodigo() {
  const bytes = crypto.randomBytes(8);
  const cuerpo = [...bytes].map((b) => ALFABETO[b % ALFABETO.length]).join('');
  return `TS-${cuerpo}`;
}

// El código viaja en un mensaje de WhatsApp, así que el webhook necesita
// reconocerlo dentro de una frase.
const PATRON_CODIGO = /\bTS-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}\b/;

function extraerCodigo(texto) {
  return texto?.match(PATRON_CODIGO)?.[0] || null;
}

function secreto() {
  const valor = process.env.JWT_SECRET;
  if (!valor) throw new Error('falta_jwt_secret');
  return valor;
}

function firmarToken(usuarioId) {
  return jwt.sign({ sub: usuarioId }, secreto(), { expiresIn: `${VIGENCIA_TOKEN_DIAS}d` });
}

function verificarToken(token) {
  try {
    return jwt.verify(token, secreto()).sub;
  } catch {
    return null;
  }
}

/** Paso 1: la app pide un código para arrancar el acceso. */
async function iniciar() {
  const codigo = generarCodigo();
  const expira = new Date(Date.now() + VIGENCIA_CODIGO_MIN * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('scan_sesiones')
    .insert({ codigo, estado: 'pendiente', expires_at: expira });
  if (error) throw error;

  const numero = (process.env.WHATSAPP_NUMERO || '').replace(/\D/g, '');
  const mensaje = encodeURIComponent(`Hola, quiero entrar a TapptScan. Código: ${codigo}`);

  return {
    codigo,
    expira,
    enlaceWhatsapp: `https://wa.me/${numero}?text=${mensaje}`,
  };
}

/**
 * Paso 3: el webhook reconoció el código en un mensaje entrante.
 * Da de alta al usuario si es nuevo y marca la sesión como verificada.
 */
async function verificarDesdeWhatsapp(codigo, telefono) {
  const { data: sesion, error } = await supabase
    .from('scan_sesiones')
    .select('*')
    .eq('codigo', codigo)
    .eq('estado', 'pendiente')
    .gte('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  if (!sesion) return null; // código inválido, ya usado o vencido

  let { data: usuario } = await supabase
    .from('scan_users')
    .select('*')
    .eq('whatsapp_phone', telefono)
    .maybeSingle();

  if (!usuario) {
    const { data: creado, error: errorAlta } = await supabase
      .from('scan_users')
      .insert({ whatsapp_phone: telefono })
      .select()
      .single();
    if (errorAlta) throw errorAlta;
    usuario = creado;
  }

  await supabase
    .from('scan_sesiones')
    .update({ estado: 'verificado', user_id: usuario.id })
    .eq('id', sesion.id);

  return usuario;
}

/**
 * Paso 4: la app pregunta si ya. El token se entrega UNA sola vez: en
 * cuanto se cobra, la sesión pasa a `consumido`, así el código deja de
 * servir aunque alguien más lo tenga.
 */
async function reclamar(codigo) {
  const { data: sesion, error } = await supabase
    .from('scan_sesiones')
    .select('*')
    .eq('codigo', codigo)
    .maybeSingle();

  if (error) throw error;
  if (!sesion) return { estado: 'desconocido' };

  if (sesion.estado === 'pendiente') {
    return new Date(sesion.expires_at) < new Date()
      ? { estado: 'vencido' }
      : { estado: 'pendiente' };
  }

  if (sesion.estado !== 'verificado') return { estado: 'consumido' };

  await supabase.from('scan_sesiones').update({ estado: 'consumido' }).eq('id', sesion.id);

  return { estado: 'listo', token: firmarToken(sesion.user_id) };
}

module.exports = { iniciar, verificarDesdeWhatsapp, reclamar, verificarToken, extraerCodigo };
