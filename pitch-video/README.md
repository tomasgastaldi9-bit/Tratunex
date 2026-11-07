# Video de fondo del pitch de Tratunex

Video sin voz para pasar detrás de quien habla, en loop.
1920×1080, 30 fps, 67 segundos, con sonidos solo cuando entran cosas. Hecho con [Remotion](https://www.remotion.dev).

**El video terminado:** `out/tratunex-pitch.mp4`

## Qué cuenta

1. Gancho en negro: "Buscar proveedores. Llamar uno por uno. Comparar en planillas. Pagar a mano." → "Ahora lo hace un agente."
2. Marca: Tratunex, el agente de compras de tu pyme.
3. Paso 1: el dueño carga qué necesita y sus reglas.
4. Paso 2: el agente busca proveedores.
5. Paso 3: el agente llama y pide cotización (Vapi).
6. Paso 4: compara y explica por qué elige (IA).
7. Paso 5: paga en ARGt en Arbitrum One, con hash y equivalente en USDT según Belo, y cierra con "Pago confirmado" a pantalla completa.
8. Lo que viene.
9. Cierre en negro. Empieza y termina en negro, así el loop empalma sin salto.

Todos los valores de ejemplo están dentro de tarjetas rotuladas **"Datos de prueba"**.
Lo que todavía no existe en la app (ranking, pago, hash) dice **"Concepto · datos de prueba"**.

## Presentación en vivo (vos marcás el ritmo)

Es el mismo video, pero frena al final de cada escena y sigue cuando vos querés.

- **Abrir:** en el deploy, `/pitch/index.html` (por ejemplo https://tratunex-mvp.vercel.app/pitch/index.html). En una compu, doble clic en `Presentar.cmd` (o `npm run present`): abre http://localhost:5180/pitch/.
- **El primer clic o → pone pantalla completa** (F la saca y la vuelve a poner).
- **Llena toda la pantalla** en 16:9 y 16:10. En proyectores 4:3 deja franjas para no cortar texto.
- **→, espacio, Enter, AvPág o clic:** reproduce la escena siguiente y frena. Sirve con un clicker de presentaciones.
- **←, RePág:** vuelve a la escena anterior.
- **Inicio:** vuelve al principio (pantalla negra).

Son 10 paradas: gancho, marca, los 5 pasos (el pago frena una vez más antes de "Pago confirmado"), lo que viene y cierre.
Necesita internet (la letra y los sonidos se bajan de Google Fonts y remotion.media).
Para que no se trabe, en vivo se sirve la versión optimizada y se apagan el desenfoque y el empuje de cámara
(`LIVE` en `src/theme.ts`). El MP4 conserva todos los efectos.
Las paradas se calculan solas en `src/Pitch.tsx` (`STOPS`); el control está en `presenter/main.tsx`.

## Cómo volver a renderizarlo

Necesitás Node 18 o más nuevo. En esta carpeta:

```bash
npm install
npm run render
```

El MP4 queda en `out/tratunex-pitch.mp4` (tarda unos minutos).

Para ver y retocar el video en el navegador antes de renderizar:

```bash
npm run studio
```

## Sonidos

Solo suenan entradas: whoosh en cada escena y tarjeta, whip en las frases del gancho,
click en filas y mensajes, switch en las etiquetas de estado y un ding en el pago confirmado.
Son de la biblioteca oficial de Remotion (`https://remotion.media/*.wav`, ver `src/sfx.tsx`).
Se pueden cambiar por sonidos de ElevenLabs: generalos, ponelos en `public/` y cambiá las rutas en `src/sfx.tsx`
(con `staticFile('nombre.mp3')`). No hay clave de ElevenLabs en esta compu, así que no se usaron.

## Dónde se cambia cada cosa

- Textos y datos de cada paso: `src/scenes/Steps.tsx`
- Gancho del principio: `src/scenes/Hook.tsx`
- "Lo que viene": `src/scenes/Lists.tsx`
- Apertura y cierre: `src/scenes/Brand.tsx`
- Orden y duración de las escenas: `src/Pitch.tsx`
- Colores y letra (los mismos de la app, PR #43, commits 0ac1338 y dc0044d): `src/theme.ts`
- Logo (copia de `src/components/ui/Logo.tsx` de la app): `LogoMark` en `src/ui.tsx`
- Animaciones reutilizables: `src/anim.tsx`; transiciones: `src/transitions.tsx`; sonidos: `src/sfx.tsx`

La guía oficial de Remotion para agentes está instalada en `.claude/skills/remotion-best-practices`.

## En el repo

- Fuente: esta carpeta (`pitch-video/`). Tiene su propio `package.json`; no toca el de la app.
- Publicada: `public/pitch/` (compilada). En el deploy queda en `/pitch/index.html`.
- Para recompilarla después de un cambio: `npm install` y `npm run build:web` en esta carpeta.
- La app la excluye de `eslint` y `tsc` (`eslint.config.mjs` y `tsconfig.json` de la raíz), así la CI no la revisa.
- El MP4 no se sube (pesa ~16 MB): se genera con `npm run render`.
