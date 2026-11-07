# Objetivos y alcances del sistema y pitch de dos minutos

Este archivo explica qué problema resuelve el proyecto, quién lo usa, qué incluye la entrega y cómo se demuestra. Se lee antes de entrar en los contratos técnicos del [brief general](00_GENERAL.md). El proyecto se presenta como Tratunex. Twin se menciona más adelante como posible infraestructura de liquidación y no como nombre del proyecto.

## 1. El sistema explicado de forma simple

Es un asistente comercial y operativo para distribuidoras B2B. El dueño carga información del negocio y el sistema conecta búsqueda de clientes, llamadas con IA, registro comercial, seguimientos, pedidos, cobros y compras a proveedores.

Su resultado es una operación trazable: podemos saber de dónde salió un contacto, qué se conversó, qué acción se acordó, qué pedido se confirmó, si se pagó y qué queda pendiente.

El mismo motor de conversación trabaja con dos objetivos: vender a clientes y gestionar reposición con proveedores. Los datos y reglas del negocio determinan qué puede hacer en cada caso.

## 2. Problema, público y actores

La hipótesis de problema es que algunas distribuidoras reparten contactos, conversaciones, pedidos y comprobaciones de pago entre herramientas y gestiones manuales. Eso puede dificultar el seguimiento y aumentar el trabajo operativo. La frecuencia del problema, el ahorro y la disposición a pagar se validarán con negocios reales; no son resultados ya medidos.

Nicho inicial: distribuidoras pequeñas de insumos recurrentes para cafeterías, restaurantes y comercios. Para el tramo de pagos onchain, priorizar pilotos con contrapartes que ya acepten stablecoins o tengan una necesidad concreta de liquidación digital.

| Actor | Su relación con el sistema |
|---|---|
| Dueño o responsable comercial | Compra el software, configura negocio y reglas, inicia campañas y consulta resultados. |
| Vendedor o encargado | Revisa contactos, oportunidades, tareas y situaciones que necesitan una persona. |
| Posible cliente de la distribuidora | Recibe la llamada, expresa una necesidad, acepta o rechaza una propuesta y puede pagar un pedido. |
| Proveedor de la distribuidora | Responde consultas de disponibilidad/precio y recibe pedidos y pagos permitidos. |
| Agente de IA | Conversa y solicita herramientas; sus acciones se validan en el backend. |
| Servicios externos | Aportan búsqueda, telefonía, autenticación y red de pagos según las integraciones definidas. |

El comprador de nuestro software es la distribuidora. Las cafeterías encontradas por el buscador son potenciales clientes de esa distribuidora; encontrar una cafetería no significa que hayamos conseguido un cliente pagador del software.

## 3. Objetivo general

Construir un recorrido comercial y operativo conectado, desde la búsqueda de un contacto hasta el pedido, el cobro, el seguimiento y la reposición, con persistencia, trazabilidad y acciones sujetas a las reglas del negocio.

## 4. Objetivos específicos y resultado esperado

| Objetivo | Resultado observable |
|---|---|
| Configurar el negocio | Catálogo, precios, condiciones e instrucciones disponibles para consultas del agente. |
| Encontrar oportunidades | Candidatos con datos de contacto cuando existan, fuente y señales de encaje. |
| Contactar mediante voz | Llamada que consulta datos vigentes y deja un resultado técnico y comercial. |
| Organizar el trabajo comercial | Contactos y oportunidades con historial y etapas claras. |
| Ejecutar seguimientos | Próximas acciones guardadas; callbacks vencidos despachados sin depender de una pestaña abierta. |
| Formalizar operaciones | Cotización/pedido con productos, cantidades y total calculado por el backend. |
| Vincular pedido y cobro | Solicitud de pago asociada y confirmación después de comprobar la transferencia. |
| Gestionar reposición | Contacto con proveedor, propuesta de compra y pago sólo si cumple política y presupuesto. |
| Evitar efectos duplicados | Reintentar un mensaje no vuelve a crear el pedido, la tarea o el pago. |
| Hacer comprensible lo ocurrido | El dueño puede consultar resultado, motivo de rechazo y próxima acción. |

Estos objetivos describen funciones a implementar y verificar. No garantizan ventas, interés de cada contacto ni una reducción de costes todavía no medida.

## 5. Alcance funcional de esta entrega

