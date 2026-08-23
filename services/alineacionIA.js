'use strict';

const { iou, areaPoligono } = require('../scanner/fixtures/iou');

const MODELO = process.env.OPENAI_ALIGNMENT_MODEL || 'gpt-5.6-luna';
const IOU_CONFIRMACION = 0.75;
const CONFIANZA_MINIMA = 0.85;

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'document_present',
    'all_edges_visible',
    'confidence',
    'orientation_degrees',
    'blur',
    'glare',
    'shadow',
    'corners',
    'recommended_action',
  ],
  properties: {
    document_present: { type: 'boolean' },
    all_edges_visible: { type: 'boolean' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    orientation_degrees: { type: 'integer', enum: [0, 90, 180, 270] },
    blur: { type: 'number', minimum: 0, maximum: 1 },
    glare: { type: 'number', minimum: 0, maximum: 1 },
    shadow: { type: 'number', minimum: 0, maximum: 1 },
    corners: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['x', 'y'],
        properties: {
          x: { type: 'number', minimum: 0, maximum: 100 },
          y: { type: 'number', minimum: 0, maximum: 100 },
        },
      },
    },
    recommended_action: {
      type: 'string',
      enum: ['accept', 'retake_blur', 'retake_glare', 'retake_missing_edges', 'not_document'],
    },
  },
};

function habilitada() {
  return process.env.OPENAI_ALIGNMENT_ENABLED === 'true' && Boolean(process.env.OPENAI_API_KEY);
}

function productoCruz(a, b, c) {
  return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
}

function quadValido(esquinas) {
  if (!Array.isArray(esquinas) || esquinas.length !== 4) return false;
  if (!esquinas.every((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) return false;

  const cruces = esquinas.map((p, i) => productoCruz(p, esquinas[(i + 1) % 4], esquinas[(i + 2) % 4]));
  const convexa = cruces.every((v) => v > 1e-6) || cruces.every((v) => v < -1e-6);
  if (!convexa) return false;

  const area = areaPoligono(esquinas);
  if (area < 0.15 || area > 0.98) return false;

  const lados = esquinas.map((p, i) => Math.hypot(p.x - esquinas[(i + 1) % 4].x, p.y - esquinas[(i + 1) % 4].y));
  return Math.min(...lados) >= 0.08;
}

function normalizarRespuesta(resultado) {
  if (!resultado || typeof resultado !== 'object') return null;
  const corners = Array.isArray(resultado.corners)
    ? resultado.corners.map((p) => ({ x: Number(p.x) / 100, y: Number(p.y) / 100 }))
    : null;
  if (!quadValido(corners)) return null;
  return { ...resultado, corners };
}

async function imagenReducida(buffer) {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const image = await loadImage(buffer);
  const escala = Math.min(1, 1024 / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * escala));
  const height = Math.max(1, Math.round(image.height * escala));
  const canvas = createCanvas(width, height);
  canvas.getContext('2d').drawImage(image, 0, 0, width, height);
  return canvas.toBuffer('image/jpeg', 82).toString('base64');
}

function extraerTexto(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return null;
}

async function consultar(buffer) {
  if (!habilitada()) return null;
  const axios = require('axios');
  const base64 = await imagenReducida(buffer);
  const { data } = await axios.post(
    'https://api.openai.com/v1/responses',
    {
      model: MODELO,
      store: false,
      input: [{
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'Evalúa la captura de un documento. Las esquinas deben seguir únicamente los cuatro bordes físicos exteriores del papel y venir ordenadas TL, TR, BR, BL. No inventes bordes ocultos. Si falta un borde, indica retake_missing_edges.',
          },
          { type: 'input_image', detail: 'high', image_url: `data:image/jpeg;base64,${base64}` },
        ],
      }],
      text: {
        format: {
          type: 'json_schema',
          name: 'document_capture_quality',
          strict: true,
          schema: OUTPUT_SCHEMA,
        },
      },
    },
    {
      timeout: 12_000,
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );
  const texto = extraerTexto(data);
  if (!texto) return null;
  return normalizarRespuesta(JSON.parse(texto));
}

function evaluarCorroboracion(resultado, esquinasLocales) {
  if (!resultado || !quadValido(resultado.corners) || !quadValido(esquinasLocales)) {
    return { confirmada: false, razon: 'IA_SIN_RESULTADO' };
  }
  const acuerdoIoU = iou(esquinasLocales, resultado.corners);
  const calidadAceptable =
    resultado.document_present &&
    resultado.all_edges_visible &&
    resultado.recommended_action === 'accept' &&
    Number(resultado.confidence) >= CONFIANZA_MINIMA;
  return {
    confirmada: calidadAceptable && acuerdoIoU >= IOU_CONFIRMACION,
    razon: calidadAceptable ? (acuerdoIoU >= IOU_CONFIRMACION ? null : 'IA_SIN_ACUERDO') : resultado.recommended_action,
    acuerdoIoU,
    resultado,
  };
}

async function corroborar(buffer, esquinasLocales) {
  if (!habilitada() || !quadValido(esquinasLocales)) return { confirmada: false, razon: 'IA_NO_APLICA' };
  try {
    const resultado = await consultar(buffer);
    return evaluarCorroboracion(resultado, esquinasLocales);
  } catch (err) {
    console.warn('[alineacionIA] fallback no disponible', err.response?.status || err.message);
    return { confirmada: false, razon: 'IA_ERROR' };
  }
}

module.exports = {
  corroborar,
  consultar,
  habilitada,
  normalizarRespuesta,
  quadValido,
  OUTPUT_SCHEMA,
  IOU_CONFIRMACION,
  CONFIANZA_MINIMA,
  evaluarCorroboracion,
};
