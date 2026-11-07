// Los 5 pasos del recorrido de la demo (docs/BRIEF.md §1 y §4).
// Todo valor de ejemplo va dentro de una tarjeta rotulada "Datos de prueba".
import {noise2D} from '@remotion/noise';
import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {
	Appear,
	CardIn,
	Check,
	clamp,
	CountUp,
	DrawLine,
	easeInOut,
	progress,
	RiseText,
	Typewriter,
} from '../anim';
import {Sfx} from '../sfx';
import {c, font, mono} from '../theme';
import {Avatar, Card, Chip, StepShell} from '../ui';

const TEST = 'Datos de prueba';
const CONCEPT = 'Concepto · datos de prueba';

const Label: React.FC<{children: React.ReactNode}> = ({children}) => (
	<div style={{fontSize: 26, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: c.subtle}}>
		{children}
	</div>
);

const CardTitle: React.FC<{children: React.ReactNode; right?: React.ReactNode}> = ({children, right}) => (
	<div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32}}>
		<div style={{fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em'}}>{children}</div>
		{right}
	</div>
);

// ---------- Paso 1: necesidad y reglas ----------

const Field: React.FC<{label: string; value: string; delay: number}> = ({label, value, delay}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const focused = frame >= delay - 4 && frame < delay + (value.length / 30) * fps + 12;
	return (
		<div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
			<Label>{label}</Label>
			<div
				style={{
					border: `2px solid ${focused ? c.ink : c.line}`,
					borderRadius: 12,
					padding: '16px 24px',
					fontSize: 44,
					fontWeight: 600,
					minHeight: 88,
					boxSizing: 'border-box',
				}}
			>
				<Typewriter text={value} delay={delay} caret={focused} />
			</div>
		</div>
	);
};

export const Need: React.FC<{dur: number}> = ({dur}) => (
	<StepShell
		dur={dur}
		step={1}
		kicker="Paso 1 · Vos"
		title={['Cargás qué', 'necesitás y', 'tus reglas.']}
		subtitle="Si una compra se pasa, el agente te pide aprobación."
	>
		<CardIn delay={16}>
			<Card badge={TEST}>
				<CardTitle>Nueva compra</CardTitle>
				<div style={{display: 'flex', flexDirection: 'column', gap: 24}}>
					<Field label="Qué necesitás" value="500 vasos descartables" delay={36} />
					<div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24}}>
						<Field label="Para cuándo" value="El lunes" delay={74} />
						<Field label="Presupuesto" value="$ 150.000" delay={92} />
					</div>
				</div>
				<DrawLine delay={122} style={{margin: '36px 0 28px'}} />
				<Appear delay={128} y={16}>
					<div style={{fontSize: 34, fontWeight: 700, marginBottom: 18}}>Tus reglas</div>
				</Appear>
				<Appear delay={142} y={16} sfx="click">
					<div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0'}}>
						<div style={{fontSize: 38, fontWeight: 500, color: c.muted}}>Paga solo hasta</div>
						<div style={{fontSize: 46, fontWeight: 700}}>
							$ <CountUp to={120000} delay={146} />
						</div>
					</div>
				</Appear>
				<Appear delay={170} y={16} sfx="switch">
					<div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0'}}>
						<div style={{fontSize: 38, fontWeight: 500, color: c.muted}}>Si se pasa</div>
						<Chip tone="warning">Te pide aprobación</Chip>
					</div>
				</Appear>
			</Card>
		</CardIn>
	</StepShell>
);

// ---------- Paso 2: buscar proveedores ----------

const Magnifier: React.FC = () => (
	<svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth={2.4} strokeLinecap="round">
		<circle cx="10.5" cy="10.5" r="6.5" />
		<path d="M15.5 15.5 L21 21" />
	</svg>
);

const SearchStatus: React.FC<{doneAt: number}> = ({doneAt}) => {
	const frame = useCurrentFrame();
	if (frame >= doneAt) {
		return (
			<Appear delay={doneAt} dur={14} y={0} from={0.7} sfx="switch">
				<Chip tone="success">3 encontrados</Chip>
			</Appear>
		);
	}
	return (
		<div style={{display: 'flex', gap: 8}}>
			{[0, 1, 2].map((i) => (
				<div
					key={i}
					style={{
						width: 14,
						height: 14,
						borderRadius: 7,
						background: c.gray400,
						opacity: 0.3 + 0.7 * Math.max(0, Math.sin((frame - i * 5) / 5)),
					}}
				/>
			))}
		</div>
	);
};

