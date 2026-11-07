# CRM · Diseño v1

Preparación de Nano para TRA-53. Abrí [`index.html`](index.html) directamente en
el navegador. El recorrido funciona por `file://` con los assets incluidos.

El CRM consume los colores, tipografía Inter y componentes de
[`src/components/ui`](../../../components/ui/README.md). La
[galería visual](../../../components/ui/index.html) muestra botones, formularios,
tablas y estados, junto con patrones para Agente, Prospección y Llamadas.
Cada responsable puede tomar esos estilos para construir su módulo.

## Recorrido

1. Elegí una empresa ficticia en la navegación.
2. Recorré las siete etapas del pipeline, alterná entre Tablero y Lista, buscá
   por contacto, empresa u oportunidad y abrí su detalle.
3. En el contacto, revisá los datos, resumen, clasificación, historial y próxima
   acción. El selector permite comparar los distintos casos de ejemplo.
4. Abrí Tareas y probá los filtros de acciones abiertas, todas, callbacks o
   revisiones humanas. Cada contacto vuelve a su detalle.
5. Cambiá entre `Con datos`, `Cargando`, `Sin datos` y `Error` para revisar los
   estados de cada pantalla. `Volver a intentar` restablece los datos ficticios.
6. Cambiá de empresa y comprobá que las tarjetas, los contactos, las tareas y el
   historial corresponden al contexto seleccionado.

Capturas de referencia: [pipeline](previews/desktop.png),
[contacto](previews/contact.png), [tareas](previews/tasks.png) y
[contacto en móvil](previews/mobile.png).

La fecha de referencia y todos los datos vienen de `../mocks/fixtures.js`, puente
generado a partir de `../mocks/fixtures.json`. Las fechas se muestran en
`America/Argentina/Buenos_Aires`; no dependen del día de apertura del boceto.

## Límites e integración posterior

- Es un boceto navegable de solo lectura. No persiste cambios, no autentica, no
  invoca APIs ni inicia llamadas. El botón Llamar está deshabilitado.
- La separación visual por empresa no prueba aislamiento de datos ni RLS.
- No define contratos de voz ni sustituye el webhook o el cron.
- Al llegar el bootstrap, el recorrido se implementará en `/pipeline`,
  `/contacts/[id]` y `/tasks`, consumiendo los servicios públicos del módulo CRM.
- Los siete códigos de etapa son los de `docs/BRIEF.md`; `won` se reserva a un
  cierre manual. El boceto no permite mover tarjetas ni ejecutar tareas.
- Una tarea ligada a una oportunidad se muestra solo en esa tarjeta. Las tareas
  sin oportunidad se consultan en el contacto y en Tareas.
- Si el intento más reciente tiene estado `unknown`, se conserva un aviso para
  reconciliarlo antes de llamar otra vez, aunque haya resultados anteriores.
- La interfaz v1 usa la misma base visual que la galería del equipo.
  El selector de empresa aquí es ficticio; el selector real lo integra Tomás.

## Comprobación sin herramientas externas

```powershell
node --check src/features/crm/prototype/prototype.js
```

Después abrí `index.html` y recorré los pasos anteriores en escritorio y móvil.

## Verificación automatizada del boceto

`verify-browser.cjs` recorre el CRM en Chrome headless, comprueba Tablero y Lista,
los filtros por empresa, las fechas desconocidas y la carga de Inter. También
verifica los enlaces a la galería y su uso de los mismos tokens. Los layouts se
revisan en anchos de 1440, 1024, 768, 390 y 320 píxeles.
La ejecución del rediseño aprobó las 67 comprobaciones y terminó con cero
errores de JavaScript. Las cuatro capturas de referencia reflejan ese recorrido.

Con Playwright disponible y Chrome instalado, ejecutá:

```powershell
node src/features/crm/prototype/verify-browser.cjs
```

Antes del bootstrap, para reproducirlo sin modificar dependencias del repo:

```powershell
$crmValidationRoot = Join-Path $env:TEMP 'tratunex-crm-preparacion-tra53'
New-Item -ItemType Directory -Path $crmValidationRoot -Force | Out-Null
npm install --prefix $crmValidationRoot --no-package-lock --no-audit --no-fund --ignore-scripts playwright@1.56.1
Copy-Item -LiteralPath src -Destination $crmValidationRoot -Recurse -Force
node (Join-Path $crmValidationRoot 'src/features/crm/prototype/verify-browser.cjs')
```

El script recorre el HTML local y genera las cuatro capturas en `previews/` de
la copia que ejecuta. Esto comprueba el boceto; no es un E2E de la futura app.
