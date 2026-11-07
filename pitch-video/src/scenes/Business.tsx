// Modelo de negocio: cómo gana plata Tratunex. Son precios propuestos (todavía no
// hay clientes pagando) y la tarjeta lo dice.
import React from 'react';
import {Appear, CardIn, Check, CountUp} from '../anim';
import {c} from '../theme';
import {Card, StepShell} from '../ui';

const Plan: React.FC<{
	name: string;
	price: number;
	features: string[];
	delay: number;
	dark?: boolean;
}> = ({name, price, features, delay, dark = false}) => (
	<Appear delay={delay} y={40} sfx="click" style={{height: '100%'}}>
		<div
			style={{
				height: '100%',
				boxSizing: 'border-box',
				borderRadius: 14,
				padding: '26px 28px',
				background: dark ? c.ink : c.wash,
				color: dark ? '#ffffff' : c.ink,
			}}
		>
			<div style={{fontSize: 24, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: dark ? c.gray400 : c.subtle}}>
				{name}
			</div>
			<div style={{display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10}}>
				<div style={{fontSize: 72, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1}}>
					US$ <CountUp to={price} delay={delay + 6} dur={26} />
				</div>
				<div style={{fontSize: 28, fontWeight: 600, color: dark ? c.gray400 : c.subtle}}>/ mes</div>
			</div>
			<div style={{marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8}}>
				{features.map((f, i) => (
					<div key={f} style={{display: 'flex', alignItems: 'center', gap: 10, fontSize: 28, fontWeight: 600}}>
						<Check delay={delay + 14 + i * 6} size={30} color={dark ? c.gray400 : c.muted} />
						{f}
					</div>
				))}
			</div>
		</div>
	</Appear>
);

const Row: React.FC<{label: string; delay: number; children: React.ReactNode}> = ({label, delay, children}) => (
	<Appear delay={delay} x={50} y={0} sfx="click">
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				padding: '18px 0',
				borderTop: `2px solid ${c.line}`,
			}}
		>
			<div style={{fontSize: 34, fontWeight: 500, color: c.muted}}>{label}</div>
			<div style={{fontSize: 38, fontWeight: 700}}>{children}</div>
		</div>
	</Appear>
);

export const Business: React.FC<{dur: number}> = ({dur}) => (
	<StepShell
		dur={dur}
		label="Modelo de negocio"
		kicker="Modelo de negocio"
		title={['Cómo ganamos', 'plata.']}
		subtitle="Suscripción mensual, llamadas extra y una comisión chica por pago."
	>
		<CardIn delay={16}>
			<Card badge="Precio propuesto">
				<div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'stretch'}}>
					<Plan name="Plan Pyme" price={29} features={['Hasta 20 compras', '60 llamadas']} delay={30} />
					<Plan
						name="Plan Crecimiento"
						price={79}
						features={['Compras ilimitadas', '250 llamadas', 'Seguimiento']}
						delay={42}
						dark
					/>
				</div>
				<div style={{marginTop: 26}}>
					<Row label="Llamadas extra" delay={70}>
						US$ 0,50 c/u
					</Row>
					<Row label="Comisión por pago" delay={84}>
						0,5 % con tope
					</Row>
					<Appear delay={100} y={10}>
						<div style={{fontSize: 28, fontWeight: 500, color: c.subtle, paddingTop: 6}}>
							A futuro, compartida con Belo cuando el proveedor cobre ahí.
						</div>
					</Appear>
				</div>
			</Card>
		</CardIn>
	</StepShell>
);
