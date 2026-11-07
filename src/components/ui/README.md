# Interfaz compartida de Tratunex

Versión visual 1 para implementar el MVP. Nano mantiene los componentes UI y el
layout. Cada responsable aplica esta referencia en las pantallas de su dominio.
La revisión del equipo puede proponer ajustes sobre esta base.

## Uso en Next.js

Los tokens y las clases compartidas ya se importan en `src/app/layout.tsx`.
El shell React está en `app-shell.tsx`; las pantallas CRM lo consumen mediante
`src/features/crm/components/demo-shell.tsx`. El shell incluye sidebar responsive,
navegación, acceso por teclado al contenido y rótulo visible del modo mock.

El selector actual recorre solo dos escenarios ficticios. Al integrar Plataforma,
Tomás debe proporcionar la selección de empresa basada en membresía real. Los
otros módulos pueden aplicar estas mismas clases `.button`, `.badge`, `.panel`
y los tokens sin copiar colores ni modificar el CRM. Su contenido se implementa
dentro de las carpetas de cada responsable.

La galería permite probar formularios, botones, filtros y estados con datos
ficticios. Se abre directamente en el navegador. [Abrir galería](index.html)

## Archivos de referencia

| Archivo | Uso |
|---|---|
| `tokens.css` | Colores, tipografía, espaciado, radios, sombras y dimensiones comunes |
| `components.css` | Botones, campos, badges, paneles, alertas y pestañas |
| `fonts/inter-variable.ttf` | Inter variable disponible localmente |
| `index.html` | Galería y ejemplos por módulo |
| `library.css` y `library.js` | Presentación e interacciones de la galería |

La aplicación de estos estilos al CRM puede recorrerse en el boceto.
[Abrir CRM](../../features/crm/prototype/index.html)

Las capturas muestran la galería completa en escritorio y móvil.
[Escritorio](previews/library.png) · [Móvil](previews/library-mobile.png)

## Identidad visual

La interfaz usa una navegación verde bosque y superficies claras para el área
de trabajo. Las acciones principales repiten el verde de marca. Los bordes
delimitan el contenido y las sombras ayudan a distinguir los paneles. El color
de un estado siempre se acompaña con una etiqueta legible.

| Token | Valor | Aplicación |
|---|---|---|
| `--color-bg` | `#f6f7f4` | Fondo de la aplicación |
| `--color-surface` | `#ffffff` | Formularios, tablas y tarjetas |
| `--color-surface-muted` | `#eef1ec` | Contenedores secundarios y controles deshabilitados |
| `--color-text` | `#172b25` | Títulos y contenido principal |
| `--color-text-muted` | `#62736a` | Metadatos y ayudas |
| `--color-border` | `#dfe5dc` | División de paneles y controles |
| `--color-primary` | `#216e4e` | Acción principal, enlaces y selección |
| `--color-primary-hover` | `#185438` | Acción principal en hover |
| `--color-primary-soft` | `#e7f2ea` | Selección en el área de trabajo |
| `--color-success` / `--color-success-soft` | `#26734d` / `#e8f3ec` | Confirmación y finalización |
| `--color-warning` / `--color-warning-soft` | `#916213` / `#fff5df` | Atención y estado desconocido |
| `--color-danger` / `--color-danger-soft` | `#b03d43` / `#fceeed` | Error y acciones destructivas |
| `--color-info` / `--color-info-soft` | `#3f638e` / `#edf2f8` | Estado en curso e información |
| `--color-sidebar` | `#183c2f` | Fondo de navegación |
| `--color-sidebar-surface` | `#234737` | Selector de empresa y superficies de sidebar |
| `--color-sidebar-text` | `#e7efe8` | Texto principal de navegación |
| `--color-sidebar-muted` | `#b8cabc` | Texto secundario de navegación |
| `--color-sidebar-border` | `#4e6b5c` | Bordes sobre el sidebar |
| `--color-sidebar-active` | `#e1efd7` | Fondo del ítem de navegación activo |
| `--color-sidebar-active-text` | `#1d482e` | Texto del ítem de navegación activo |
| `--color-brand-accent` | `#c6e4a3` | Marca y acentos del sidebar |

El modo de integración se muestra con su propia etiqueta, `Mock`, `Voz web` o
`Teléfono real`. La presentación conserva los estados `unknown`, error y carga
que recibe de los servicios.

## Tipografía y medidas

