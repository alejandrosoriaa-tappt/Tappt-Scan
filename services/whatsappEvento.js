function perteneceAlNumero(value, phoneNumberIdEsperado) {
  const recibido = value?.metadata?.phone_number_id;
  if (!phoneNumberIdEsperado || !recibido) return false;
  return String(recibido) === String(phoneNumberIdEsperado);
}

module.exports = { perteneceAlNumero };