const ScanBar: React.FC<{from: number; to: number}> = ({from, to}) => {
	const frame = useCurrentFrame();
	const visible = frame >= from && frame < to;
	const x = ((frame - from) % 30) / 30;
	return (
		<div style={{height: 6, borderRadius: 3, overflow: 'hidden', background: visible ? c.wash : 'transparent', margin: '14px 4px 0'}}>
			<div style={{width: '30%', height: '100%', background: c.ink, translate: `${-100 + x * 433}% 0`, opacity: visible ? 1 : 0}} />
		</div>
	);
};

export const Search: React.FC<{dur: number}> = ({dur}) => {
	const found = 110;
	const results = [
		{l: 'A', name: 'Proveedor A', src: 'Fuente: sitio web'},
		{l: 'B', name: 'Proveedor B', src: 'Fuente: directorio de empresas'},
		{l: 'C', name: 'Proveedor C', src: 'Fuente: sitio web'},
	];
	return (
		<StepShell
			dur={dur}
			step={2}
			kicker="Paso 2 · Búsqueda"
			title={['Busca', 'proveedores', 'por vos.']}
			subtitle="En la web, con la fuente de cada uno."
		>
			<CardIn delay={16}>
				<Card badge={TEST}>
					<CardTitle>Proveedores</CardTitle>
					<div style={{border: `2px solid ${c.line}`, borderRadius: 12, padding: '20px 26px', display: 'flex', alignItems: 'center', gap: 20}}>
						<Magnifier />
						<div style={{fontSize: 40, fontWeight: 600, flex: 1, whiteSpace: 'nowrap'}}>
							<Typewriter text="vasos descartables" delay={30} caret={false} />
						</div>
						<SearchStatus doneAt={found} />
					</div>
					<ScanBar from={58} to={found} />
					<div style={{marginTop: 20}}>
						{results.map((r, i) => (
							<Appear key={r.l} delay={found + 6 + i * 12} x={70} y={0} sfx="click">
								<div style={{display: 'flex', alignItems: 'center', gap: 26, padding: '20px 0', borderBottom: i < 2 ? `2px solid ${c.line}` : undefined}}>
									<Avatar letter={r.l} />
									<div style={{flex: 1}}>
										<div style={{fontSize: 42, fontWeight: 700, letterSpacing: '-0.01em'}}>{r.name}</div>
										<div style={{fontSize: 30, fontWeight: 500, color: c.subtle, marginTop: 4}}>{r.src}</div>
									</div>
									<Check delay={found + 18 + i * 12} size={48} />
								</div>
							</Appear>
						))}
					</div>
				</Card>
			</CardIn>
		</StepShell>
	);
};

// ---------- Paso 3: llamar y pedir cotización ----------

const CONNECT = 64;
const AGENT_TALK: [number, number] = [84, 150];
const SUPPLIER_TALK: [number, number] = [164, 214];
const SAVED = 238;

const Waveform: React.FC = () => {
	const frame = useCurrentFrame();
	const speaking = (r: [number, number]) =>
		interpolate(frame, [r[0] - 6, r[0] + 4, r[1] - 4, r[1] + 6], [0, 1, 1, 0], clamp);
	const amp = Math.max(speaking(AGENT_TALK), speaking(SUPPLIER_TALK));
	const live = frame >= CONNECT && frame < SAVED;
	return (
		<div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 84}}>
			{new Array(40).fill(0).map((_, i) => {
				const n = Math.abs(noise2D('wave', i * 0.22, frame * 0.08));
				const center = 1 - Math.abs(i - 19.5) / 26;
				const h = 6 + (live ? amp * n * center * 150 : 0);
				return <div key={i} style={{width: 9, height: Math.min(84, h), borderRadius: 5, background: amp > 0.1 && live ? c.ink : c.lineStrong}} />;
			})}
		</div>
	);
};

const RingPulse: React.FC = () => {
	const frame = useCurrentFrame();
	if (frame >= CONNECT) return null;
	return (
		<>
			{[0, 12].map((o) => {
				const t = ((frame + o) % 24) / 24;
				return (
					<div
						key={o}
						style={{
							position: 'absolute',
							inset: 0,
							borderRadius: 14,
							border: `3px solid ${c.gray400}`,
							scale: `${1 + t * 0.7}`,
							opacity: 1 - t,
						}}
					/>
				);
			})}
		</>
	);
};