Se usa Inter variable con fallback a la tipografía del sistema. El archivo
local y su licencia OFL se obtuvieron de Google Fonts.
[Fuente original y licencia](https://github.com/google/fonts/tree/main/ofl/inter)

| Uso | Token | Tamaño | Peso |
|---|---|---|---|
| Título de página | `--text-title` | 30 px | 600 |
| Título secundario grande | `--text-xl` | 24 px | 600 |
| Título de sección | `--text-lg` | 18 px | 600 |
| Texto de contenido | `--text-base` | 14 px | 400 |
| Etiqueta y botón | `--text-sm` | 13 px | 600 |
| Metadatos y estado | `--text-xs` | 12 px | 400 o 600 |

Usar interlineado 1.5 para contenido. Los títulos admiten un interlineado de
1.15 a 1.25. En pantallas menores a 768 px los campos usan 16 px para facilitar
la lectura y la entrada de datos.

La escala de espacios es 4, 8, 12, 16, 20, 24, 32, 40 y 48 px. Los tokens
correspondientes son `--space-1`, `2`, `3`, `4`, `5`, `6`, `8`, `10` y `12`.
Los paneles usan 24 px de padding y los grupos de controles usan entre 12 y
16 px de separación.

| Elemento | Medida |
|---|---|
| Sidebar de escritorio | `--sidebar-width`, 224 px |
| Barra superior | `--topbar-height`, 64 px |
| Botón y control | 40 px de alto mínimo |
| Botón en móvil | 44 px de alto mínimo |
| Radio de estados | `--radius-sm`, 6 px |
| Radio de controles | `--radius-md`, 10 px |
| Radio de paneles | `--radius-lg`, 14 px |
| Radio redondo | `--radius-pill`, 999 px |

## Componentes

### Botones

Usar una acción primaria por formulario o sección operativa. Las acciones de
apoyo usan la variante secundaria. Una acción destructiva muestra un texto
explícito y la variante roja. Un control pendiente mantiene su etiqueta y
expone `disabled` durante el procesamiento.

```html
<button class="button button-primary" type="submit">Guardar cambios</button>
<button class="button button-secondary" type="button">Cancelar</button>
<button class="button button-danger" type="button">Eliminar contacto</button>
<button class="button" disabled>Guardando…</button>
```

### Campos

Cada campo lleva un `label` asociado. La ayuda queda debajo del control. Un
error usa `aria-invalid="true"`, describe cómo corregir el dato y se conecta
por `aria-describedby`. El borde de foco conserva un contorno de 3 px y una
separación de 3 px.

```html
<label class="field-label" for="company-name">Empresa</label>
<input id="company-name" name="company" aria-describedby="company-help" />
<p id="company-help" class="field-help">Nombre visible para tu equipo.</p>
```

### Paneles, estados y mensajes

```html
<section class="panel" aria-labelledby="panel-title">
  <h2 id="panel-title">Próxima acción</h2>
  <span class="badge badge-amber">Revisión humana</span>
</section>

<div class="alert alert-warning" role="status">
  Estado de llamada desconocido. Verificá el intento antes de volver a llamar.
</div>
```

Las variantes `badge-green`, `badge-amber`, `badge-red` y `badge-blue` cubren
confirmación, atención, error e información. Las alertas tienen variantes
`alert-success`, `alert-warning` y `alert-danger`.

### Pestañas

El contenedor usa `tabs` y cada opción usa `tab`. Una navegación de páginas
marca el enlace activo con `aria-current="page"`. Para paneles dentro de una
vista se usa `role="tab"`, `aria-selected`, `aria-controls` y navegación por
flechas. La galería implementa ese comportamiento como referencia.

## Layout y adaptación

La pantalla base tiene navegación, barra superior, encabezado de página y
contenido. El título de página se ubica a la izquierda y su acción principal a
la derecha. Las tablas conservan cabeceras y las filas agrupadas. El detalle
de un contacto prioriza la próxima acción en móvil.

| Ancho | Comportamiento de referencia |
|---|---|
| Más de 1024 px | Sidebar de 224 px y composición de escritorio |
| Hasta 1024 px | Reducir márgenes y permitir que las barras de acciones envuelvan |
| Hasta 768 px | Navegación adaptada, contenido en una columna y campos a 16 px |
| Hasta 480 px | Márgenes de 16 px y acciones apiladas cuando lo requiera el contenido |

Los tableros y tablas anchas usan desplazamiento dentro de una región con
nombre accesible. El contenido general se ajusta al ancho disponible. Los
paneles vacíos ofrecen un siguiente paso. Los errores permiten reintentar.
La carga conserva la estructura de la pantalla para anticipar el contenido.

## Aplicación por responsable

| Responsable | Pantallas | Patrón de referencia |
|---|---|---|
| Vale | `/agent`, `/agent/test` | Formulario por secciones, pestañas, ayudas y acción Guardar |
| Tomás | `/login`, selector de empresa, `/prospects` | Campos comunes, tabla de candidatos, búsqueda y fuente visible |
| Bautista | `/calls`, `/calls/[id]` | Tabla de llamadas, estado técnico, modo de integración y detalle de resultado |
| Nano | `/pipeline`, `/contacts/[id]`, `/tasks` | Tablero, detalle con historial, próxima acción y tabla de tareas |

Nano integra los estilos globales y mantiene esta base. Cada responsable crea
sus pantallas con las mismas primitivas y presenta los cambios compartidos
para revisión de un consumidor según el flujo del repositorio.

Los estilos ya se importan una vez desde `src/app/layout.tsx`.
El alias `@/` apunta a `src/` en el bootstrap de Tomás.

```tsx
import "@/components/ui/tokens.css";
import "@/components/ui/components.css";
```

Los componentes React podrán conservar estos nombres de clase. Cada dominio
aplica su contenido y comportamiento a las primitivas compartidas.
