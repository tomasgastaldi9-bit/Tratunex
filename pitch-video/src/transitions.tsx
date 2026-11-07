// Transiciones propias, en grises: cortina doble y zoom con desenfoque.
import type {
	TransitionPresentation,
	TransitionPresentationComponentProps,
} from '@remotion/transitions';
import React from 'react';
import {AbsoluteFill, Easing, interpolate} from 'remotion';
import {clamp, easeInOut, easeOut} from './anim';
import {blurFx, c} from './theme';

type NoProps = Record<string, never>;

// Cortina: pasa una franja gris y una negra, tapan la escena y descubren la siguiente.
const InkWipe: React.FC<TransitionPresentationComponentProps<NoProps>> = ({
	children,
	presentationDirection,
	presentationProgress: p,
}) => {
	if (presentationDirection === 'exiting') {
		const t = interpolate(p, [0, 0.5], [0, 1], {...clamp, easing: easeInOut});
		return (
			<AbsoluteFill style={{translate: `${-t * 140}px 0`}}>{children}</AbsoluteFill>
		);
	}
	const lead = interpolate(p, [0, 0.42], [0, 100], {...clamp, easing: easeInOut});
	const cover = interpolate(p, [0.04, 0.5], [0, 100], {...clamp, easing: easeInOut});
	const reveal = interpolate(p, [0.5, 0.92], [0, 100], {...clamp, easing: easeInOut});
	const trail = interpolate(p, [0.56, 1], [0, 100], {...clamp, easing: easeInOut});
	const enter = interpolate(p, [0.5, 1], [0, 1], {...clamp, easing: easeOut});
	return (
		<AbsoluteFill>
			<AbsoluteFill
				style={{opacity: p >= 0.5 ? 1 : 0, translate: `${(1 - enter) * 180}px 0`}}
			>
				{children}
			</AbsoluteFill>
			<AbsoluteFill
				style={{
					background: c.lineStrong,
					clipPath: `inset(0 ${100 - lead}% 0 ${trail}%)`,
				}}
			/>
			<AbsoluteFill
				style={{
					background: c.ink,
					clipPath: `inset(0 ${100 - cover}% 0 ${reveal}%)`,
				}}
			/>
		</AbsoluteFill>
	);
};

// Zoom: la escena se acerca y se desenfoca; la nueva llega de atrás.
const ZoomThrough: React.FC<TransitionPresentationComponentProps<NoProps>> = ({
	children,
	presentationDirection,
	presentationProgress: p,
}) => {
	if (presentationDirection === 'exiting') {
		const t = interpolate(p, [0, 0.7], [0, 1], {
			...clamp,
			easing: Easing.in(Easing.cubic),
		});
		return (
			<AbsoluteFill
				style={{
					opacity: 1 - t,
					scale: `${1 + t * 0.3}`,
					filter: blurFx(t * 16),
				}}
			>
				{children}
			</AbsoluteFill>
		);
	}
	const t = interpolate(p, [0.3, 1], [0, 1], {...clamp, easing: easeOut});
	return (
		<AbsoluteFill
			style={{
				opacity: t,
				scale: `${0.86 + 0.14 * t}`,
				filter: blurFx((1 - t) * 16),
			}}
		>
			{children}
		</AbsoluteFill>
	);
};

export const inkWipe = (): TransitionPresentation<NoProps> => ({
	component: InkWipe,
	props: {},
});

export const zoomThrough = (): TransitionPresentation<NoProps> => ({
	component: ZoomThrough,
	props: {},
});
