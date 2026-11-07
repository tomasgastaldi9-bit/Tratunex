// Presentación en vivo: el mismo video, pero avanza con el teclado o un clicker.
// `npm run present` la abre en http://localhost:5180
import {defineConfig} from 'vite';

export default defineConfig({
	root: 'presenter',
	// Se publica dentro de la app en /pitch/ (public/pitch del repo).
	base: '/pitch/',
	define: {__LIVE__: 'true'},
	preview: {port: 5180, strictPort: true},
	publicDir: '../public',
	server: {port: 5180, strictPort: true},
	build: {outDir: '../out/presenter', emptyOutDir: true},
});
