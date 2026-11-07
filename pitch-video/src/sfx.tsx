// Sonidos de entrada (solo cuando algo aparece). Biblioteca oficial de Remotion.
import {Audio} from '@remotion/media';
import React from 'react';
import {Sequence} from 'remotion';

const SRC = {
	whoosh: 'https://remotion.media/whoosh.wav',
	whip: 'https://remotion.media/whip.wav',
	click: 'https://remotion.media/mouse-click.wav',
	switch: 'https://remotion.media/switch.wav',
	ding: 'https://remotion.media/ding.wav',
} as const;

const VOL: Record<SfxName, number> = {
	whoosh: 0.55,
	whip: 0.5,
	click: 0.3,
	switch: 0.35,
	ding: 0.4,
};

export type SfxName = keyof typeof SRC;

export const Sfx: React.FC<{at: number; name: SfxName; volume?: number}> = ({
	at,
	name,
	volume,
}) => (
	<Sequence from={Math.round(at)} durationInFrames={50} layout="none" name={`Sonido: ${name}`}>
		<Audio src={SRC[name]} volume={volume ?? VOL[name]} />
	</Sequence>
);
