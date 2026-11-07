// Piezas de animación reutilizables (el "kit de After Effects" del video).
import {evolvePath} from '@remotion/paths';
import React from 'react';
import {Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Sfx, type SfxName} from './sfx';
import {blurFx, c} from './theme';

export const clamp = {
	extrapolateLeft: 'clamp',
	extrapolateRight: 'clamp',
} as const;

// Curvas tipo "easy ease" fuerte de After Effects.
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

export const progress = (
	frame: number,
	start: number,
	dur: number,
	easing: (t: number) => number = easeOut,
) => interpolate(frame, [start, start + dur], [0, 1], {...clamp, easing});

// Título que sube palabra por palabra desde una máscara, con desenfoque de movimiento.
export const RiseText: React.FC<{
	lines: string[];
	delay?: number;
	stagger?: number;
	align?: 'flex-start' | 'center';
	style?: React.CSSProperties;
}> = ({lines, delay = 0, stagger = 3, align = 'flex-start', style}) => {
	const frame = useCurrentFrame();
	let i = 0;
	return (
		<div style={style}>
			{lines.map((line, li) => (
				<div
					key={li}
					style={{
						display: 'flex',
						flexWrap: 'wrap',
						justifyContent: align,
						columnGap: '0.24em',
					}}
				>
					{line.split(' ').map((word, wi) => {
						const t = progress(frame, delay + i++ * stagger, 24);
						return (
							<span
								key={wi}
								style={{
									display: 'inline-block',
									overflow: 'hidden',
									padding: '0 0.06em 0.16em',
									margin: '0 -0.06em -0.16em',
								}}
							>
								<span
									style={{
										display: 'inline-block',
										translate: `0 ${(1 - t) * 110}%`,
										rotate: `${(1 - t) * 7}deg`,
										transformOrigin: 'left bottom',
										filter: blurFx((1 - t) * 10),
									}}
								>
									{word}
								</span>
							</span>
						);
					})}
				</div>
			))}
		</div>
	);
};

// Aparece con desplazamiento, escala y desenfoque.
export const Appear: React.FC<{
	delay?: number;
	dur?: number;
	x?: number;
	y?: number;
	from?: number;
	sfx?: SfxName;
	style?: React.CSSProperties;
	children: React.ReactNode;
}> = ({delay = 0, dur = 24, x = 0, y = 40, from = 1, sfx, style, children}) => {
	const frame = useCurrentFrame();
	const t = progress(frame, delay, dur);
	return (
		<div
			style={{
				opacity: t,
				translate: `${(1 - t) * x}px ${(1 - t) * y}px`,
				scale: `${from + (1 - from) * t}`,
				filter: blurFx((1 - t) * 12),
				...style,
			}}
		>
			{sfx ? <Sfx at={delay} name={sfx} /> : null}
			{children}
		</div>
	);
};

// Tarjeta que entra girando en 3D, con rebote y sonido.
export const CardIn: React.FC<{delay?: number; children: React.ReactNode}> = ({
	delay = 0,
	children,
}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const s = spring({frame: frame - delay, fps, config: {damping: 15, stiffness: 110, mass: 0.9}});
	const blur = interpolate(s, [0, 0.75], [16, 0], clamp);
	return (
		<div style={{perspective: 2200}}>
			<Sfx at={delay} name="whoosh" />
			<div
				style={{
					opacity: interpolate(s, [0, 0.35], [0, 1], clamp),
					translate: `${(1 - s) * 260}px 0`,
					rotate: `y ${(1 - s) * -32}deg`,
					scale: `${0.88 + 0.12 * s}`,
					transformOrigin: 'left center',
					filter: blurFx(blur),
				}}
			>
				{children}
			</div>
		</div>
	);
};

