# Tratunex

Agente de compras para pymes: busca proveedores, les pide cotización (incluso llamándolos), elige el mejor según las reglas del dueño, explica por qué y le paga en pesos digitales (**ARGt de Twin**) dentro de límites de gasto.

## Alcance del MVP (HackaTwin, 7/11)

El dueño carga qué necesita y sus reglas; el agente busca proveedores (Firecrawl), pide cotizaciones (llamadas con Vapi + Twilio), compara y recomienda con IA, y paga en ARGt con una transacción verificable. La cotización ARS/USDT viene de la API pública de Belo. Detalle en [`docs/BRIEF.md`](docs/BRIEF.md).

## Pagos onchain (track de Twin)

| Dato | Valor |
|---|---|
| Token | ARGt (Twin Stablecoin, ERC-20, 18 decimales) |
| Red | _a completar (PAY-01)_ |
| Contrato del token | _a completar (PAY-01)_ |
| Billetera del agente (pública) | _a completar (PAY-01)_ |
| Transacción de la demo | _hash y link al explorer (PAY-03)_ |

## Equipo

| Integrante | Responsabilidad |
|---|---|
| Tomás | Pagos en Twin, prospección de proveedores, plataforma y deploy |
| Vale | Necesidad de compra, reglas del dueño y elección con IA |
| Bautista | Cotización por llamada (voz) y precio de Belo |
| Nano | Proveedores, comparador de cotizaciones y órdenes de compra |

## Documentación del proyecto

- [Brief del MVP: alcance, contratos, ownership y tareas](docs/BRIEF.md)
- [Guía para contribuir](CONTRIBUTING.md)
- [Flujo de desarrollo y coordinación](docs/DEVELOPMENT_WORKFLOW.md)

El brief es la fuente de verdad para stack, contratos, seguridad, responsabilidades e integraciones de la demo.