const CallStatus: React.FC = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	if (frame < CONNECT) return <Chip tone="warning">Llamando…</Chip>;
	if (frame < SAVED) {
		const s = Math.floor(((frame - CONNECT) / fps) * 2.4);
		return <Chip tone="neutral">En llamada 0:{String(s).padStart(2, '0')}</Chip>;
	}
	return (
		<Appear delay={SAVED} dur={14} y={0} from={0.7} sfx="switch">
			<Chip tone="success">Cotización guardada</Chip>
		</Appear>
	);
};

const Bubble: React.FC<{who: string; text: string; delay: number; right?: boolean}> = ({who, text, delay, right}) => (
	<Appear delay={delay - 4} y={30} sfx="click" style={{display: 'flex', justifyContent: right ? 'flex-end' : 'flex-start'}}>
		<div
			style={{
				maxWidth: 680,
				background: right ? c.surface : c.wash,
				border: right ? `2px solid ${c.line}` : '2px solid transparent',
				borderRadius: 16,
				padding: '18px 26px',
			}}
		>
			<Label>{who}</Label>
			<div style={{fontSize: 36, fontWeight: 500, lineHeight: 1.3, marginTop: 6, minHeight: 94}}>
				<Typewriter text={text} delay={delay} cps={34} caret={false} />
			</div>
		</div>
	</Appear>
);

export const Call: React.FC<{dur: number}> = ({dur}) => (
	<StepShell
		dur={dur}
		step={3}
		kicker="Paso 3 · Llamada con Vapi"
		title={['Llama y pide', 'cotización.']}
		subtitle="Habla con el proveedor y anota precio y entrega."
	>
		<CardIn delay={16}>
			<Card badge={TEST}>
				<div style={{display: 'flex', alignItems: 'center', gap: 24}}>
					<div style={{position: 'relative'}}>
						<RingPulse />
						<Avatar letter="A" />
					</div>
					<div style={{flex: 1}}>
						<div style={{fontSize: 42, fontWeight: 700}}>Proveedor A</div>
						<div style={{fontSize: 28, fontWeight: 500, color: c.subtle}}>Llamada del agente</div>
					</div>
					<CallStatus />
				</div>
				<div style={{margin: '26px 0'}}>
					<Waveform />
				</div>
				<div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
					<Bubble who="Agente" text="Hola, necesito 500 vasos para el lunes. ¿Qué precio tienen?" delay={AGENT_TALK[0]} />
					<Bubble who="Proveedor" text="Son $ 118.000 con envío. Llegan el viernes." delay={SUPPLIER_TALK[0]} right />
				</div>
				<Appear delay={SAVED + 6} y={20}>
					<div style={{display: 'flex', alignItems: 'center', gap: 16, marginTop: 26, paddingTop: 22, borderTop: `2px solid ${c.line}`, fontSize: 38, fontWeight: 700}}>
						<Check delay={SAVED + 10} size={44} />
						Precio $ 118.000 · Entrega el viernes
					</div>
				</Appear>
			</Card>
		</CardIn>
	</StepShell>
);

// ---------- Paso 4: comparar y explicar ----------

const SORT_AT = 112;
const PICK_AT = 156;
const ROW_H = 112;

type Quote = {l: string; price: number; when: string; start: number; end: number; note: string};
const QUOTES: Quote[] = [
	{l: 'B', price: 109000, when: 'Entrega el martes', start: 0, end: 1, note: 'Llega tarde'},
	{l: 'C', price: 162000, when: 'Entrega el lunes', start: 1, end: 2, note: 'Supera el presupuesto'},
	{l: 'A', price: 118000, when: 'Entrega el viernes', start: 2, end: 0, note: ''},
];

