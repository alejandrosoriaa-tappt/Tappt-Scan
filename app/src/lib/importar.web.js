import { api } from './api';

/**
 * Versión web de la importación.
 *
 * En móvil se lee el archivo con `expo-file-system`, que no existe en el
 * navegador. Aquí se usa un `<input type="file">` y `FileReader`, que es
 * justo lo que hace natural el caso de "escanear desde la Mac o la PC":
 * arrastras el PDF que te llegó por correo y ya.
 */
function elegirArchivo(accept) {
  return new Promise((resolver) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';

    input.addEventListener('change', () => {
      resolver(input.files?.[0] || null);
      input.remove();
    });

    // Si el usuario cierra el diálogo sin elegir, `change` nunca dispara.
    // `cancel` lo cubre en los navegadores que lo soportan; donde no, la
    // promesa simplemente no resuelve y no pasa nada.
    input.addEventListener('cancel', () => {
      resolver(null);
      input.remove();
    });

    document.body.appendChild(input);
    input.click();
  });
}

function aBase64(archivo) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onerror = () => rechazar(new Error('no_se_pudo_leer'));
    lector.onload = () => {
      // readAsDataURL devuelve "data:<mime>;base64,<datos>": el backend
      // acepta ambas formas, pero mandamos solo los datos.
      const resultado = String(lector.result);
      resolver(resultado.slice(resultado.indexOf(',') + 1));
    };
    lector.readAsDataURL(archivo);
  });
}

async function subir(archivo) {
  if (!archivo) return null;
  const base64 = await aBase64(archivo);
  return api.importar(base64, archivo.type || 'application/pdf', archivo.name);
}

export async function importarArchivo() {
  return subir(await elegirArchivo('application/pdf,image/*'));
}

export async function importarDeGaleria() {
  return subir(await elegirArchivo('image/*'));
}
