const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const supabase = require('./supabase');
const smsMasivos = require('./smsMasivos');

/**
 * Acceso alterno por SMS, exclusivo de iOS.
 *
 * MuralEx lo tuvo que agregar porque Apple rechaza una app que obliga a
 * instalar otra app para darse de alta (guía 4.8) — ahí el único acceso
 * era WhatsApp. Aquí mismo riesgo: WhatsApp es el único login que existe,
 * así que iOS necesita este camino para no depender de tener WhatsApp
 * instalado. Android y la web app conservan el flujo de WhatsApp tal cual.
 *
 * El reto vive en `scan_otp_retos`, separado de `scan_sesiones` (que es el
 * flujo de WhatsApp): un código de 6 dígitos, vence en 5 minutos, máximo 5
 * intentos y de un solo uso. La app nunca valida el código — solo lo
 * manda al backend.
 */

const VIGENCIA_RETO_MIN = 5;
const VIGENCIA_TOKEN_DIAS = 90;
const MAX_INTENTOS = 5;

// Límite de reenvío simple, en memoria del proceso: alcanza para frenar un
// loop accidental o un abuso leve sin depender de infraestructura extra.
// No sobrevive un reinicio ni se comparte entre instancias — es un primer
// filtro, no la única defensa (el reto en DB sigue limitando lo importante).
const VENTANA_REENVIO_MS = 60 * 1000;
const ultimoEnvioPorTelefono = new Map();
const ultimoEnvioPorIp = new Map();

// Cuenta reintentos por teléfono para escalar de canal: SMS Masivos
// confirmó que el operador filtra como spam los reenvíos repetidos de SMS
// al mismo número, así que a partir del 3er intento se manda por WhatsApp
// y del 4to en adelante por voz. Se resetea sola tras VENTANA_INTENTOS_MS
// de inactividad (sesión nueva = cuenta nueva).
const VENTANA_INTENTOS_MS = 30 * 60 * 1000;
const intentosPorTelefono = new Map();

function canalParaIntento(numero) {
  if (numero <= 2) return 'sms';
  if (numero === 3) return 'whatsapp';
  return 'voice';
}

function siguienteIntento(telefono52) {
  const ahora = Date.now();
  for (const [clave, { momento }] of intentosPorTelefono) {
    if (ahora - momento > VENTANA_INTENTOS_MS) intentosPorTelefono.delete(clave);
  }
  const previo = intentosPorTelefono.get(telefono52);
  const numero = previo && ahora - previo.momento <= VENTANA_INTENTOS_MS ? previo.numero + 1 : 1;
  intentosPorTelefono.set(telefono52, { numero, momento: ahora });
  return numero;
}

// Nombre capturado en el paso 1, a la espera de que el reto se verifique
// en el paso 2 y se use para dar de alta la cuenta. Vive solo en memoria
// del proceso — si el server reinicia entre un paso y otro, el usuario
// simplemente queda sin nombre guardado, nada grave.
const nombrePorTelefono = new Map();

function limpiarMapaViejo(mapa) {
  const limite = Date.now() - VENTANA_REENVIO_MS * 10;
  for (const [clave, momento] of mapa) {
    if (momento < limite) mapa.delete(clave);
  }
}

function dentroDelLimite(mapa, clave) {
  limpiarMapaViejo(mapa);
  const ultimo = mapa.get(clave);
  return ultimo && Date.now() - ultimo < VENTANA_REENVIO_MS;
}

function secretoJwt() {
  const valor = process.env.JWT_SECRET;
  if (!valor) throw new Error('falta_jwt_secret');
  return valor;
}

function firmarToken(usuarioId) {
  return jwt.sign({ sub: usuarioId }, secretoJwt(), { expiresIn: `${VIGENCIA_TOKEN_DIAS}d` });
}

/** Normaliza a 52 + 10 dígitos. Rechaza cualquier cosa que no cuadre. */
function normalizarTelefono(crudo) {
  const digitos = String(crudo || '').replace(/\D/g, '');
  const diez = digitos.length === 12 && digitos.startsWith('52') ? digitos.slice(2) : digitos;
  if (diez.length !== 10) return null;
  return { telefono10: diez, telefono52: `52${diez}` };
}

function generarCodigo() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function telefonoReservadoApple(telefono52) {
  const reservado = (process.env.TAPPT_APP_REVIEW_PHONE || '').replace(/\D/g, '');
  return Boolean(reservado) && telefono52 === reservado;
}

