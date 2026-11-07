# Pitch de Tratunex (DEMO-01)

Guion de 3 minutos, video de respaldo y entregas. Entregas: **Belo 17:30**, **Twin 18:00** (hora de Argentina). Recorrido de la demo en [`BRIEF.md`](BRIEF.md), sección 4.

## Frase de apertura

> "Tratunex es el área de compras de una pyme, en un agente: busca proveedores, los llama, elige el mejor según tus reglas y le paga en pesos digitales."

## Guion (3 minutos)

| Tiempo | Quién | Qué se dice | Qué se ve |
|---|---|---|---|
| 0:00–0:30 | Bautista | **El problema.** Una cafetería necesita 500 vasos para el lunes. Hoy el dueño busca proveedores en Google, llama uno por uno, anota precios en un papel, compara con y sin IVA, y después paga por transferencia. Son horas, todas las semanas. | Pantalla de inicio |
| 0:30–0:50 | Bautista | **La solución.** El dueño escribe qué necesita y sus reglas: "máximo $X; hasta $Y pagá solo, más que eso pedime aprobación". El agente hace el resto y explica cada decisión. | Compra nueva y reglas del dueño |
| 0:50–1:10 | Tomás | **Busca proveedores** en la web, con la fuente de cada uno. | Lista de proveedores |
| 1:10–1:45 | Bautista | **Los llama.** El cotizador se presenta como asistente virtual, avisa que graba y pide precio, stock, plazo y si cobra en ARGt. No compromete la compra. Al cortar, la cotización queda cargada sola. | 15 s del audio de la llamada real y la cotización en `/calls/quotes/import` |
| 1:45–2:10 | Vale y Nano | **Compara y elige.** El comparador pone las cotizaciones lado a lado y la IA explica por qué recomienda una: precio final con IVA, llega a tiempo, acepta ARGt. Con el precio de Belo se ve cuánto es en USDT. | Comparador, ranking y equivalente según Belo |
| 2:10–2:35 | Tomás | **Paga.** El dueño aprueba y el agente paga en ARGt en Arbitrum One. Acá está el hash, verificable en Arbiscan. Un doble clic no paga dos veces. | Pago y link al explorer |
| 2:35–3:00 | Bautista | **Lo que viene** (ver abajo) y cierre: "Tratunex: tu área de compras, en un agente." | — |

### Lo que viene (solo en el pitch, no construido)

- El proveedor cobra en Belo y pasa a pesos a su CVU (con las APIs de Belo para empresas).
- **Seguimiento de proveedores:** el mismo agente vuelve a llamar para confirmar entrega y factura, avisa atrasos y prevé los próximos pagos.
- Verificación del proveedor (KYB) y compras recurrentes.

## Qué es real y qué es de ejemplo

Decirlo claro en el pitch: el jurado lo valora y el brief lo exige.

| Parte | Estado |
|---|---|
| Llamada al proveedor (Vapi + Twilio) | **Real.** Llamada telefónica a un compañero que hace de proveedor |
| Cotización extraída de la llamada | **Real** |
| Precio USDT/ARS | **Real**, API pública de Belo, con la hora de consulta |
| Pago en ARGt con hash | **Real**, en la red principal, con montos mínimos |
| Las otras dos cotizaciones del comparador | **Datos de prueba**, rotulados en pantalla |
| Cobro del proveedor en Belo, seguimiento, KYB | **Solo en el pitch** |

## Cómo responde a cada track

- **Twin:** el pago al proveedor es una transferencia real de ARGt con hash en el explorer. El README dice token, red y contrato.
- **Belo (consigna 4, "un agente que maneja tu plata"):**
  - Problema real (30 %): compras de una pyme, todas las semanas.
  - Funciona de punta a punta (25 %): de la necesidad al pago con hash.
  - Llevable a producto (25 %): multiempresa, reglas del dueño en el servidor, pagos idempotentes.
  - Uso de IA (20 %): llamada con voz, extracción de la cotización y ranking explicado.
- **Seguridad, en una frase:** la clave del agente vive solo en el servidor, las reglas se aplican antes de firmar y el agente nunca cambia la billetera del proveedor.

## Video de respaldo (2 minutos)

Grabar **antes de las 16:45**, por si falla internet o el teléfono en vivo.

1. Compra nueva con reglas.
2. Proveedores.
3. 15 s del audio de la llamada real y la cotización que aparece.
4. Comparador, ranking con explicación y equivalente en USDT según Belo.
5. Pago aprobado, hash y Arbiscan abierto en la transacción.

Grabación de pantalla con audio. Sin teléfonos, claves ni datos personales en pantalla.

## Checklist de entregas

- [ ] Deploy de `main` funcionando (link).
- [ ] Repo público y README con token, red, contrato y hash de la transacción de la demo (Tomás, PAY-03).
- [ ] Video de respaldo subido (link).
- [ ] Texto corto del proyecto: la frase de apertura y los tres pasos (cotiza llamando, elige con IA, paga en ARGt).
- [ ] **17:30:** entrega del track de Belo.
- [ ] **18:00:** entrega del track de Twin, con el hash.
- [ ] Confirmar con la organización si se puede competir en los dos tracks.
