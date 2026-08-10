#!/usr/bin/env node
/**
 * Generador de variables de entorno de TapptScan.
 *
 *   npm run variables              → modo guiado: pregunta una por una
 *   npm run variables -- --raw     → solo imprime el bloque para Railway
 *   npm run variables -- --revisar → revisa el .env que ya existe
 *
 * Por qué existe: son 20 variables repartidas entre cinco consolas distintas
 * (Supabase, Anthropic, Google, Meta, Stripe) y cuatro de ellas se pueden
 * calcular solas. Escribirlas a mano en el panel de Railway, una por una, es
 * donde se cuelan los errores que después cuesta trabajo encontrar: un espacio
 * al final del token, el redirect URI que no coincide letra por letra con el
 * de Google, el guardrail de identidad con un id distinto al de arriba.
 *
 * El script no habla con ningún servicio: no puede inventar tus llaves. Lo que
 * hace es generar los secretos que sí se pueden generar, derivar los que se
 * derivan de otros, validar el formato de lo que pegas y escupir un bloque
 * que se pega de una sola vez en el Raw Editor de Railway.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline/promises');

const RAIZ = path.join(__dirname, '..');
const ENV_BACKEND = path.join(RAIZ, '.env');
const ENV_APP = path.join(RAIZ, 'app', '.env');

// --- utilidades de presentación ---------------------------------------------

const color = process.stdout.isTTY;
const c = (codigo, texto) => (color ? `[${codigo}m${texto}[0m` : texto);
const verde = (t) => c('32', t);
const rojo = (t) => c('31', t);
const gris = (t) => c('90', t);
const negrita = (t) => c('1', t);

// --- validadores -------------------------------------------------------------
// Devuelven null si el valor está bien, o el motivo del rechazo.

const noVacio = (v) => (v.trim() ? null : 'no puede quedar vacío');

const empiezaCon = (...prefijos) => (v) =>
  prefijos.some((p) => v.startsWith(p))
    ? null
    : `debe empezar con ${prefijos.map((p) => `"${p}"`).join(' o ')}`;

const soloDigitos = (v) => (/^\d+$/.test(v) ? null : 'son solo números, sin espacios ni guiones');

const urlHttps = (v) => {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' ? null : 'debe ser https://';
  } catch {
    return 'no parece una URL válida';
  }
};

const unaDe = (...opciones) => (v) =>
  opciones.includes(v.toLowerCase()) ? null : `tiene que ser una de: ${opciones.join(', ')}`;

/**
 * Un dominio de Railway se pega de muchas formas: con https, sin https, con
 * diagonal final, con la ruta pegada. Todas significan lo mismo, así que en
 * vez de rechazarlas las normalizamos.
 */
function normalizaDominio(v) {
  let d = v.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return d ? `https://${d}` : '';
}

// --- catálogo de variables ---------------------------------------------------
//
// `pregunta` es null cuando la variable no se pregunta: o se genera sola, o se
// deriva de otra respuesta. `defecto` es lo que se usa si el usuario da Enter.