const QuoteRow: React.FC<{q: Quote}> = ({q}) => {
	const frame = useCurrentFrame();
	const sort = progress(frame, SORT_AT, 34, easeInOut);
	const top = interpolate(sort, [0, 1], [q.start * ROW_H, q.end * ROW_H]);
	const chosen = q.l === 'A';
	const pick = chosen ? progress(frame, PICK_AT, 14) : 0;
	return (
		<div style={{position: 'absolute', left: 0, right: 0, top, height: ROW_H - 14}}>
			<Appear delay={22 + q.start * 10} x={70} y={0} sfx="click" style={{height: '100%'}}>
				<div
					style={{
						height: '100%',
						boxSizing: 'border-box',
						display: 'flex',
						alignItems: 'center',
						gap: 22,
						padding: '0 24px',
						borderRadius: 14,
						border: `${chosen ? 3 : 2}px solid ${pick > 0.5 ? c.ink : c.line}`,
						background: c.surface,
						scale: `${1 + pick * 0.02}`,
					}}
				>
					<div style={{flex: 1, minWidth: 0, whiteSpace: 'nowrap'}}>
						<div style={{fontSize: 36, fontWeight: 700}}>Proveedor {q.l}</div>
						<div style={{fontSize: 26, fontWeight: 500, color: c.subtle}}>{q.when}</div>
					</div>
					<div style={{fontSize: 40, fontWeight: 700, minWidth: 200, textAlign: 'right'}}>
						$ <CountUp to={q.price} delay={30 + q.start * 10} dur={30} />
					</div>
					<div style={{width: 200, display: 'flex', justifyContent: 'flex-end'}}>
						{chosen ? (
							frame >= PICK_AT ? (
								<Appear delay={PICK_AT} dur={14} y={0} from={0.6} sfx="switch">
									<Chip tone="success">Elegida</Chip>
								</Appear>
							) : null
						) : (
							<Appear delay={PICK_AT + 10 + q.start * 6} y={10}>
								<div style={{fontSize: 26, fontWeight: 600, color: c.subtle, textAlign: 'right', lineHeight: 1.2}}>{q.note}</div>
							</Appear>
						)}
					</div>
				</div>
			</Appear>
		</div>
	);
};

export const Compare: React.FC<{dur: number}> = ({dur}) => (
	<StepShell
		dur={dur}
		step={4}
		kicker="Paso 4 · IA"
		title={['Compara y', 'te explica', 'por qué.']}
		subtitle="Elige según tus reglas, no solo por precio."
	>
		<CardIn delay={16}>
			<Card badge={CONCEPT}>
				<CardTitle right={<div style={{fontSize: 30, fontWeight: 600, color: c.subtle}}>3 cotizaciones</div>}>
					Ranking
				</CardTitle>
				<div style={{position: 'relative', height: ROW_H * 3 - 14}}>
					{QUOTES.map((q) => (
						<QuoteRow key={q.l} q={q} />
					))}
				</div>
				<Appear delay={186} y={30} sfx="whoosh" style={{marginTop: 28}}>
					<div style={{background: c.wash, borderRadius: 14, padding: '24px 30px'}}>
						<Label>Por qué</Label>
						<div style={{fontSize: 34, fontWeight: 500, lineHeight: 1.35, marginTop: 8, minHeight: 138}}>
							<Typewriter
								text="Elegí a Proveedor A: llega antes del lunes y entra en tu presupuesto. B es más barato, pero llega tarde."
								delay={192}
								cps={44}
							/>
						</div>
					</div>
				</Appear>
			</Card>
		</CardIn>
	</StepShell>
);

// ---------- Paso 5: pagar en ARGt ----------

const SEND_AT = 150;
const CONFIRM_AT = 228;

const PayStatus: React.FC = () => {
	const frame = useCurrentFrame();
	if (frame < SEND_AT) return <Chip tone="warning">Pendiente</Chip>;
	if (frame < CONFIRM_AT) return <Chip tone="neutral">Enviando…</Chip>;
	return (
		<Appear delay={CONFIRM_AT} dur={14} y={0} from={0.6} sfx="switch">
			<Chip tone="success">Confirmado</Chip>
		</Appear>
	);
};

const SendBar: React.FC = () => {
	const frame = useCurrentFrame();
	const t = progress(frame, SEND_AT, CONFIRM_AT - SEND_AT, easeInOut);
	return (
		<div style={{height: 10, borderRadius: 5, background: c.wash, overflow: 'hidden', margin: '26px 0 10px'}}>
			<div style={{height: '100%', background: frame >= CONFIRM_AT ? c.success : c.ink, scale: `${t} 1`, transformOrigin: 'left center'}} />
		</div>
	);
};

const PayRow: React.FC<{label: string; delay: number; children: React.ReactNode}> = ({label, delay, children}) => (
	<Appear delay={delay} x={50} y={0} sfx="click">
		<div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 0', borderTop: `2px solid ${c.line}`}}>
			<div style={{fontSize: 34, fontWeight: 500, color: c.muted}}>{label}</div>
			<div style={{display: 'flex', alignItems: 'center', gap: 14, fontSize: 38, fontWeight: 700}}>{children}</div>
		</div>
	</Appear>
);

