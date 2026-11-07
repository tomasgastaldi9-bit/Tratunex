# Guion del pitch con la presentación animada

Para practicar. Cada **toque** es apretar **→** (o el clicker): la presentación reproduce la escena y frena.
Mientras está frenada, hablás tranquilo: la pantalla espera. Total: **unos 2:45**, deja margen para 3:00.

Presentación: `/pitch/index.html` en el deploy (o doble clic en `Presentar.cmd` en la compu de Bautista).
El primer toque pone pantalla completa. **←** vuelve una escena atrás si apretaste de más.

Quién habla sigue el reparto de [`PITCH.md`](PITCH.md); cámbienlo si quieren.

---

### Antes de empezar

Pantalla negra. Respirá, mirá al jurado y apretá **→** cuando arranques a hablar.

### 1 · El problema (Bautista, ~20 s)

**Se ve:** frases que golpean y se tachan: "Buscar proveedores. Llamar uno por uno. Comparar en planillas. Pagar a mano." Termina en **"Ahora lo hace un agente."**

> "Pensemos en una cafetería de Palermo que necesita 10 kilos de café en grano para el lunes. ¿Qué hace hoy el dueño? Busca proveedores en Google, llama uno por uno, anota precios en una planilla y paga por transferencia. Todo a mano, todas las semanas.
> Nosotros pensamos: eso lo puede hacer un agente."

### 2 · Qué es Tratunex (Bautista, ~12 s)

**Se ve:** el logo y "El agente de compras de tu pyme. Busca · Cotiza · Compara · Paga".

> "Tratunex es el área de compras de una pyme, en un agente: busca proveedores, los llama, elige el mejor según tus reglas y le paga en pesos digitales."

### 3 · Paso 1: necesidad y reglas (Bautista, ~20 s)

**Se ve:** "Nueva compra": 10 kg de café en grano tostado, el lunes, $320.000. Reglas: paga solo hasta $300.000; si se pasa, pide aprobación.

> "El dueño escribe qué necesita: 10 kilos de café en grano, para el lunes, hasta 320 mil pesos. Y pone sus reglas: hasta 300 mil, el agente paga solo; si se pasa, le pide aprobación.
> Las reglas se aplican en el servidor, antes de firmar cualquier pago."

### 4 · Paso 2: busca proveedores (Tomás, ~12 s)

**Se ve:** búsqueda "café en grano tostado" y tres proveedores, cada uno con su fuente.

> "El agente busca proveedores en la web y guarda de dónde sacó cada uno, para que el dueño pueda revisar."

### 5 · Paso 3: los llama (Bautista, ~25 s)

**Se ve:** llamada con onda de voz, el diálogo y "Cotización guardada: $28.500 el kilo · lunes · cobra en ARGt".

> "Y los llama. Con Vapi y Twilio el agente hace una llamada telefónica de verdad: se presenta como asistente virtual, avisa que graba y hace tres preguntas: si llega para el lunes, el precio por kilo con IVA y si puede cobrar en ARGt. No compromete la compra.
> Al cortar, la cotización queda cargada sola. En la demo hacemos una llamada real a un compañero que hace de proveedor."

### 6 · Paso 4: compara y explica (Vale y Nano, ~20 s)

**Se ve:** ranking de tres cotizaciones (A $285.000, B $260.000, C $310.000); "Proveedor A" elegida y el "por qué".

> "Con las cotizaciones, el agente compara y explica en palabras por qué elige.
> Fíjense que no elige el más barato: B era más barato, pero llegaba el miércoles, y C no cobra en ARGt. Elige según tus reglas, no solo por precio."

### 7 · Paso 5: paga (Tomás, ~18 s)

**Se ve:** 285.000 ARGt, "Bajo $300.000: paga solo", equivalente en USDT según Belo, red Arbitrum One y el hash.

> "Como está por debajo del límite, paga solo, en ARGt, el peso digital de Twin, en Arbitrum One.
> Y con el precio público de Belo le mostramos al dueño cuánto es en dólares."

### 8 · Pago confirmado (Tomás, ~12 s)

**Se ve:** pantalla negra, tilde verde, **"Pago confirmado."** y el hash.

> "Cada pago deja un hash que cualquiera puede verificar en el explorador. Y un doble clic no paga dos veces."

Si el pago real ya está andando, mostrá el hash real en la demo. Si no, decí: "esta parte la mostramos como concepto".

### 9 · Lo que viene (Bautista, ~20 s)

**Se ve:** cuatro puntos que entran uno por uno.

> "Lo que viene: que el proveedor cobre en Belo y pase a pesos a su cuenta; que el mismo agente haga el seguimiento, confirme entrega y factura y avise atrasos; verificar a cada proveedor; y compras que se repiten solas."

### 10 · Cierre (Bautista, ~6 s)

**Se ve:** el logo en negro y "Comprás mejor. Pagás con reglas."

> "Tratunex: comprás mejor y pagás con reglas. Gracias."

---

## Una frase de honestidad (decila una vez)

Las pantallas de la presentación son ilustraciones y dicen "Datos de prueba". Decilo al principio de la demo:

> "Lo que ven de fondo es ilustrativo; ahora les mostramos la app funcionando."

Qué es real y qué es de ejemplo: tabla en [`PITCH.md`](PITCH.md#qué-es-real-y-qué-es-de-ejemplo).

## Preguntas probables, con respuesta corta

- **¿Cómo sé que el agente no gasta de más?** "Las reglas se aplican en el servidor antes de firmar. Si se pasa del límite, te pide aprobación."
- **¿Por qué ARGt?** "Es un peso digital de Twin: 1 ARGt vale más o menos 1 peso, y cada pago queda verificable en la blockchain."
- **¿Qué tiene que ver Belo?** "Usamos su precio público para mostrar el equivalente en USDT. Lo que viene es que el proveedor cobre en Belo y pase a pesos."
- **¿Y la seguridad de la billetera?** "La clave del agente vive solo en el servidor y el agente nunca cambia la billetera del proveedor."

## Para practicar

1. Leé cada bloque en voz alta con un cronómetro. Si un bloque pasa de lo indicado, cortá frases, no velocidad.
2. Practicá apretando → justo cuando empezás cada bloque: la animación acompaña tu primera frase.
3. Una pasada completa con la presentación, de pie, como si fuera la real.
