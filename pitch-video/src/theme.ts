// Colores y letra iguales a la app nueva (PR #43, src/app/globals.css, commits 0ac1338 y dc0044d).
// Grises neutros; el color solo aparece para estados (verde = bien, ámbar = pendiente).
import {loadFont} from '@remotion/google-fonts/HankenGrotesk';

const {fontFamily} = loadFont('normal', {
	weights: ['400', '500', '600', '700'],
	subsets: ['latin'],
});

export const font = fontFamily;

// En la presentación en vivo (presenter/, ver vite.config.ts) se apagan los efectos
// caros (desenfoque y empuje de cámara) para que la compu no se trabe.
declare const __LIVE__: boolean | undefined;
export const LIVE = typeof __LIVE__ !== 'undefined' && __LIVE__ === true;
export const blurFx = (px: number) => (LIVE || px <= 0.05 ? undefined : `blur(${px}px)`);
export const mono = 'Consolas, "SFMono-Regular", ui-monospace, monospace';

export const c = {
	canvas: '#f1f1f1',
	surface: '#ffffff',
	wash: '#f1f1f1',
	line: '#e3e3e3',
	lineStrong: '#d1d1d1',
	gray400: '#a8a8a8',
	subtle: '#767676',
	muted: '#575757',
	gray700: '#404040',
	ink: '#1a1a1a',
	success: '#1d6a43',
	successSoft: '#ecf6f0',
	warning: '#85570a',
	warningSoft: '#fdf5e3',
};
