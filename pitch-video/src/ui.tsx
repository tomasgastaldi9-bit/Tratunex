// Piezas de interfaz con el estilo de la app (grises, bordes finos, Hanken Grotesk).
import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Appear, clamp, easeOut, progress, RiseText} from './anim';
import {Sfx} from './sfx';
import {c, font, LIVE} from './theme';

// Fondo de cada escena + un empuje de cámara lento (como un "push-in" de AE).
// Suena un whoosh al entrar (coincide con la transición).
export const SceneBase: React.FC<{
	dur: number;
	dark?: boolean;
	sound?: boolean;
	children: React.ReactNode;
}> = ({dur, dark = false, sound = true, children}) => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill
			style={{
				backgroundColor: dark ? c.ink : c.canvas,
				fontFamily: font,
				color: dark ? '#ffffff' : c.ink,
			}}
		>
			{sound ? <Sfx at={0} name="whoosh" /> : null}
			<AbsoluteFill
				style={{
					scale: LIVE ? undefined : `${interpolate(frame, [0, dur], [1, 1.035], clamp)}`,
				}}
			>
				{children}
			</AbsoluteFill>
		</AbsoluteFill>
	);
};

// Logo de la app (src/components/ui/Logo.tsx del PR #43): "T" gris metalizada,
// con dos alas arriba y un pie que se afina. El degradé es parte del logo.
export const LogoMark: React.FC<{size: number; tone?: 'dark' | 'light'}> = ({
	size,
	tone = 'dark',
}) => {
	const id = `t-${React.useId().replace(/:/g, '')}`;
	const [top, bottom] = tone === 'light' ? ['#e6e6e6', '#9c9c9c'] : ['#8f8f8f', '#4a4a4a'];
	return (
		<svg width={size} height={size} viewBox="0 0 32 32" style={{flexShrink: 0, overflow: 'visible'}}>
			<defs>
				<linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stopColor={top} />
					<stop offset="1" stopColor={bottom} />
				</linearGradient>
			</defs>
			<g fill={`url(#${id})`} stroke={`url(#${id})`} strokeWidth={1} strokeLinejoin="round">
				<path d="M2.5 6.5L13.5 8.6V12.4L5.6 11.2Z" />
				<path d="M29.5 6.5L18.5 8.6V12.4L26.4 11.2Z" />
				<path d="M12.6 14H19.4L17.5 28H14.5Z" />
			</g>
		</svg>
	);
};

// Barra superior: marca a la izquierda y avance de los 5 pasos a la derecha.
export const TopBar: React.FC<{step?: number; label?: string}> = ({
	step,
	label,
}) => {
	const frame = useCurrentFrame();
	const fill = progress(frame, 14, 30);
	return (
		<Appear
			delay={6}
			y={-20}
			style={{
				position: 'absolute',
				left: 120,
				right: 120,
				top: 64,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
			}}
		>
			<div style={{display: 'flex', alignItems: 'center', gap: 14}}>
				<LogoMark size={60} />
				<div style={{fontSize: 38, fontWeight: 600, letterSpacing: '-0.02em'}}>
					Tratunex
				</div>
			</div>
			{step ? (
				<div style={{display: 'flex', alignItems: 'center', gap: 24}}>
					<div style={{fontSize: 30, fontWeight: 600, color: c.muted}}>
						Paso {step} de 5
					</div>
					<div style={{display: 'flex', gap: 10}}>
						{[1, 2, 3, 4, 5].map((s) => (
							<div
								key={s}
								style={{
									width: 64,
									height: 10,
									borderRadius: 5,
									background: s < step ? c.gray400 : c.line,
									overflow: 'hidden',
								}}
							>
								{s === step ? (
									<div
										style={{
											height: '100%',
											background: c.ink,
											scale: `${fill} 1`,
											transformOrigin: 'left center',
										}}
									/>
								) : null}
							</div>
						))}
					</div>
				</div>
			) : label ? (
				<div style={{fontSize: 30, fontWeight: 600, color: c.muted}}>
					{label}
				</div>
			) : null}
		</Appear>
	);
};

export const Kicker: React.FC<{children: React.ReactNode}> = ({children}) => (
	<div
		style={{
			fontSize: 30,
			fontWeight: 700,
			letterSpacing: '0.1em',
			textTransform: 'uppercase',
			color: c.subtle,
		}}
	>
		{children}
	</div>
);