| Módulo y responsable | Entrada y acción | Salida y límite principal |
|---|---|---|
| Negocio y catálogo — Vale | Cargar perfil, productos, precios y condiciones. | Contexto comercial consultable. No modifica parámetros de entrenamiento de un modelo. |
| Prospección — Vale | Buscar negocios por rubro/zona y revisar evidencia. | Candidatos importables al CRM; no inventa teléfonos ni interés comercial. |
| Voz y campañas — Bauti | Seleccionar contacto(s), objetivo y modo sale/purchase. | Llamadas, resultados y herramientas registradas; respeta pausa, concurrencia e intentos. |
| CRM — Nano | Recibir contactos y resultados, consultar y actualizar oportunidades. | Historial persistente y pipeline; distingue fallo técnico, rechazo e interés. |
| Seguimiento — Nano y Bauti | Guardar tarea con fecha y reclamarla mediante scheduler. | Acción ejecutada o pendiente de conciliación/revisión; evita dobles llamadas por reenvío. |
| Pedidos — Tomi | Preparar cotización y confirmar cantidades/condiciones. | Pedido draft/confirmed/cancelled, separado del estado de pago. |
| Cobros — Tomi | Crear enlace y verificar transferencia informada. | Pago de prueba confirmado sólo con evidencia válida de cadena. |
| Proveedores — los cuatro módulos | Configurar proveedor, conversar, acordar compra y evaluar reglas. | Pedido de compra y pago de prueba permitido o rechazo visible por política. |
| Historial integrado — Nano | Vincular referencias de todos los módulos. | Recorrido contacto → llamada → pedido → pago → próxima acción. |

La campaña usa contactos seleccionados y límites configurados. El sistema conserva candidatos incompletos, pero necesita un teléfono utilizable antes de iniciar telefonía. Los callbacks automáticos son un tipo de tarea; una tarea manual no se convierte sola en llamada.

La compra a proveedor usa el mismo motor de voz con otras instrucciones. El modelo no puede cambiar libremente el precio, la wallet destinataria ni el presupuesto. En el negocio de demo, el máximo por compra es 25 USDC de prueba y el presupuesto diario 100 USDC, con un proveedor permitido. Son reglas del ensayo, no precios del software ni fondos reales.

## 6. Ejemplos completos y estados

**Venta:** Sur Insumos carga Vasos a 2,50 USDC por pack. El buscador encuentra una cafetería y se revisa su fuente. Para el ensayo se usa un contacto controlado por el equipo. El agente conversa, consulta el catálogo y el cliente pide dos packs. El backend calcula 5 USDC y se confirma el pedido. Se genera un enlace; el cliente firma una transferencia de prueba. El backend verifica red, token, importe, receptor y confirmaciones antes de marcar el pago confirmado. El historial vincula todo.

**Recontacto:** el contacto pide hablar en una fecha concreta. Se guarda una tarea con hora y zona. Cuando vence, el scheduler la reclama y Bauti inicia el intento. La tarea se completa cuando el proveedor de voz acepta la llamada y se guarda su ID. Eso demuestra que la gestión se inició, no que el cliente haya contestado o comprado. Un resultado ambiguo se reconcilia antes de otro intento.

**Compra:** el dueño solicita reponer diez packs. El agente contacta al proveedor configurado y registra precio/disponibilidad. Tomi prepara el pedido y valida proveedor, destinatario, máximo por compra y presupuesto disponible. Si cumple, reserva presupuesto y ejecuta el pago con la wallet de prueba del negocio. Si no cumple, conserva el pedido y muestra el motivo de revisión.

Las diferencias que todo el equipo debe poder explicar:

- Encontrar un contacto no confirma interés.
- Finalizar una llamada no demuestra que contestó una persona.
- Mostrar interés no confirma un pedido.
- Confirmar un pedido no confirma su pago.
- Una promesa verbal o un hash informado no prueba el cobro.
- Pagar a un proveedor no demuestra entrega física ni aumenta stock automáticamente.

## 7. Límites de la entrega y evoluciones posteriores

La aplicación y la demo usan un negocio de ejemplo, un proveedor de búsqueda, un servicio de voz y una red de pago. El alcance conserva todos los módulos, con esas integraciones iniciales.

Quedan fuera de esta entrega:

- Operar dinero real o presentar testnet como una solución comercial ya desplegada.
- Conversión ARS/USDC, entrada o retiro a pesos e integración efectiva con Twin, ARGt, Belo o Tether.
- Entrenar un modelo propio, construir infraestructura de audio o una blockchain propia.
- Crédito, inversiones, rendimiento financiero o emisión de un token nuevo.
- Facturación fiscal, contabilidad completa, logística y confirmación de entrega física.
- Un ERP de inventario con reservas y recepciones completas. Se consulta stock comercial cuando existe; el movimiento físico requiere otro proceso.
- WhatsApp/SMS/correo automatizados sin integrar su proveedor. El enlace de cobro puede mostrarse y copiarse.
- Prometer disponibilidad permanente, latencia fija, ahorro porcentual o ventas incrementales sin medirlos.

Estas funciones pueden evaluarse después. Su ausencia no se oculta detrás de una pantalla de demostración.

## 8. Criterios para entender cuándo funciona

