# Diseño visual de Tratunex

Guía para que todas las pantallas se vean iguales y cualquiera las entienda. Antes de inventar un estilo, buscá el componente acá.

- **Catálogo vivo:** corré `npm run dev` y abrí **`/ui`**. Cada bloque muestra el componente funcionando y un botón **"Ver código"** para copiar.
- **Referencia visual:** Figma community "No.162 Japanese-Style Notion Illustration Minimalist Clean Dashboard UI", pantalla **Frame 14** (archivo `7mycryIAvyl0svS8SfeQKu`, nodo `1:18`).
- **Estilo:** blanco, grises y negro. **El color solo aparece para decir algo** (un estado), nunca para decorar.

## Crear una pantalla nueva en 4 pasos

1. **Marco con menú.** En tu carpeta (`src/app/<tu-ruta>/layout.tsx`):

   ```tsx
   import { AppShell } from "@/components/ui/AppShell";

   export default function Layout({ children }: { children: React.ReactNode }) {
     return <AppShell>{children}</AppShell>;
   }
   ```

2. **Encabezado.** Un `PageHeader` por pantalla: título, una línea que explique para qué sirve y la acción principal.

   ```tsx
   <PageHeader title="Llamadas" description="Lo que hizo el agente hoy." actions={<Button icon={Phone}>Llamar</Button>} />
   ```

3. **Contenido** con los componentes de abajo. Para estados (etapa, resultado, modo) usá las etiquetas listas de `StatusBadges.tsx`.
4. **Los tres estados que nunca faltan:**
   - **Vacío:** `EmptyState` que invite al primer paso.
   - **Cargando:** `<Button loading>Guardando…</Button>` (evita el doble clic).
   - **Error:** `<Alert tone="danger">` que diga qué pasó y qué hacer.

   Y si los datos son de mentira, `<ModeBadge mode="mock" />` a la vista (lo pide `AGENTS.md`).

## Componentes

Están en [`src/components/ui/`](../src/components/ui). Cada archivo explica sus opciones arriba de todo, con un ejemplo. Importalos de a uno: `import { Button } from "@/components/ui/Button"`.

| Componente | Para qué |
|---|---|
| `AppShell` | Marco de la pantalla: menú + contenido con los márgenes del diseño. |
| `Sidebar` + `navigation.ts` | Menú con ícono y nombre. Columna negra en compu, barra fija abajo en celular. **Para agregar una sección, editá solo `navigation.ts`.** |
| `PageHeader` | Título `<h1>` + bajada + botones. |
| `Button` | `primary` (negro, uno por sección), `secondary`, `ghost`, `danger`. `icon`, `loading`, tamaños `md` (por defecto) y `sm`. `buttonStyles()` para que un `<Link>` se vea como botón. |
| `IconButton` | Botón de solo ícono. `label` obligatorio. |
| `Card` | Tarjeta gris con esquinas de 20px. |
| `StatCard` | Número grande + descripción ("12 Llamadas hoy"). |
| `ListItem` + `Avatar` | Fila de una lista (contacto, llamada, tarea) que se acomoda sola en celular. |
| `Badge` | Etiqueta con significado: `tone` = `neutral`, `strong`, `info`, `success`, `warning`, `danger`. |
| `StageBadge`, `PotentialBadge`, `ModeBadge`, `CallStatusBadge` | Etiquetas listas para los estados del BRIEF §8. |
| `Input`, `Textarea`, `Select` | Campos con `label` (obligatorio), `hint`, `error` y `required`. `Field` si armás un campo nuevo. |
| `Alert` | Aviso `info`, `success`, `warning` o `danger`, con acción opcional. |
| `EmptyState` | Qué mostrar cuando todavía no hay nada. |
| `ProgressCard` | Primeros pasos con anillo de progreso ("2 de 4 · Continuar"). |

**Íconos:** [`lucide-react`](https://lucide.dev/icons). Se pasan como componente: `icon={Phone}`. Cambian de tamaño y color solos.

## Colores

Definidos en [`src/app/globals.css`](../src/app/globals.css). Se usan como clases de Tailwind (`bg-…`, `text-…`, `border-…`).

**Base (blanco, grises y negro):**

| Token | Valor | Para qué |
|---|---|---|
| `canvas` | `#FFFFFF` | Fondo de la página |
| `surface` | `#F6F6F8` | Tarjetas, campos, pastillas |
| `surface-hover` | `#ECECEF` | Tarjeta con el mouse encima |
| `line` | `#E4E4E7` | Bordes y divisores |
| `ink` | `#000000` | Texto, botones, menú |
| `ink-muted` | `#666666` | Texto secundario |
| `ink-subtle` | `#8C8C8C` | Placeholder |

**Estados (cada uno con versión fuerte para texto e íconos, y `-soft` para fondos):**

| Token | Significa | Ejemplos |
|---|---|---|
| `success` / `success-soft` | Salió bien | Compró, potencial: sí, guardado |
| `warning` / `warning-soft` | Te toca hacer algo | En seguimiento, datos de prueba, estado desconocido |
| `danger` / `danger-soft` | Salió mal o es delicado | No compró, error, llamada real |
| `info` / `info-soft` | Oportunidad o dato | Cliente potencial, voz en el navegador |

No uses colores sueltos (`bg-blue-500`, `#3366ff`). Si hace falta uno nuevo, se agrega como token en `globals.css` para todo el equipo.

## Tipografía y medidas

- Fuente **Kantumruy Pro** (la carga [`layout.tsx`](../src/app/layout.tsx)).
- Títulos de pantalla `text-2xl font-bold` (24px) · números grandes 32px · texto y botones `text-sm` (14px) · datos chicos `text-xs` (12px, nunca menos de 11px).
- Campos: 16px en celular (si no, el iPhone hace zoom) y 14px en compu.
- Esquinas: `rounded-card` (20px) en tarjetas, `rounded-control` (10px) en botones, campos y etiquetas.
- Espacios: 40px de margen de página en compu (16px en celular), 20px entre bloques (`gap-5`), 10px entre cosas chicas (`gap-2.5`).
- Botones y campos: 40–44px de alto mínimo, para tocarlos fácil con el dedo.

## Reglas para que cualquiera lo entienda

- **Ícono + palabra.** Un ícono solo no se entiende (¿un birrete es "Agente"?). Si un botón es solo ícono, lleva `label`.
- **El color nunca va solo.** Toda etiqueta dice el estado en texto y lleva ícono.
- **Nada gris sobre gris.** Un botón `secondary` o un campo dentro de una `Card` no se distingue: ponelos sobre fondo blanco.
- **Textos con verbo y en criollo:** "Llamar ahora", "Importar contactos", "Guardar cambios". Nada de "Aceptar" ni "Enviar" sueltos.
- **Errores:** qué pasó y qué hacer. "Falta el código de área. Ejemplo: +54 11 …", no "Error de validación".
- **Fechas** en horario de Argentina y relativas cuando se pueda ("Hoy 10:30").
- **Teclado:** el foco se ve como un anillo negro; no lo saques. `AppShell` trae "Saltar al contenido".

## Trampas conocidas

- **Tailwind también lee los comentarios.** Si en un comentario escribís algo con forma de clase pero incompleto (por ejemplo, una clase con corchetes y puntos suspensivos adentro), Tailwind intenta generarla, arma CSS inválido y **toda la app da error 500**. En los comentarios, describí la clase con palabras.
- **Íconos a componentes del cliente:** un ícono (`icon={Phone}`) es una función. No se puede pasar desde una página del servidor a un componente con `"use client"`. Por eso `Sidebar` lee el menú de `navigation.ts` en vez de recibirlo por props.