// Etiqueta honesta: todo lo que no es real se marca así.
export const TestBadge: React.FC<{label: string}> = ({label}) => (
	<div
		style={{
			position: 'absolute',
			top: 0,
			right: 40,
			translate: '0 -50%',
			background: c.surface,
			border: `2px dashed ${c.gray400}`,
			color: c.muted,
			borderRadius: 10,
			padding: '8px 22px',
			fontSize: 26,
			fontWeight: 700,
			letterSpacing: '0.06em',
			textTransform: 'uppercase',
			whiteSpace: 'nowrap',
		}}
	>
		{label}
	</div>
);

export const Card: React.FC<{
	badge?: string;
	style?: React.CSSProperties;
	children: React.ReactNode;
}> = ({badge, style, children}) => (
	<div
		style={{
			position: 'relative',
			background: c.surface,
			border: `2px solid ${c.line}`,
			borderRadius: 16,
			padding: 48,
			boxShadow: '0 1px 2px rgba(17,17,19,0.03), 0 30px 60px -36px rgba(17,17,19,0.12)',
			...style,
		}}
	>
		{badge ? <TestBadge label={badge} /> : null}
		{children}
	</div>
);

type Tone = 'success' | 'warning' | 'neutral' | 'ink';
const tones: Record<Tone, [string, string]> = {
	success: [c.successSoft, c.success],
	warning: [c.warningSoft, c.warning],
	neutral: [c.wash, c.muted],
	ink: [c.ink, '#ffffff'],
};

export const Chip: React.FC<{tone: Tone; children: React.ReactNode}> = ({
	tone,
	children,
}) => {
	const [bg, fg] = tones[tone];
	return (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 12,
				background: bg,
				color: fg,
				fontSize: 30,
				fontWeight: 700,
				padding: '10px 22px',
				borderRadius: 10,
				whiteSpace: 'nowrap',
			}}
		>
			<span
				style={{width: 12, height: 12, borderRadius: 6, background: fg}}
			/>
			{children}
		</span>
	);
};

export const Avatar: React.FC<{letter: string; size?: number}> = ({
	letter,
	size = 72,
}) => (
	<div
		style={{
			width: size,
			height: size,
			flexShrink: 0,
			borderRadius: 12,
			background: c.wash,
			color: c.muted,
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			fontSize: size * 0.46,
			fontWeight: 700,
		}}
	>
		{letter}
	</div>
);

// Número gigante del paso, detrás del título, que se desliza lento (parallax).
const BigNumber: React.FC<{n: number; dur: number}> = ({n, dur}) => {
	const frame = useCurrentFrame();
	const t = progress(frame, 4, 30, easeOut);
	return (
		<div
			style={{
				position: 'absolute',
				left: 40,
				bottom: -150,
				fontSize: 640,
				fontWeight: 700,
				letterSpacing: '-0.07em',
				lineHeight: 1,
				color: '#e6e6e6',
				opacity: t,
				translate: `${interpolate(frame, [0, dur], [80, -40], clamp) + (1 - t) * 120}px 0`,
			}}
		>
			{String(n).padStart(2, '0')}
		</div>
	);
};

// Escena de paso: título grande a la izquierda, tarjeta a la derecha.
export const StepShell: React.FC<{
	dur: number;
	step?: number;
	label?: string;
	kicker: string;
	title: string[];
	subtitle?: string;
	children: React.ReactNode;
}> = ({dur, step, label, kicker, title, subtitle, children}) => (
	<SceneBase dur={dur}>
		{step ? <BigNumber n={step} dur={dur} /> : null}
		<TopBar step={step} label={label} />
		<div
			style={{
				position: 'absolute',
				left: 120,
				top: 170,
				bottom: 110,
				width: 760,
				display: 'flex',
				flexDirection: 'column',
				justifyContent: 'center',
				gap: 34,
			}}
		>
			<Appear delay={10} y={16}>
				<Kicker>{kicker}</Kicker>
			</Appear>
			<RiseText
				lines={title}
				delay={14}
				style={{
					fontSize: 112,
					fontWeight: 700,
					lineHeight: 1.0,
					letterSpacing: '-0.045em',
				}}
			/>
			{subtitle ? (
				<Appear delay={36} y={24}>
					<div
						style={{
							fontSize: 42,
							fontWeight: 500,
							color: c.muted,
							lineHeight: 1.25,
							maxWidth: 700,
						}}
					>
						{subtitle}
					</div>
				</Appear>
			) : null}
		</div>
		<div
			style={{
				position: 'absolute',
				right: 120,
				top: 160,
				bottom: 100,
				width: 880,
				display: 'flex',
				alignItems: 'center',
			}}
		>
			<div style={{width: '100%'}}>{children}</div>
		</div>
	</SceneBase>
);
