# Preparación de CRM · TRA-53

Los contratos (`src/contracts/crm.ts`) y los datos ficticios de
`../mocks/fixtures.json` se mantienen como base del CRM. La fuente JSON es
canónica; `fixtures.js` es un bridge generado que la verificación compara.

La dirección visual anterior quedó retirada a pedido de Nano. La app utiliza
los componentes publicados por Vale y `docs/DESIGN.md`. El recorrido vigente se
abre con Next.js en `/pipeline`, `/contacts`, `/contacts/[id]` y `/tasks`.

Ver `../README.md` para ejecutar la app y `../server/README.md` para consumir las
siete operaciones públicas mock, con `Ctx`, `ActionCtx` y `Result<T>` de Plataforma.
Los campos de DTO propuestos siguen pendientes de revisión de sus consumidores.

## Datos ficticios

Dos empresas, siete etapas, cinco estados de tarea, oportunidades múltiples,
no contactar, buzón, fallos y resultados desconocidos. El reloj fijo es
`2026-11-07T15:00:00Z`; la interfaz muestra horarios de Argentina.
Los teléfonos usan el rango ficticio 202-555-0100 a 202-555-0199 y los sitios
usan dominios `.example`. No son resultados de búsquedas ni llamadas externas.

## Verificación

```powershell
node src/features/crm/preparation/verify.mjs
```

Valida schemas, relaciones, separación de empresas en los ejemplos, fechas,
casos ambiguos, identidad fuera de los payloads y coincidencia del bridge JSON.
Las pruebas actuales del recorrido Next y sus capturas están en `../verification`.
La persistencia, las transacciones y RLS requieren su propia implementación y
pruebas de base de datos; los fixtures no demuestran esas garantías.