// "El problema" y "Lo que viene": listas grandes con líneas que se dibujan.
import React from 'react';
import {Appear, DrawLine, Mark, Strike} from '../anim';
import {c} from '../theme';
import {StepShell} from '../ui';

const Row: React.FC<{
	n: number;
	delay: number;
	strikeAt?: number;
	children: string;
}> = ({n, delay, strikeAt, children}) => (
	<div>
		<Appear delay={delay} x={60} y={0} sfx="click">
			<div style={{display: 'flex', alignItems: 'baseline', gap: 36, padding: '30px 0'}}>
				<div
					style={{
						fontSize: 34,
						fontWeight: 700,
						color: c.gray400,
						fontVariantNumeric: 'tabular-nums',
						width: 56,
						flexShrink: 0,
					}}
				>
					{String(n).padStart(2, '0')}
				</div>
				<div style={{fontSize: 54, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15}}>
					{strikeAt === undefined ? children : <Strike delay={strikeAt}>{children}</Strike>}
				</div>
			</div>
		</Appear>
		<DrawLine delay={delay + 4} />
	</div>
);

export const Problem: React.FC<{dur: number}> = ({dur}) => {
	const items = [
		'Buscar proveedores',
		'Llamar uno por uno',
		'Comparar en una planilla',
		'Pagar por transferencia',
	];
	return (
		<StepShell
			dur={dur}
			label="El problema"
			kicker="Hoy, en una pyme"
			title={['Comprar es', 'todo a mano.']}
			subtitle="Y le come tiempo al dueño en cada compra."
		>
			<div>
				{items.map((t, i) => (
					<Row key={t} n={i + 1} delay={34 + i * 14} strikeAt={150 + i * 8}>
						{t}
					</Row>
				))}
				<Appear delay={196} y={30} style={{marginTop: 48}}>
					<div style={{background: c.ink, color: '#ffffff', borderRadius: 16, padding: '30px 40px', fontSize: 56, fontWeight: 700, letterSpacing: '-0.03em'}}>
						Tratunex lo hace <Mark delay={214} color={c.gray700}>con un agente.</Mark>
					</div>
				</Appear>
			</div>
		</StepShell>
	);
};

export const Next: React.FC<{dur: number}> = ({dur}) => {
	const items = [
		'El proveedor cobra en Belo y pasa a pesos.',
		'Seguimiento de entrega, factura y atrasos.',
		'Verificación de cada proveedor.',
		'Compras que se repiten solas.',
	];
	return (
		<StepShell
			dur={dur}
			label="Lo que viene"
			kicker="Lo que viene"
			title={['Esto recién', 'empieza.']}
		>
			<div>
				{items.map((t, i) => (
					<Row key={t} n={i + 1} delay={30 + i * 16}>
						{t}
					</Row>
				))}
			</div>
		</StepShell>
	);
};
