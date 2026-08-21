function esTokenInvalido(error) {
  const data = error?.response?.data;
  const codigo = typeof data === 'string' ? data : data?.error;
  const descripcion = typeof data === 'object' ? data?.error_description : '';
  const mensaje = `${error?.message || ''} ${codigo || ''} ${descripcion || ''}`;
  return /invalid_grant|expired or revoked/i.test(mensaje);
}

module.exports = { esTokenInvalido };
