// El video completo: 10 escenas unidas con transiciones. Empieza y termina en
// negro (gancho y cierre), así se puede repetir en loop sin salto.
import {linearTiming, TransitionSeries} from '@remotion/transitions';
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {Intro, Outro} from './scenes/Brand';
import {Business} from './scenes/Business';
import {Hook} from './scenes/Hook';
import {Next} from './scenes/Lists';
import {Call, Compare, Need, Pay, PAY_TAKEOVER_AT, Search} from './scenes/Steps';
import {c} from './theme';
import {inkWipe, zoomThrough} from './transitions';

// Duraciones en frames (30 fps).
const D = {
	hook: 165,
	intro: 165,
	need: 270,
	search: 240,
	call: 310,
	compare: 300,
	pay: 362,
	next: 240,
	business: 230,
	outro: 170,
};
const WIPE = 28;
const ZOOM = 22;

// Escenas en orden y la transición que sale de cada una.
const ORDER: [keyof typeof D, number][] = [
	['hook', ZOOM],
	['intro', WIPE],
	['need', ZOOM],
	['search', WIPE],
	['call', ZOOM],
	['compare', WIPE],
	['pay', ZOOM],
	['next', ZOOM],
	['business', WIPE],
	['outro', 0],
];

export const PITCH_DURATION = ORDER.reduce((sum, [key, out]) => sum + D[key] - out, 0);

// Dónde frena la presentación en vivo (presenter/): al final de cada escena,
// justo antes de su transición, y una vez más en el pago antes de "Pago confirmado".
export const STOPS: number[] = (() => {
	const stops: number[] = [];
	let start = 0;
	for (const [key, out] of ORDER) {
		if (key === 'pay') stops.push(start + PAY_TAKEOVER_AT - 2);
		// El cierre frena con el logo a la vista, antes de fundirse a negro.
		stops.push(out ? start + D[key] - out - 3 : start + D[key] - 32);
		start += D[key] - out;
	}
	return stops;
})();

const wipe = <TransitionSeries.Transition presentation={inkWipe()} timing={linearTiming({durationInFrames: WIPE})} />;
const zoom = <TransitionSeries.Transition presentation={zoomThrough()} timing={linearTiming({durationInFrames: ZOOM})} />;

export const Pitch: React.FC = () => (
	<AbsoluteFill style={{backgroundColor: c.canvas}}>
		<TransitionSeries>
			<TransitionSeries.Sequence name="Gancho" durationInFrames={D.hook}>
				<Hook dur={D.hook} />
			</TransitionSeries.Sequence>
			{zoom}
			<TransitionSeries.Sequence name="Marca" durationInFrames={D.intro}>
				<Intro dur={D.intro} />
			</TransitionSeries.Sequence>
			{wipe}
			<TransitionSeries.Sequence name="1 Necesidad y reglas" durationInFrames={D.need}>
				<Need dur={D.need} />
			</TransitionSeries.Sequence>
			{zoom}
			<TransitionSeries.Sequence name="2 Proveedores" durationInFrames={D.search}>
				<Search dur={D.search} />
			</TransitionSeries.Sequence>
			{wipe}
			<TransitionSeries.Sequence name="3 Llamada" durationInFrames={D.call}>
				<Call dur={D.call} />
			</TransitionSeries.Sequence>
			{zoom}
			<TransitionSeries.Sequence name="4 Comparar" durationInFrames={D.compare}>
				<Compare dur={D.compare} />
			</TransitionSeries.Sequence>
			{wipe}
			<TransitionSeries.Sequence name="5 Pago" durationInFrames={D.pay}>
				<Pay dur={D.pay} />
			</TransitionSeries.Sequence>
			{zoom}
			<TransitionSeries.Sequence name="Lo que viene" durationInFrames={D.next}>
				<Next dur={D.next} />
			</TransitionSeries.Sequence>
			{zoom}
			<TransitionSeries.Sequence name="Modelo de negocio" durationInFrames={D.business}>
				<Business dur={D.business} />
			</TransitionSeries.Sequence>
			{wipe}
			<TransitionSeries.Sequence name="Cierre" durationInFrames={D.outro}>
				<Outro dur={D.outro} />
			</TransitionSeries.Sequence>
		</TransitionSeries>
	</AbsoluteFill>
);