/**
 * Paso 1: la app manda nombre + teléfono. Crea el reto y dispara el SMS,
 * salvo que sea el teléfono reservado para la revisión de Apple — ese
 * nunca manda SMS real, usa el código fijo de `TAPPT_APP_REVIEW_CODE`.
 */
async function iniciar(nombre, telefonoCrudo, ip) {
  const normalizado = normalizarTelefono(telefonoCrudo);
  if (!normalizado) throw Object.assign(new Error('telefono_invalido'), { codigo: 'telefono_invalido' });
  const { telefono10, telefono52 } = normalizado;

  if (dentroDelLimite(ultimoEnvioPorTelefono, telefono52) || (ip && dentroDelLimite(ultimoEnvioPorIp, ip))) {
    const err = new Error('demasiados_intentos');
    err.codigo = 'demasiados_intentos';
    throw err;
  }
  ultimoEnvioPorTelefono.set(telefono52, Date.now());
  if (ip) ultimoEnvioPorIp.set(ip, Date.now());

  const esReservado = telefonoReservadoApple(telefono52);
  const codigo = esReservado ? process.env.TAPPT_APP_REVIEW_CODE : generarCodigo();
  if (esReservado && !codigo) throw new Error('falta_tappt_app_review_code');

  const expira = new Date(Date.now() + VIGENCIA_RETO_MIN * 60 * 1000).toISOString();

  // Cualquier reto pendiente anterior de ese teléfono queda invalidado:
  // solo el más nuevo sirve.
  await supabase
    .from('scan_otp_retos')
    .update({ estado: 'invalido' })
    .eq('telefono', telefono52)
    .eq('estado', 'pendiente');

  const { error } = await supabase.from('scan_otp_retos').insert({
    telefono: telefono52,
    codigo,
    estado: 'pendiente',
    expires_at: expira,
  });
  if (error) throw error;

  if (!esReservado) {
    const numeroIntento = siguienteIntento(telefono52);
    const canal = canalParaIntento(numeroIntento);
    try {
      await smsMasivos.enviarCodigo(telefono10, codigo, canal);
    } catch (err) {
      await supabase
        .from('scan_otp_retos')
        .update({ estado: 'invalido' })
        .eq('telefono', telefono52)
        .eq('codigo', codigo);
      throw err;
    }
  }

  if (nombre) nombrePorTelefono.set(telefono52, nombre);

  return { ok: true, telefono: telefono52, expira };
}

/**
 * Paso 2: la app manda los 6 dígitos. Valida intentos y vigencia, crea o
 * recupera la cuenta por `telefono_sms`, y entrega el token.
 */
async function verificar(telefonoCrudo, codigoCrudo) {
  const normalizado = normalizarTelefono(telefonoCrudo);
  if (!normalizado) return { estado: 'telefono_invalido' };
  const { telefono52 } = normalizado;
  const codigo = String(codigoCrudo || '').trim();

  const { data: reto, error } = await supabase
    .from('scan_otp_retos')
    .select('*')
    .eq('telefono', telefono52)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!reto) return { estado: 'sin_reto' };

  if (new Date(reto.expires_at) < new Date()) {
    await supabase.from('scan_otp_retos').update({ estado: 'invalido' }).eq('id', reto.id);
    return { estado: 'vencido' };
  }

  if (reto.intentos >= MAX_INTENTOS) {
    await supabase.from('scan_otp_retos').update({ estado: 'invalido' }).eq('id', reto.id);
    return { estado: 'demasiados_intentos' };
  }

  if (codigo !== reto.codigo) {
    await supabase
      .from('scan_otp_retos')
      .update({ intentos: reto.intentos + 1 })
      .eq('id', reto.id);
    return { estado: 'codigo_incorrecto', intentosRestantes: MAX_INTENTOS - reto.intentos - 1 };
  }

  let { data: usuario } = await supabase
    .from('scan_users')
    .select('*')
    .eq('telefono_sms', telefono52)
    .maybeSingle();

  if (!usuario) {
    const nombre = nombrePorTelefono.get(telefono52) || null;
    const { data: creado, error: errorAlta } = await supabase
      .from('scan_users')
      .insert({ telefono_sms: telefono52, nombre })
      .select()
      .single();
    if (errorAlta) throw errorAlta;
    usuario = creado;
    nombrePorTelefono.delete(telefono52);
  }

  await supabase.from('scan_otp_retos').update({ estado: 'consumido' }).eq('id', reto.id);

  return { estado: 'listo', token: firmarToken(usuario.id) };
}

module.exports = { iniciar, verificar, normalizarTelefono };
