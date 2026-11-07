# PLAT-06: avance mientras se implementa CRM-03

Objetivo: preparar la importación de prospectos y CSV sin crear contactos simulados en el CRM real.

- Validar CSV en el navegador con límites de tamaño y cantidad, campos obligatorios, comillas y teléfonos internacionales; mostrar errores por registro.
- Mapear resultados reales de Firecrawl al contrato de CRM y rechazar datos mock o sin teléfono E.164. Al integrar, el modo debe provenir de la búsqueda guardada y validada en servidor, nunca del navegador ni del modo actual.
- Probar la deduplicación y la conservación de `do_not_contact` con el simulador de CRM-02, indicando que su estado es temporal.
- Pendiente de CRM-03: conectar `upsertContact` persistente, conservar un `action_id` de lote y por contacto en reintentos, rechazar reutilización con otros datos y verificar atomicidad, aislamiento y resultados parciales en base real antes de habilitar importación.

## Implementación posterior a CRM-03

El CSV se vuelve a validar en servidor y los candidatos se leen de la búsqueda persistida de la empresa; solo se importan búsquedas `live`. Un recibo liga la acción del lote a su contenido y cada contacto utiliza una acción estable; el CRM confirma cada contacto por separado y el resultado informa errores parciales. En un reintento se conserva la misma acción. No se guarda el archivo CSV.
