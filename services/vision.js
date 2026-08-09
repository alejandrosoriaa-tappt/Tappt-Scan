const axios = require('axios');

const taxonomia = require('./taxonomia');

// El catálogo de carpetas se inyecta en el prompt desde `taxonomia.js`, así
// que el modelo clasifica contra las carpetas que el usuario REALMENTE tiene
// creadas — no contra categorías inventadas que luego hay que mapear.
const SYSTEM_PROMPT = `Eres el motor de clasificación de TapptScan. Recibes la imagen de un
documento y devuelves SOLO un JSON, sin texto adicional ni bloques de código.

{
  "seccion": "clave de sección del catálogo, o null",
  "subcarpeta": "clave de subcarpeta de ESA sección, o null",
  "tipo": "identificacion|recibo|factura|contrato|estado_cuenta|receta|poliza|otro",
  "emisor": "nombre corto y reconocible de quien emite (ej. CFE, Telmex, IMSS) o null",
  "fecha": "YYYY-MM-DD del documento, o null",
  "periodo_mes": 1-12 del periodo que cubre el documento, o null,
  "periodo_anio": año de cuatro dígitos del periodo, o null,
  "monto": number sin símbolos ni separadores de miles, o null,
  "moneda": "MXN|USD|EUR|... o null",
  "resumen": "una línea en español describiendo el documento"
}

Catálogo de carpetas (sección: subcarpetas válidas):
${taxonomia.catalogoParaPrompt()}

Reglas:
- "seccion" y "subcarpeta" deben salir EXACTAMENTE del catálogo. La
  subcarpeta debe pertenecer a la sección elegida.
- Si dudas entre dos carpetas, o no reconoces el documento, deja ambas en
  null: el documento se guarda en "99 · Por revisar" y el usuario lo mueve.
  Es preferible eso a archivarlo mal.
- "emisor" debe ser la marca corta, no la razón social completa:
  "CFE", no "Comisión Federal de Electricidad, S.A. de C.V.".
- Un recibo de luz, agua, gas, internet o teléfono del hogar va en
  casa/servicios. Un ticket de compra o gasto suelto va en dinero/recibos.
- Si el documento cubre un periodo (un mes de consumo), usa ese periodo en
  "periodo_mes"/"periodo_anio", no la fecha de impresión.
- No inventes datos: lo que no puedas leer con confianza va en null.`;

async function classifyAndExtract(imageBuffer, mimeType) {
  const base64 = imageBuffer.toString('base64');
  const { data } = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: process.env.CLAUDE_VISION_MODEL || 'claude-opus-4-8',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
            { type: 'text', text: 'Clasifica y extrae los datos de este documento.' },
          ],
        },
      ],
    },
    {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
    }
  );

  const texto = data.content?.[0]?.text || '{}';

  // Por si el modelo envuelve el JSON en ```json a pesar de la instrucción.
  const limpio = texto.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  try {
    return JSON.parse(limpio);
  } catch (err) {
    console.error('[vision] respuesta no parseable:', texto.slice(0, 200));
    return { tipo: 'otro', seccion: null, subcarpeta: null };
  }
}

module.exports = { classifyAndExtract };
