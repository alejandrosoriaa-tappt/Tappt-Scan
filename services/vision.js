const axios = require('axios');

const SYSTEM_PROMPT = `Eres el motor de clasificación y extracción de TapptScan. Recibes la
imagen de un documento (identificación, recibo, contrato u otro) y devuelves
SOLO un JSON con esta forma, sin texto adicional:
{
  "tipo": "identificacion|recibo|contrato|otro",
  "emisor": "string o null",
  "fecha": "YYYY-MM-DD o null",
  "monto": number o null,
  "moneda": "string o null",
  "resumen": "descripción corta en español"
}`;

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

  const text = data.content?.[0]?.text || '{}';
  return JSON.parse(text);
}

module.exports = { classifyAndExtract };