const VARIABLES = [
  {
    grupo: 'WhatsApp Cloud API',
    donde: 'developers.facebook.com → tu app → WhatsApp → API Setup',
    items: [
      {
        clave: 'WHATSAPP_TOKEN',
        pregunta: 'Token de acceso (el largo, empieza con EAA)',
        valida: noVacio,
      },
      {
        clave: 'WHATSAPP_PHONE_NUMBER_ID',
        pregunta: 'Phone number ID (el número largo debajo del teléfono)',
        valida: soloDigitos,
      },
      {
        clave: 'EXPECTED_WHATSAPP_PHONE_NUMBER_ID',
        deriva: (r) => r.WHATSAPP_PHONE_NUMBER_ID,
        nota: 'igual al de arriba — es el guardrail de identidad',
      },
      {
        clave: 'WHATSAPP_APP_SECRET',
        pregunta: 'Clave secreta de la app (Configuración → Básica → Mostrar)',
        valida: noVacio,
        nota: 'sin esto, cualquiera que descubra la URL puede simular mensajes',
      },
      {
        clave: 'WHATSAPP_VERIFY_TOKEN',
        genera: () => `tapptscan-${crypto.randomBytes(12).toString('hex')}`,
        nota: 'este mismo string se copia en Meta al dar de alta el webhook',
      },
      {
        clave: 'WHATSAPP_NUMERO',
        pregunta: 'Número de TapptScan en formato internacional',
        defecto: '+5215644170712',
        nota: 'con esto la app arma el enlace wa.me del acceso',
      },
    ],
  },
  {
    grupo: 'Sesiones',
    items: [
      {
        clave: 'JWT_SECRET',
        genera: () => crypto.randomBytes(48).toString('base64url'),
        nota: 'firma las sesiones; cambiarlo saca a todos los usuarios',
      },
    ],
  },
  {
    grupo: 'Supabase',
    donde: 'Project Settings → API',
    items: [
      {
        clave: 'SUPABASE_URL',
        pregunta: 'Project URL',
        valida: urlHttps,
      },
      {
        clave: 'SUPABASE_SERVICE_ROLE_KEY',
        pregunta: 'Secret key (sb_secret_… o la service_role de Legacy)',
        valida: noVacio,
        secreto: true,
        nota: 'esta llave se salta RLS: va SOLO en Railway, nunca en la app',
      },
    ],
  },
  {
    grupo: 'Anthropic',
    donde: 'console.anthropic.com → API keys',
    items: [
      {
        clave: 'ANTHROPIC_API_KEY',
        pregunta: 'API key',
        valida: empiezaCon('sk-ant-'),
        secreto: true,
      },
      {
        clave: 'CLAUDE_VISION_MODEL',
        defecto: 'claude-opus-4-8',
        pregunta: 'Modelo que clasifica el documento',
        nota: 'bajarlo a Haiku abarata cada escaneo',
      },
      {
        clave: 'CLAUDE_CONSULTAS_MODEL',
        defecto: 'claude-opus-4-8',
        pregunta: 'Modelo que responde preguntas de gasto',
      },
    ],
  },
  {
    grupo: 'Google Drive',
    donde: 'Google Cloud Console → Credenciales → OAuth client ID (Web application)',
    items: [
      {
        clave: 'GOOGLE_CLIENT_ID',
        pregunta: 'Client ID',
        valida: noVacio,
      },
      {
        clave: 'GOOGLE_CLIENT_SECRET',
        pregunta: 'Client secret',
        valida: noVacio,
        secreto: true,
      },
      {
        clave: 'GOOGLE_REDIRECT_URI',
        deriva: (r) => `${r.__dominio}/api/drive/callback`,
        nota: 'este valor exacto va en "Authorized redirect URI" de Google',
      },
    ],
  },
  {
    grupo: 'Stripe',
    donde: 'Developers → API keys (con Test mode encendido para probar)',
    items: [
      {
        clave: 'STRIPE_SECRET_KEY',
        pregunta: 'Secret key',
        valida: empiezaCon('sk_test_', 'sk_live_'),
        secreto: true,
      },
      {
        clave: 'STRIPE_WEBHOOK_SECRET',
        pregunta: 'Signing secret del webhook',
        valida: empiezaCon('whsec_'),
        secreto: true,
        nota: 'sale al crear el endpoint; se puede dejar al final',
      },
      {
        clave: 'STRIPE_MONEDA',
        defecto: 'mxn',
        pregunta: 'Moneda por defecto',
        valida: unaDe('mxn', 'usd', 'eur'),
      },
      {
        clave: 'STRIPE_SUCCESS_URL',
        defecto: 'https://tappt.lat/scan/gracias',
        pregunta: 'Página de "gracias" después de pagar',
      },
      {
        clave: 'STRIPE_CANCEL_URL',
        defecto: 'https://tappt.lat/scan',
        pregunta: 'Página a la que vuelve si cancela el pago',
      },
    ],
  },
];

