# UI compartida

La dirección visual vigente es la publicada por Vale en `feat/TRA-53-ui-base`.
La guía completa está en `docs/DESIGN.md` y el catálogo funcionando en `/ui`.

El CRM consume sus componentes mediante imports directos desde esta carpeta.
El layout, los tokens, la tipografía Kantumruy Pro y el menú compartido se
conservan como los publicó Vale. Las pantallas de cada módulo se adaptan dentro
de su propia carpeta, sin crear otra biblioteca ni modificar estos componentes.

La propuesta visual anterior de Nano quedó retirada de esta entrega. Sus
contratos y fixtures CRM continúan vigentes para la integración mock.