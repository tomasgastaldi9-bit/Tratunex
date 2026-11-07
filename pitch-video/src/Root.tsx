import React from 'react';
import {Composition} from 'remotion';
import {Pitch, PITCH_DURATION} from './Pitch';

export const RemotionRoot: React.FC = () => (
	<Composition
		id="Pitch"
		component={Pitch}
		durationInFrames={PITCH_DURATION}
		fps={30}
		width={1920}
		height={1080}
	/>
);
