# Tratunex

Agente de compras para pymes: busca proveedores, les pide cotización (incluso llamándolos), elige el mejor según las reglas del dueño y explica por qué. El objetivo de la demo incluye pagar en pesos digitales (**ARGt de Twin**) dentro de límites de gasto.

## Alcance del MVP (HackaTwin, 7/11)

El dueño carga qué necesita y sus reglas; el agente busca proveedores (Firecrawl), pide cotizaciones (llamadas con Vapi + Twilio) y compara y recomienda. La demo apunta a pagar en ARGt con una transacción verificable; **la integración de pago sigue en desarrollo**. La cotización ARS/USDT viene de la API pública de Belo. Detalle en [`docs/BRIEF.md`](docs/BRIEF.md).

## Pagos onchain (track de Twin)

| Dato | Valor |
|---|---|
| Token | ARGt (Twin Stablecoin, ERC-20, 18 decimales) |
| Red | Arbitrum One principal (chain ID 42161) |
| Contrato del token | [`0x59863989d080B22476DB95656d0C3CC18be92214`](https://arbiscan.io/token/0x59863989d080B22476DB95656d0C3CC18be92214) · [direcciones oficiales de Twin](https://docs.twin.finance/stablecoins/contracts) |
| Billetera del agente (pública) | [`0xD87f54a9bae54E4eE15A141D526532777F3D2c56`](https://arbiscan.io/address/0xD87f54a9bae54E4eE15A141D526532777F3D2c56) |
| Billetera del proveedor de demo (pública) | [`0x4E5F932Fa2D1BE48A4FC39a80CD2eC85C8AA5bB1`](https://arbiscan.io/address/0x4E5F932Fa2D1BE48A4FC39a80CD2eC85C8AA5bB1) |
| Transacción de la demo | **Pendiente:** se agregará el hash y el enlace a Arbiscan después de realizar y verificar el pago real. |

ARGt y ETH son activos reales: no publicar claves privadas ni frases de recuperación. Para verificar una dirección pública sin firmar ni transferir, configurar `PAYMENT_CHAIN`, `ARGT_TOKEN_ADDRESS` y `PAYMENT_RPC_URL` en el entorno y ejecutar `node --env-file-if-exists=.env.local scripts/check-wallet.mjs DIRECCION_PUBLICA`. El resultado expresa ETH en wei y ARGt en unidades enteras de 18 decimales; un saldo positivo no garantiza que alcance para el gas ni constituye una prueba de pago.

## Instalación y ejecución local

Se necesita Node.js 24 y npm. Desde la raíz del repositorio:

```bash
npm ci
```

Copiá `.env.example` a `.env.local`. Para el acceso configurá `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `NEXT_PUBLIC_APP_URL` (por ejemplo `http://localhost:3000`); necesitás un proyecto Supabase con las migraciones correspondientes y una cuenta habilitada. Las funciones de servidor y las integraciones externas pueden requerir sus propias credenciales, según el flujo. Las variables opcionales que no uses pueden quedar vacías. Los datos de ejemplo y los modos `mock` no prueban integraciones reales. Nunca subas `.env.local` ni claves al repositorio.

```bash
npm run dev
```

Abrí `http://localhost:3000`. Para ejecutar las pruebas unitarias: `npm test`. La configuración de servicios externos y la disponibilidad del flujo completo dependen del entorno; iniciar la aplicación no demuestra un pago onchain.

## Equipo

| Integrante | Responsabilidad |
|---|---|
| Tomás | Pagos en Twin, prospección de proveedores, plataforma y deploy |
| Vale | Necesidad de compra, reglas del dueño y elección con IA |
| Bautista | Cotización por llamada (voz) y precio de Belo |
| Nano | Proveedores, comparador de cotizaciones y órdenes de compra |

## Documentación del proyecto

- [Brief del MVP: alcance, contratos, ownership y tareas](docs/BRIEF.md)
- [Pitch: guion de 3 minutos, video de respaldo y entregas](docs/PITCH.md)
- [Guía para contribuir](CONTRIBUTING.md)
- [Flujo de desarrollo y coordinación](docs/DEVELOPMENT_WORKFLOW.md)

El brief es la fuente de verdad para stack, contratos, seguridad, responsabilidades e integraciones de la demo.
