const axios = require('axios');

// Lo que Claude debe deducir para que el archivo se guarde solo. La clave
// es `ambito` y `categoria`: son los que convierten una carpeta plana en
// una ruta que un humano habría armado a mano.
const SYSTEM_PROMPT = `Eres el motor de clasificación de TapptScan. Recibes la imagen de un
documento y devuelves SOLO un JSON, sin texto adicional ni bloques de código.

{
  "tipo": "identificacion|recibo|factura|contrato|estado_cuenta|receta|poliza|otro",
  "ambito": "Casa|Trabajo|Personal|Vehiculo",
  "categoria": "Servicios|Impuestos|Salud|Legal|Educacion|Compras|Banco|Seguros|Identificaciones|Otros",
  "emisor": "nombre corto y reconocible de quien emite (ej. CFE, Telmex, IMSS, Liverpool) o null",
  "fecha": "YYYY-MM-DD del documento, o null",
  "periodo_mes": 1-12 del periodo que cubre el documento, o null,
  "periodo_anio": año de cuatro dígitos del periodo, o null,
  "monto": number sin símbolos ni separadores de miles, o null,
  "moneda": "MXN|USD|EUR|... o null",
  "resumen": "una línea en español describiendo el documento"
}

Reglas:
- "emisor" debe ser la marca corta, no la razón social completa:
  "CFE", no "Comisión Federal de Electricidad, S.A. de C.V.".
- Un recibo de luz/agua/gas/internet/teléfono es ambito "Casa",
  categoria "Servicios".
- Tenencia, verificación, gasolina o servicio mecánico son ambito "Vehiculo".
- Una credencial, pasaporte o licencia es categoria "Identificaciones".
- Si el documento cubre un periodo (un mes de consumo), usa ese periodo en
  "periodo_mes"/"periodo_anio", no la fecha de impresión.
- Si no puedes determinar un campo con confianza, ponlo en null. No inventes.`;

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
    return { tipo: 'otro', ambito: null, categoria: 'Otros' };
  }
}

module.exports = { classifyAndExtract };