1. Recargar la aplicación conserva contactos, pedidos, historial y tareas.
2. El agente consulta datos del negocio y ejecuta una herramienta con resultado real.
3. Una búsqueda incompleta o una llamada fallida muestra su estado y permite una próxima acción coherente.
4. La misma llamada/evento no duplica historial, tareas ni pedidos al reenviarse.
5. Un callback se puede despachar con navegador cerrado y sin dos workers ejecutándolo a la vez.
6. Un pago válido se asocia a su pedido; uno incorrecto o reutilizado se rechaza.
7. Una compra fuera del presupuesto o a un proveedor no permitido no envía fondos.
8. La UI distingue pedido, pago, próximo paso y modo mock/live/testnet.
9. Cada usuario ve sólo los datos del negocio al que pertenece; secretos de servicios y wallets quedan en servidor.
10. Lo mostrado como implementación real se puede reproducir. Una grabación o un adaptador mock se identifica.

Para seguir las responsabilidades: [Vale](01_VALE.md), [Bauti](02_BAUTI.md), [Tomi](03_TOMI.md), [Nano](04_NANO.md). El stack y los contratos continúan en el [general](00_GENERAL.md).

## 9. Pitch con límite total de dos minutos

Un presentador habla y otra persona maneja la pantalla. El texto tiene **159 palabras**. Estimación conservadora a 110 palabras por minuto: **87 segundos de voz**; con una evidencia visual de hasta 10 segundos, **97 segundos**, dejando margen hasta los 120. Es una estimación de lectura, no una medición de su voz: ensayar con cronómetro y respetar las pausas.

El guion describe el producto y la demo objetivo. Presentar como comprobadas únicamente las funciones que el equipo verificó. El nombre comercial elegido es Tratunex; el texto se puede leer completo sin un placeholder de marca.

### Texto para decir

Una distribuidora necesita conseguir clientes, llamarlos, tomar pedidos, cobrar y reponer mercadería. Cuando esas tareas quedan desconectadas, es difícil saber qué pasó y qué hacer después.

Estamos desarrollando un asistente comercial con inteligencia artificial que conecta ese recorrido.

El dueño carga su catálogo, precios y reglas. El sistema busca posibles clientes, conserva la fuente del contacto y permite iniciar llamadas. El agente consulta el catálogo y registra un pedido o un seguimiento.

El pedido se vincula con una solicitud de cobro. La demo usa USDC de prueba en Avalanche Fuji: el pago se confirma después de verificar la transacción.

El mismo motor permite contactar proveedores y preparar reposiciones. La IA solicita acciones; el backend valida precios, cantidades, destinatarios y presupuesto antes de ejecutarlas.

El dueño ve el historial de cada operación y su próxima acción.

Proponemos validar una suscripción por negocio más consumo. El siguiente paso es probarlo con distribuidores reales y medir tiempo, errores y coste por gestión.

### Pantalla y tiempos de presentación

| Tiempo máximo | Presentación |
|---|---|
| 00:00–00:15 | Problema del distribuidor y las tareas desconectadas. |
| 00:15–00:30 | Solución y catálogo de Sur Insumos. |
| 00:30–00:55 | Contacto, evidencia breve de conversación y pedido. El fragmento de audio/video, si se usa, ocupa como máximo 10 segundos y reemplaza una explicación larga. |
| 00:55–01:20 | Pedido, solicitud de cobro y evidencia de transferencia verificada. |
| 01:20–01:40 | Compra a proveedor y límite de gasto en pantalla. |
| 01:40–01:50 | Historial, modelo comercial a validar y próximo piloto. |
| 01:50–02:00 | Margen para pausas o transición; la presentación debe haber terminado. |

No esperar una llamada completa, un callback programado ni confirmaciones de red durante esos dos minutos. Se puede mostrar una ejecución previa verificada, identificada como tal, y su historial. Mantener arquitectura, stack, pruebas negativas y detalle de seguimiento como material de apoyo para preguntas si las hay. Todos los módulos siguen en el alcance aunque no se recorran completos en vivo.

## 10. Glosario del equipo

| Término | Significado en este sistema |
|---|---|
| Prospecto o lead | Posible cliente, todavía sin interés confirmado. |
| CRM | Registro organizado de contactos, conversaciones y gestiones. |
| Oportunidad y pipeline | Venta concreta y etapas por las que avanza; un contacto puede tener varias oportunidades. |
| Agente y herramienta | Modelo con contexto e instrucciones que solicita funciones validadas por el backend. |
| Seguimiento | Próxima acción guardada, con fecha y estado. |
| Conciliación | Comprobar que el movimiento de pago corresponde al pedido y actualizar su estado. |
| Idempotencia | Repetir una petición no repite sus efectos. |
| Stablecoin y testnet | Activo de liquidación con una referencia de valor; en esta demo se usa su versión de prueba, sin valor financiero. |
| Hash de transacción | Referencia para localizar una transacción; el backend todavía debe verificar sus datos y resultado. |

