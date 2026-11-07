// Presentación en vivo del pitch: cada toque reproduce UNA sección y se queda quieta al final.
// Nunca avanza sola ni vuelve a empezar.
//   → / espacio / Enter / AvPág / clic  = siguiente sección (si una está a medias, la termina)
//   ← / RePág                          = sección anterior
//   F = pantalla completa   ·   Inicio = volver al principio
import {Player, type PlayerRef} from '@remotion/player';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Pitch, PITCH_DURATION, STOPS} from '../src/Pitch';

const App: React.FC = () => {
	const ref = useRef<PlayerRef>(null);
	// Sección actual: -1 = antes de empezar (pantalla negra); 0..STOPS.length-1 = la que se ve.
	const [section, setSection] = useState(-1);
	const sectionRef = useRef(-1);
	const [playRequest, setPlayRequest] = useState(0);
	const [hint, setHint] = useState(true);

	const stopOf = (s: number) => (s < 0 ? 0 : STOPS[s]);

	// Para pruebas: window.__pitch.getCurrentFrame()
	useEffect(() => {
		(window as unknown as {__pitch: PlayerRef | null}).__pitch = ref.current;
	});

	// El Player nunca pasa de outFrame (la parada de la sección actual).
	// Además, por las dudas, cada cuadro se fija si ya llegó y lo frena ahí.
	useEffect(() => {
		let id = 0;
		const tick = () => {
			const player = ref.current;
			const stop = stopOf(sectionRef.current);
			if (player && sectionRef.current >= 0 && player.isPlaying() && player.getCurrentFrame() >= stop) {
				player.pause();
				player.seekTo(stop);
			}
			id = requestAnimationFrame(tick);
		};
		id = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(id);
	}, []);

	// Reproducir recién cuando el Player ya tiene el nuevo límite (outFrame).
	useEffect(() => {
		if (playRequest > 0) ref.current?.play();
	}, [playRequest]);

	const goTo = useCallback((s: number, play: boolean) => {
		const player = ref.current;
		if (!player) return;
		player.pause();
		sectionRef.current = s;
		setSection(s);
		if (play) {
			// Arranca desde el final de la sección anterior.
			player.seekTo(stopOf(s - 1));
			setPlayRequest((n) => n + 1);
		} else {
			player.seekTo(stopOf(s));
		}
	}, []);

	const next = useCallback(() => {
		const player = ref.current;
		if (!player) return;
		setHint(false);
		// El primer toque también pone pantalla completa.
		if (!document.fullscreenElement) {
			document.documentElement.requestFullscreen().catch(() => undefined);
		}
		const s = sectionRef.current;
		// Si la sección todavía se está reproduciendo, la termina de golpe.
		if (s >= 0 && player.getCurrentFrame() < stopOf(s)) {
			goTo(s, false);
			return;
		}
		// En la última sección se queda quieta: no hay loop.
		if (s >= STOPS.length - 1) return;
		goTo(s + 1, true);
	}, [goTo]);

	const prev = useCallback(() => {
		const s = sectionRef.current;
		if (s < 0) return;
		goTo(s - 1, false);
	}, [goTo]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.repeat) return;
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
				goTo(-1, false);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [next, prev, goTo]);

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
				outFrame={Math.max(1, stopOf(section))}
				loop={false}
				fps={30}
				compositionWidth={1920}
				compositionHeight={1080}
				controls={false}
				clickToPlay={false}
				doubleClickToFullscreen={false}
				spaceKeyToPlayOrPause={false}
				moveToBeginningWhenEnded={false}
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
