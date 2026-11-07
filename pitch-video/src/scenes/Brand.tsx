// Apertura y cierre con la marca. El cierre se funde al fondo para que el loop empalme.
import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Appear, clamp, easeInOut, progress, RiseText} from '../anim';
import {blurFx, c} from '../theme';
import {Sfx} from '../sfx';
import {LogoMark, SceneBase} from '../ui';

const WORD_W = 780; // ancho aproximado de "Tratunex" a 196px

const Lockup: React.FC<{start: number; dark?: boolean}> = ({start, dark = false}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const pop = spring({
		frame: frame - start,
		fps,
		config: {damping: 13, stiffness: 140, mass: 0.7},
	});
	const open = progress(frame, start + 22, 30, easeInOut);
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 20,
				translate: `${(1 - open) * ((20 + WORD_W) / 2)}px 0`,
			}}
		>
			<Sfx at={start} name="whoosh" />
			<Sfx at={start + 22} name="whip" />
			<div
				style={{
					scale: `${pop}`,
					rotate: `${(1 - pop) * -14}deg`,
				}}
			>
				<LogoMark size={230} tone={dark ? 'light' : 'dark'} />
			</div>
			<div
				style={{
					fontSize: 196,
					fontWeight: 600,
					letterSpacing: '-0.04em',
					lineHeight: 1,
					clipPath: `inset(-20% ${(1 - open) * 100}% -20% 0)`,
					translate: `${(1 - open) * -80}px 0`,
				}}
			>
				Tratunex
			</div>
		</div>
	);
};

const Tagline: React.FC<{text: string; delay: number; color?: string}> = ({text, delay, color = c.muted}) => (
	<RiseText
		lines={[text]}
		delay={delay}
		stagger={2}
		align="center"
		style={{fontSize: 68, fontWeight: 600, color, letterSpacing: '-0.02em'}}
	/>
);

const Verbs: React.FC<{delay: number}> = ({delay}) => (
	<div style={{display: 'flex', gap: 28, alignItems: 'center'}}>
		{['Busca', 'Cotiza', 'Compara', 'Paga'].map((w, i) => (
			<React.Fragment key={w}>
				{i > 0 ? (
					<Appear delay={delay + i * 6} y={0} from={0.4}>
						<div style={{width: 10, height: 10, borderRadius: 5, background: c.gray400}} />
					</Appear>
				) : null}
				<Appear delay={delay + i * 6} y={24} sfx="click">
					<div style={{fontSize: 40, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: c.subtle}}>
						{w}
					</div>
				</Appear>
			</React.Fragment>
		))}
	</div>
);

export const Intro: React.FC<{dur: number}> = ({dur}) => (
	<SceneBase dur={dur}>
		<AbsoluteFill
			style={{alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 48}}
		>
			<Lockup start={8} />
			<Tagline text="El agente de compras de tu pyme." delay={58} />
			<Verbs delay={86} />
		</AbsoluteFill>
	</SceneBase>
);

export const Outro: React.FC<{dur: number}> = ({dur}) => {
	const frame = useCurrentFrame();
	const out = interpolate(frame, [dur - 26, dur - 2], [0, 1], {...clamp, easing: easeInOut});
	return (
		<SceneBase dur={dur} dark>
			<AbsoluteFill
				style={{
					alignItems: 'center',
					justifyContent: 'center',
					flexDirection: 'column',
					gap: 48,
					opacity: 1 - out,
					scale: `${1 - out * 0.04}`,
					filter: blurFx(out * 10),
				}}
			>
				<Lockup start={6} dark />
				<Tagline text="Comprás mejor. Pagás con reglas." delay={50} color="#ffffff" />
				<Appear delay={80} y={20}>
					<div style={{fontSize: 36, fontWeight: 600, color: c.gray400}}>
						ARGt de Twin · Arbitrum One · Precio de Belo
					</div>
				</Appear>
			</AbsoluteFill>
		</SceneBase>
	);
};
