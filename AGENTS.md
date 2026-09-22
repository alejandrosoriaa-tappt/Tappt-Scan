# Instrucciones para agentes

## Privacidad y seguridad del repositorio

- Este repositorio debe permanecer PRIVADO. Si sigue público por una dependencia de producción, resolverla y verificar el cambio mediante la API; esta regla no afirma que ya sea privado.
- Ningún agente de IA debe cambiarlo a público, crear un fork público ni copiar código o documentación a un repositorio público.
- No registrar credenciales, tokens, llaves, contraseñas, datos personales, IDs internos ni valores reales de producción.
- Usar variables de entorno y ejemplos vacíos o ficticios.
- Antes de modificar integraciones, despliegues, permisos o visibilidad, verificar el impacto en producción.
- Los datos de clientes, familias, alumnos, teléfonos, correos, cobranza y mensajes son información confidencial.
- Si se detecta un secreto versionado, detener la operación que lo exponga, reportarlo de forma redactada y solicitar su rotación. Eliminarlo no sustituye rotarlo; no reescribir historial sin autorización explícita.
- Al terminar cada sesión, guardar qué se cambió, qué quedó pendiente y el siguiente paso, sin incluir secretos ni datos personales. Usar nombres genéricos para infraestructura y credenciales.