// Texto que se escribe solo, con cursor que parpadea.
export const Typewriter: React.FC<{
	text: string;
	delay?: number;
	cps?: number;
	caret?: boolean;
}> = ({text, delay = 0, cps = 30, caret = true}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const n = Math.max(
		0,
		Math.min(text.length, Math.floor(((frame - delay) / fps) * cps)),
	);
	const typingEnd = delay + (text.length / cps) * fps;
	const typing = frame >= delay && frame < typingEnd;
	const blinkOn = Math.floor(frame / 14) % 2 === 0;
	const showCaret =
		caret && frame >= delay && (typing || (frame < typingEnd + 40 && blinkOn));
	return (
		<span>
			{text.slice(0, n)}
			<span
				style={{
					display: 'inline-block',
					width: '0.07em',
					height: '0.95em',
					marginLeft: '0.06em',
					verticalAlign: '-0.12em',
					background: c.ink,
					opacity: showCaret ? 1 : 0,
				}}
			/>
		</span>
	);
};

const fmt = (v: number, decimals: number) =>
	new Intl.NumberFormat('es-AR', {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	}).format(v);

// Número que cuenta hasta su valor.
export const CountUp: React.FC<{
	to: number;
	from?: number;
	delay?: number;
	dur?: number;
	decimals?: number;
}> = ({to, from = 0, delay = 0, dur = 36, decimals = 0}) => {
	const frame = useCurrentFrame();
	const t = progress(frame, delay, dur);
	return (
		<span style={{fontVariantNumeric: 'tabular-nums'}}>
			{fmt(from + (to - from) * t, decimals)}
		</span>
	);
};

// Tilde que se dibuja.
export const Check: React.FC<{
	delay?: number;
	size?: number;
	color?: string;
	stroke?: number;
}> = ({delay = 0, size = 40, color = c.success, stroke = 3}) => {
	const frame = useCurrentFrame();
	const d = 'M5 13.5 L10.5 19 L21 7.5';
	const ev = evolvePath(progress(frame, delay, 16), d);
	return (
		<svg width={size} height={size} viewBox="0 0 26 26">
			<path
				d={d}
				fill="none"
				stroke={color}
				strokeWidth={stroke}
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeDasharray={ev.strokeDasharray}
				strokeDashoffset={ev.strokeDashoffset}
			/>
		</svg>
	);
};

// Línea que se dibuja de izquierda a derecha.
export const DrawLine: React.FC<{
	delay?: number;
	dur?: number;
	color?: string;
	thickness?: number;
	style?: React.CSSProperties;
}> = ({delay = 0, dur = 30, color = c.line, thickness = 2, style}) => {
	const frame = useCurrentFrame();
	const t = progress(frame, delay, dur, easeInOut);
	return (
		<div
			style={{
				height: thickness,
				background: color,
				scale: `${t} 1`,
				transformOrigin: 'left center',
				...style,
			}}
		/>
	);
};

// Tachado que se dibuja sobre el texto.
export const Strike: React.FC<{delay: number; children: React.ReactNode}> = ({
	delay,
	children,
}) => {
	const frame = useCurrentFrame();
	const t = progress(frame, delay, 16, easeInOut);
	return (
		<span style={{position: 'relative', display: 'inline-block'}}>
			<span style={{opacity: 1 - t * 0.55}}>{children}</span>
			<span
				style={{
					position: 'absolute',
					left: -8,
					right: -8,
					top: '52%',
					height: 6,
					borderRadius: 3,
					background: c.ink,
					scale: `${t} 1`,
					transformOrigin: 'left center',
				}}
			/>
		</span>
	);
};

// Resaltador que pasa por detrás de una palabra.
export const Mark: React.FC<{
	delay: number;
	color?: string;
	children: React.ReactNode;
}> = ({delay, color = c.lineStrong, children}) => {
	const frame = useCurrentFrame();
	const t = progress(frame, delay, 18, easeInOut);
	return (
		<span style={{position: 'relative', display: 'inline-block'}}>
			<span
				style={{
					position: 'absolute',
					left: '-0.1em',
					right: '-0.1em',
					bottom: '0.06em',
					height: '0.42em',
					background: color,
					scale: `${t} 1`,
					transformOrigin: 'left center',
				}}
			/>
			<span style={{position: 'relative'}}>{children}</span>
		</span>
	);
};
