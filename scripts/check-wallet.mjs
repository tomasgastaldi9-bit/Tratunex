import { createPublicClient, http, isAddress } from "viem";
import { base } from "viem/chains";
import { inspectWallet } from "../src/features/payments/wallet-check.ts";

const address = process.argv[2];
const token = process.env.ARGT_TOKEN_ADDRESS;
const rpc = process.env.PAYMENT_RPC_URL;
if (process.env.PAYMENT_CHAIN !== "base" || !address || !isAddress(address) || !token || !isAddress(token) || !rpc) {
  console.error("Configurá PAYMENT_CHAIN=base, ARGT_TOKEN_ADDRESS y PAYMENT_RPC_URL y pasá una dirección pública como argumento.");
  process.exit(1);
}
try {
  const client = createPublicClient({ chain: base, transport: http(rpc, { timeout: 10000, retryCount: 0 }) });
  const result = await inspectWallet(client, address, token);
  console.log(JSON.stringify(result, null, 2));
} catch {
  // RPC URLs can contain secrets; never print the provider's raw error.
  console.error("No se pudo verificar la billetera, la red o el contrato ARGt.");
  process.exit(1);
}
