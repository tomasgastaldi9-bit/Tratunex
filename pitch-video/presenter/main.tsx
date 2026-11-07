// Presentación en vivo del pitch: cada toque reproduce la escena siguiente y frena.
//   → / espacio / Enter / AvPág / clic  = siguiente
//   ← / RePág                          = anterior
//   F = pantalla completa   ·   Inicio = volver al principio
import {Player, type PlayerRef} from '@remotion/player';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Pitch, PITCH_DURATION, STOPS} from '../src/Pitch';

const App: React.FC = () => {
	const ref = useRef<PlayerRef>(null);
	const target = useRef<number | null>(null);
	const [hint, setHint] = useState(true);

	// Mientras reproduce, frena al llegar al punto de parada.
	useEffect(() => {
		const player = ref.current;
		if (!player) return;
		const onFrame = (e: {detail: {frame: number}}) => {
			const stop = target.current;
			if (stop !== null && e.detail.frame >= stop) {
				target.current = null;
				player.pause();
				player.seekTo(stop);
			}
		};
		player.addEventListener('frameupdate', onFrame);
		return () => player.removeEventListener('frameupdate', onFrame);
	}, []);

	// Tamaño "cubrir": llena toda la pantalla sin franjas negras (recorta un poco
	// los bordes si la pantalla no es 16:9; el contenido tiene margen de sobra).
	const [scale, setScale] = useState(1);
	useEffect(() => {
		const fit = () => {
			const cover = Math.max(window.innerWidth / 1920, window.innerHeight / 1080);
			const contain = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
			// En pantallas muy cuadradas (4:3) cubrir cortaría texto: ahí deja franjas.
			setScale(cover / contain > 1.12 ? contain : cover);
		};
		fit();
		window.addEventListener('resize', fit);
		return () => window.removeEventListener('resize', fit);
	}, []);

	const next = useCallback(() => {
		const player = ref.current;
		if (!player) return;
		setHint(false);
		// El primer toque también pone pantalla completa.
		if (!document.fullscreenElement) {
			document.documentElement.requestFullscreen().catch(() => undefined);
		}
		const now = target.current ?? player.getCurrentFrame();
		let stop = STOPS.find((s) => s > now);
		if (stop === undefined) {
			// Terminó: vuelve a empezar.
			player.seekTo(0);
			stop = STOPS[0];
		}
		target.current = stop;
		player.play();
	}, []);

	const prev = useCallback(() => {
		const player = ref.current;
		if (!player) return;
		target.current = null;
		player.pause();
		// Vuelve al final de la escena anterior (o al principio, en negro).
		const now = player.getCurrentFrame();
		const before = STOPS.filter((s) => s < now - 2);
		player.seekTo(before.length ? before[before.length - 1] : 0);
	}, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (['ArrowRight', 'ArrowDown', ' ', 'Enter', 'PageDown'].includes(e.key)) {
				e.preventDefault();
				next();
			} else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) {
				e.preventDefault();
				prev();
			} else if (e.key === 'f' || e.key === 'F') {
				if (document.fullscreenElement) document.exitFullscreen();
				else document.documentElement.requestFullscreen();
			} else if (e.key === 'Home') {
				target.current = null;
				ref.current?.pause();
				ref.current?.seekTo(0);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [next, prev]);

	return (
		<div
			onClick={next}
			style={{
				width: '100vw',
				height: '100vh',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				cursor: 'none',
				position: 'relative',
				overflow: 'hidden',
			}}
		>
			<Player
				ref={ref}
				component={Pitch}
				durationInFrames={PITCH_DURATION}
				fps={30}
				compositionWidth={1920}
				compositionHeight={1080}
				controls={false}
				clickToPlay={false}
				doubleClickToFullscreen={false}
				spaceKeyToPlayOrPause={false}
				acknowledgeRemotionLicense
				style={{width: 1920 * scale, height: 1080 * scale, flexShrink: 0}}
			/>
			{hint ? (
				<div
					style={{
						position: 'absolute',
						bottom: 32,
						color: '#a8a8a8',
						fontFamily: 'system-ui, sans-serif',
						fontSize: 16,
						letterSpacing: '0.04em',
					}}
				>
					Clic o → para empezar (se pone en pantalla completa) · ← para volver
				</div>
			) : null}
		</div>
	);
};

createRoot(document.getElementById('root')!).render(<App />);