const TODAS = VARIABLES.flatMap((g) => g.items);

/** El webhook de Stripe necesita el dominio, que no existe hasta el deploy. */
const PENDIENTE = 'PENDIENTE';

// --- modo guiado -------------------------------------------------------------

async function guiado() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const respuestas = {};

  console.log(`
${negrita('TapptScan · variables de entorno')}

Voy a preguntarte una por una. Enter deja el valor sugerido, y ${negrita(PENDIENTE)}
la deja para después (útil con el webhook de Stripe, que necesita el dominio).

Guía completa con capturas: ${gris('docs/PUESTA-EN-MARCHA.md')}
`);

  const dominio = normalizaDominio(
    await rl.question(
      `${negrita('Dominio de Railway')} ${gris('(Settings → Networking → Generate Domain)')}\n  > `,
    ),
  );
  if (!dominio) {
    console.log(rojo('\nSin dominio no puedo derivar el redirect URI de Google. Genera el dominio en Railway y vuelve a correr esto.'));
    rl.close();
    process.exit(1);
  }
  respuestas.__dominio = dominio;
  console.log(gris(`  ✓ ${dominio}\n`));

  for (const grupo of VARIABLES) {
    console.log(`${negrita(`— ${grupo.grupo} —`)}${grupo.donde ? gris(`\n  ${grupo.donde}`) : ''}`);

    for (const item of grupo.items) {
      if (item.genera) {
        respuestas[item.clave] = item.genera();
        console.log(`  ${verde('✓')} ${item.clave} ${gris(`generado · ${item.nota || ''}`)}`);
        continue;
      }
      if (item.deriva) {
        respuestas[item.clave] = item.deriva(respuestas);
        console.log(`  ${verde('✓')} ${item.clave} = ${respuestas[item.clave]} ${gris(item.nota ? `· ${item.nota}` : '')}`);
        continue;
      }

      // Se pregunta hasta que el valor pase el validador.
      for (;;) {
        const sufijo = item.defecto ? gris(` [${item.defecto}]`) : '';
        const nota = item.nota ? gris(`\n    ${item.nota}`) : '';
        const bruto = await rl.question(`  ${item.pregunta}${sufijo}${nota}\n  > `);
        const valor = bruto.trim() || item.defecto || '';

        if (valor === PENDIENTE) {
          respuestas[item.clave] = PENDIENTE;
          console.log(gris('    ↷ pendiente\n'));
          break;
        }
        const error = item.valida ? item.valida(valor) : null;
        if (error) {
          console.log(rojo(`    ✗ ${error}\n`));
          continue;
        }
        respuestas[item.clave] = valor;
        console.log(gris(`    ✓ ${item.secreto ? enmascara(valor) : valor}\n`));
        break;
      }
    }
    console.log('');
  }

  rl.close();
  escribir(respuestas);
  imprimirBloque(respuestas);
}

// --- modo plantilla ----------------------------------------------------------

function plantilla() {
  const respuestas = { __dominio: 'https://TU-APP.up.railway.app' };
  for (const item of TODAS) {
    if (item.genera) respuestas[item.clave] = item.genera();
    else if (item.deriva) respuestas[item.clave] = item.deriva(respuestas);
    else respuestas[item.clave] = item.defecto || `PEGA_AQUI_${item.clave}`;
  }
  imprimirBloque(respuestas);
}

// --- revisión ----------------------------------------------------------------

