// Datos de prueba para el esqueleto navegable. Se reemplazan por llamadas
// reales a Supabase / al backend cuando se conecte el onboarding.

export const usuario = {
  nombre: 'Alejandro',
  email: 'asoria@tappt.lat',
  whatsapp: '+52 442 123 4567',
  driveConectado: true,
  plan: 'gratis',
  escaneosUsados: 3,
  escaneosLimite: 5,
};

export const documentos = [
  {
    id: '1',
    tipo: 'recibo',
    emisor: 'CFE',
    fecha: '2026-08-07',
    monto: 842.5,
    moneda: 'MXN',
    nombreArchivo: '2026-08-07_recibo_CFE.jpg',
    driveLink: 'https://drive.google.com/file/d/mock1',
  },
  {
    id: '2',
    tipo: 'recibo',
    emisor: 'Costco',
    fecha: '2026-08-05',
    monto: 1497.3,
    moneda: 'MXN',
    nombreArchivo: '2026-08-05_recibo_Costco.jpg',
    driveLink: 'https://drive.google.com/file/d/mock2',
  },
  {
    id: '3',
    tipo: 'identificacion',
    emisor: 'INE',
    fecha: '2026-07-28',
    monto: null,
    moneda: null,
    nombreArchivo: '2026-07-28_identificacion_INE.jpg',
    driveLink: 'https://drive.google.com/file/d/mock3',
  },
  {
    id: '4',
    tipo: 'contrato',
    emisor: 'Arrendamiento Zibatá',
    fecha: '2026-07-15',
    monto: 18000,
    moneda: 'MXN',
    nombreArchivo: '2026-07-15_contrato_Arrendamiento.jpg',
    driveLink: 'https://drive.google.com/file/d/mock4',
  },
];

export const carpetas = [
  { id: 'c1', nombre: 'Identificaciones', cantidad: 1 },
  { id: 'c2', nombre: 'Recibos', cantidad: 2 },
  { id: 'c3', nombre: 'Contratos', cantidad: 1 },
  { id: 'c4', nombre: 'Otros', cantidad: 0 },
];

export function gastoDelMes() {
  const mesActual = '2026-08';
  return documentos
    .filter((d) => d.tipo === 'recibo' && d.fecha.startsWith(mesActual))
    .reduce((total, d) => total + (d.monto || 0), 0);
}
