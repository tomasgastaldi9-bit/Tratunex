// Apertura en negro: frases que golpean una tras otra (tipografía cinética),
// cada una se tacha, y aparece la respuesta.
import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {easeInOut, progress, RiseText} from '../anim';
import {Sfx} from '../sfx';
import {blurFx, c} from '../theme';
import {SceneBase} from '../ui';

const PHRASES = ['Buscar proveedores.', 'Llamar uno por uno.', 'Comparar en planillas.', 'Pagar a mano.'];
const STEP = 22;

const Slam: React.FC<{text: string; n: number}> = ({text, n}) => {
	const frame = useCurrentFrame();
	const t = progress(frame, 0, 9);
	const strike = progress(frame, 11, 8, easeInOut);
	return (
		<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
			<div
				style={{
					position: 'absolute',
					top: 90,
					left: 120,
					fontSize: 34,
					fontWeight: 700,
					letterSpacing: '0.1em',
					color: c.subtle,
				}}
			>
				HOY · {String(n).padStart(2, '0')} / 04
			</div>
			<div
				style={{
					position: 'relative',
					fontSize: 156,
					fontWeight: 700,
					letterSpacing: '-0.045em',
					opacity: t,
					scale: `${1.35 - 0.35 * t}`,
					filter: blurFx((1 - t) * 18),
				}}
			>
				<span style={{opacity: 1 - strike * 0.5}}>{text}</span>
				<div
					style={{
						position: 'absolute',
						left: -10,
						right: -10,
						top: '54%',
						height: 12,
						borderRadius: 6,
						background: '#ffffff',
						scale: `${strike} 1`,
						transformOrigin: 'left center',
					}}
				/>
			</div>
		</AbsoluteFill>
	);
};

const Answer: React.FC = () => (
	<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
		<Sfx at={0} name="whoosh" />
		<RiseText
			lines={['Ahora lo hace']}
			delay={2}
			align="center"
			style={{fontSize: 150, fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1.05, color: c.gray400}}
		/>
		<div style={{fontSize: 150, fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1.05}}>
			<RiseText lines={['un agente.']} delay={10} align="center" />
		</div>
	</AbsoluteFill>
);

export const Hook: React.FC<{dur: number}> = ({dur}) => {
	const frame = useCurrentFrame();
	const idx = Math.floor(frame / STEP);
	return (
		<SceneBase dur={dur} dark sound={false}>
			{PHRASES.map((p, i) => (
				<Sfx key={p} at={i * STEP} name="whip" />
			))}
			{idx < PHRASES.length ? (
				<Sequence from={idx * STEP} durationInFrames={STEP} layout="none" name={PHRASES[idx]}>
					<Slam text={PHRASES[idx]} n={idx + 1} />
				</Sequence>
			) : null}
			<Sequence from={PHRASES.length * STEP} layout="none" name="Respuesta">
				<Answer />
			</Sequence>
		</SceneBase>
	);
};