function revisar() {
  if (!fs.existsSync(ENV_BACKEND)) {
    console.log(rojo(`No existe ${ENV_BACKEND}. Corre "npm run variables" primero.`));
    process.exit(1);
  }
  const env = leerEnv(ENV_BACKEND);
  let problemas = 0;

  for (const item of TODAS) {
    const valor = env[item.clave];
    if (!valor || valor === PENDIENTE || valor.startsWith('PEGA_AQUI_')) {
      console.log(`${rojo('✗')} ${item.clave} ${gris('sin valor')}`);
      problemas++;
      continue;
    }
    const error = item.valida ? item.valida(valor) : null;
    if (error) {
      console.log(`${rojo('✗')} ${item.clave} ${gris(error)}`);
      problemas++;
      continue;
    }
    if (valor !== valor.trim()) {
      console.log(`${rojo('✗')} ${item.clave} ${gris('tiene espacios al principio o al final')}`);
      problemas++;
      continue;
    }
    console.log(`${verde('✓')} ${item.clave}`);
  }

  // El guardrail aborta el arranque si estos dos no coinciden: vale la pena
  // decirlo aquí y no descubrirlo en los logs de Railway.
  if (env.WHATSAPP_PHONE_NUMBER_ID !== env.EXPECTED_WHATSAPP_PHONE_NUMBER_ID) {
    console.log(rojo('\n✗ WHATSAPP_PHONE_NUMBER_ID y EXPECTED_WHATSAPP_PHONE_NUMBER_ID no coinciden — el server no va a arrancar.'));
    problemas++;
  }

  console.log(problemas ? rojo(`\n${problemas} pendiente(s).`) : verde('\nTodo listo.'));
  process.exit(problemas ? 1 : 0);
}

// --- salida ------------------------------------------------------------------

function enmascara(v) {
  return v.length <= 8 ? '••••' : `${v.slice(0, 4)}…${v.slice(-4)}`;
}

function leerEnv(ruta) {
  const env = {};
  for (const linea of fs.readFileSync(ruta, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function bloque(r) {
  return TODAS.map((i) => `${i.clave}=${r[i.clave] ?? ''}`).join('\n');
}

function escribir(r) {
  fs.writeFileSync(ENV_BACKEND, `# Generado por scripts/variables.js\n# NO se sube a git (está en .gitignore).\n\n${bloque(r)}\n`);
  fs.writeFileSync(ENV_APP, `EXPO_PUBLIC_API_URL=${r.__dominio}\n`);
  console.log(`${verde('✓')} escrito ${gris('.env')} y ${gris('app/.env')}\n`);
}

function imprimirBloque(r) {
  const pendientes = TODAS.filter((i) => String(r[i.clave]).startsWith('PEGA_AQUI_') || r[i.clave] === PENDIENTE);

  console.log(`${negrita('Pega esto en Railway')} ${gris('→ Variables → botón "Raw Editor" → Save')}\n`);
  console.log(bloque(r));
  console.log('');

  if (pendientes.length) {
    console.log(`${negrita('Te falta llenar:')}`);
    for (const i of pendientes) console.log(`  · ${i.clave}${i.nota ? gris(` — ${i.nota}`) : ''}`);
    console.log('');
  }

  console.log(`${negrita('Y luego, con el dominio ya generado:')}
  · Google  → Authorized redirect URI: ${gris(`${r.__dominio || 'https://TU-APP.up.railway.app'}/api/drive/callback`)}
  · Meta    → Callback URL:            ${gris(`${r.__dominio || 'https://TU-APP.up.railway.app'}/webhook`)}
              Verify token:            ${gris(r.WHATSAPP_VERIFY_TOKEN)}
  · Stripe  → Endpoint:                ${gris(`${r.__dominio || 'https://TU-APP.up.railway.app'}/api/pagos/webhook`)}

Comprobar: ${gris(`curl ${r.__dominio || 'https://TU-APP.up.railway.app'}/health`)}
`);
}

// --- entrada -----------------------------------------------------------------

const args = process.argv.slice(2);
if (args.includes('--revisar')) revisar();
else if (args.includes('--raw') || args.includes('--plantilla')) plantilla();
else
  guiado().catch((err) => {
    console.error(rojo(`\n${err.message}`));
    process.exit(1);
  });
