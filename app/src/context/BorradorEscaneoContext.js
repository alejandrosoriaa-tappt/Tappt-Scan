import React, { createContext, useContext, useMemo, useState } from 'react';

const Contexto = createContext(null);

function idPagina() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function BorradorEscaneoProvider({ children }) {
  const [paginas, setPaginas] = useState([]);

  const valor = useMemo(() => ({
    paginas,
    iniciar: () => setPaginas([]),
    agregarPagina: (pagina) => {
      const id = idPagina();
      setPaginas((actuales) => [...actuales, { ...pagina, id }]);
      return id;
    },
    actualizarPagina: (id, cambios) =>
      setPaginas((actuales) => actuales.map((pagina) =>
        pagina.id === id ? { ...pagina, ...cambios } : pagina
      )),
    eliminarPagina: (id) =>
      setPaginas((actuales) => actuales.filter((pagina) => pagina.id !== id)),
    moverPagina: (id, desplazamiento) =>
      setPaginas((actuales) => {
        const origen = actuales.findIndex((pagina) => pagina.id === id);
        const destino = Math.max(0, Math.min(actuales.length - 1, origen + desplazamiento));
        if (origen < 0 || origen === destino) return actuales;
        const copia = [...actuales];
        const [pagina] = copia.splice(origen, 1);
        copia.splice(destino, 0, pagina);
        return copia;
      }),
  }), [paginas]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useBorradorEscaneo() {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('BorradorEscaneoProvider faltante');
  return contexto;
}