const TxHash: React.FC = () => {
	const frame = useCurrentFrame();
	if (frame < CONFIRM_AT) {
		const x = ((frame % 36) / 36) * 100;
		return (
			<div style={{width: 300, height: 34, borderRadius: 8, background: c.wash, overflow: 'hidden'}}>
				<div style={{width: '35%', height: '100%', background: c.line, translate: `${-100 + x * 3.9}% 0`}} />
			</div>
		);
	}
	return (
		<>
			<span style={{fontFamily: mono, fontWeight: 600}}>
				<Typewriter text="0x7a3f…c91e" delay={CONFIRM_AT + 4} cps={40} caret={false} />
			</span>
			<Appear delay={CONFIRM_AT + 14} y={0} x={-10}>
				<svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke={c.muted} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
					<path d="M8 16 L16 8 M9 8 H16 V15" />
				</svg>
			</Appear>
		</>
	);
};

export const Pay: React.FC<{dur: number}> = ({dur}) => (
	<>
	<StepShell
		dur={dur}
		step={5}
		kicker="Paso 5 · Twin + Belo"
		title={['Paga en ARGt,', 'con tus reglas.']}
		subtitle="Cada pago deja una transacción verificable en Arbitrum One."
	>
		<CardIn delay={16}>
			<Card badge={CONCEPT}>
				<CardTitle right={<PayStatus />}>Pago a Proveedor A</CardTitle>
				<div style={{background: c.ink, color: '#ffffff', borderRadius: 14, padding: '28px 36px'}}>
					<div style={{display: 'flex', alignItems: 'baseline', gap: 20}}>
						<div style={{fontSize: 108, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1}}>
							<CountUp to={118000} delay={28} dur={40} />
						</div>
						<div style={{fontSize: 50, fontWeight: 700, color: c.gray400}}>ARGt</div>
					</div>
					<Appear delay={56} y={10}>
						<div style={{fontSize: 30, fontWeight: 500, color: c.gray400, marginTop: 12}}>1 ARGt ≈ 1 peso argentino</div>
					</Appear>
				</div>
				<SendBar />
				<PayRow label="Tus reglas" delay={76}>
					<Check delay={96} size={44} />
					<span style={{color: c.success}}>Bajo $ 120.000: paga solo</span>
				</PayRow>
				<PayRow label="Equivalente según Belo" delay={92}>
					≈ <CountUp to={71.43} delay={98} dur={30} decimals={2} /> USDT
				</PayRow>
				<PayRow label="Red" delay={108}>
					Arbitrum One
				</PayRow>
				<PayRow label="Transacción" delay={124}>
					<TxHash />
				</PayRow>
			</Card>
		</CardIn>
	</StepShell>
	<PayTakeover />
	</>
);

// Cierre del pago a pantalla completa: un círculo negro se abre desde la tarjeta.
const TAKE = CONFIRM_AT + 44;
// La presentación en vivo frena justo antes de este momento (ver STOPS en Pitch.tsx).
export const PAY_TAKEOVER_AT = TAKE;

const PayTakeover: React.FC = () => {
	const frame = useCurrentFrame();
	if (frame < TAKE) return null;
	const r = progress(frame, TAKE, 20, easeInOut) * 160;
	return (
		<AbsoluteFill
			style={{
				background: c.ink,
				color: '#ffffff',
				fontFamily: font,
				clipPath: `circle(${r}% at 72% 50%)`,
				alignItems: 'center',
				justifyContent: 'center',
				flexDirection: 'column',
				gap: 34,
			}}
		>
			<Sfx at={TAKE} name="whoosh" />
			<Sfx at={TAKE + 12} name="ding" />
			<div
				style={{
					position: 'absolute',
					top: 90,
					border: `2px dashed ${c.subtle}`,
					color: c.gray400,
					borderRadius: 10,
					padding: '8px 22px',
					fontSize: 26,
					fontWeight: 700,
					letterSpacing: '0.06em',
					textTransform: 'uppercase',
				}}
			>
				Concepto · datos de prueba
			</div>
			<Appear delay={TAKE + 8} y={0} from={0.4}>
				<div style={{width: 150, height: 150, borderRadius: 75, background: c.success, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
					<Check delay={TAKE + 14} size={112} color="#ffffff" stroke={3} />
				</div>
			</Appear>
			<RiseText
				lines={['Pago confirmado.']}
				delay={TAKE + 12}
				align="center"
				style={{fontSize: 140, fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1.05}}
			/>
			<Appear delay={TAKE + 26} y={20}>
				<div style={{fontSize: 46, fontWeight: 600, color: c.gray400}}>
					118.000 ARGt · Arbitrum One ·{' '}
					<span style={{fontFamily: mono, color: '#ffffff'}}>0x7a3f…c91e</span>
				</div>
			</Appear>
		</AbsoluteFill>
	);
};
