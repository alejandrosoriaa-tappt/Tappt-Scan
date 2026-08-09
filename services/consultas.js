const axios = require('axios');
const taxonomia = require('./taxonomia');
const gastos = require('./gastos');

/**
 * Preguntas de gasto en lenguaje natural, por el chat de WhatsApp.
 *
 *   "¿cuánto gasté el mes pasado en restaurantes?"
 *   "¿cuánta gasolina le he puesto al coche este mes?"
 *   "¿cuánto llevo invertido en el proyecto de la cocina?"
 *
 * Dos pasos, a propósito:
 *   1. Claude traduce la pregunta a un objeto de FILTROS (no a una consulta).
 *   2. Nosotros ejecutamos la agregación y le devolvemos los números para
 *      que los redacte.
 *
 * El modelo nunca toca la base. Si le dejáramos escribir la consulta,
 * cualquier frase del usuario podría convertirse en una lectura de datos
 * ajenos.
 */

const MODELO = process.env.CLAUDE_CONSULTAS_MODEL || 'claude-opus-4-8';

async function claude(system, mensajes, maxTokens = 700) {
  const { data } = await axios.post(
    'https://api.anthropic.com/v1/messages',
    { model: MODELO, max_tokens: maxTokens, system, messages: mensajes },
    {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
    }
  );
  return data.content?.[0]?.text || '';
}

// ¿La frase es una pregunta sobre dinero, o es otra cosa? Se resuelve con
// una heurística barata antes de gastar una llamada al modelo.
const PISTAS_GASTO =
  /(cu[áa]nto|cu[áa]nta|gast[éeoá]|pagu[ée]|llevo|total|suma|balance|how much|spent|spend)/i;

function pareceConsulta(texto) {
  return Boolean(texto) && texto.length > 8 && PISTAS_GASTO.test(texto);
}

const SISTEMA_FILTROS = (hoy) => `Traduces preguntas sobre gastos a filtros. Devuelves SOLO un JSON:

{
  "desde": "YYYY-MM-DD o null",
  "hasta": "YYYY-MM-DD o null",
  "categoria_gasto": "una de las categorías, o null",
  "emisor": "texto a buscar en el nombre del comercio, o null",
  "proyecto": "nombre del proyecto si la pregunta lo menciona, o null",
  "entendida": true si la pregunta es sobre gastos y pudiste interpretarla
}

Hoy es ${hoy}. Resuelve las fechas relativas contra esa fecha:
"el mes pasado" es del día 1 al último día del mes anterior; "este mes" va
del día 1 del mes actual a hoy; "el año pasado" es todo el año anterior.

Categorías válidas: ${taxonomia.CATEGORIAS_GASTO.join(', ')}.

- Usa "categoria_gasto" cuando la pregunta sea por un tipo de gasto
  ("restaurantes", "gasolina"). Usa "emisor" cuando nombre un comercio
  concreto ("Costco", "CFE"). Puedes usar ambos.
- Usa "proyecto" solo si la pregunta habla de un proyecto con nombre
  ("el proyecto de la cocina", "la remodelación del baño").
- Si la pregunta no es sobre gastos, devuelve "entendida": false.`;

async function interpretar(pregunta) {
  const hoy = new Date().toISOString().slice(0, 10);
  const texto = await claude(SISTEMA_FILTROS(hoy), [{ role: 'user', content: pregunta }], 300);
  const limpio = texto.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  try {
    return JSON.parse(limpio);
  } catch {
    return { entendida: false };
  }
}

const SISTEMA_RESPUESTA = `Respondes preguntas sobre los gastos del usuario por WhatsApp.

Te dan la pregunta y los números YA CALCULADOS. Tu trabajo es redactarlos,
no recalcularlos: usa exactamente las cifras que recibes.

- Máximo 4 líneas. Es un chat, no un reporte.
- Empieza por la cifra que contesta la pregunta.
- Si ayuda, desglosa los 2 o 3 rubros o comercios más grandes.
- Formato de moneda con separador de miles: $1,847.00 MXN.
- Si no hay documentos en ese periodo, dilo claro y sugiere que mande sus
  tickets por aquí para empezar a registrarlos. No inventes cifras.
- Tutea. Sin saludos ni despedidas.`;

async function responder(usuario, pregunta) {
  const filtros = await interpretar(pregunta);
  if (!filtros.entendida) return null;

  const { resumen, documentos, filtros: aplicados } = await gastos.consultar(usuario.id, filtros);

  const contexto = {
    pregunta,
    filtros_aplicados: aplicados,
    total: resumen.total,
    documentos_encontrados: resumen.cantidad,
    por_categoria: resumen.porCategoria.slice(0, 5),
    por_comercio: resumen.porEmisor.slice(0, 5),
    ejemplos: documentos.slice(0, 5).map((d) => ({
      fecha: d.fecha,
      emisor: d.emisor,
      monto: d.monto,
      concepto: d.concepto,
    })),
    idioma: usuario.idioma || 'es',
  };

  return claude(SISTEMA_RESPUESTA, [
    { role: 'user', content: JSON.stringify(contexto) },
  ]);
}

module.exports = { pareceConsulta, interpretar, responder };
