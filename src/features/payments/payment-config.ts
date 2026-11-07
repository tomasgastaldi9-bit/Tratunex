import { privateKeyToAccount } from "viem/accounts";
import { TWIN_ARGT_ARBITRUM } from "./wallet-check";

/** Internal only: never serialize or log the parsed result. */
export function parsePaymentConfig(env: Record<string, string | undefined>): { ok: true; rpcUrl: string; privateKey: `0x${string}`; encryptionKey: Uint8Array; limits: { gas: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; maxTotalFee: bigint } } | { ok: false } {
  try {
    const privateKey = env.AGENT_WALLET_PRIVATE_KEY, encryption = env.PAYMENT_ENCRYPTION_KEY, rpcUrl = env.PAYMENT_RPC_URL;
    if (env.PAYMENT_CHAIN !== "arbitrum" || env.ARGT_TOKEN_ADDRESS?.toLowerCase() !== TWIN_ARGT_ARBITRUM.toLowerCase() || !rpcUrl || new URL(rpcUrl).protocol !== "https:" || !privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey) || !encryption || !/^[0-9a-fA-F]{64}$/.test(encryption) || privateKey.slice(2).toLowerCase() === encryption.toLowerCase()) return { ok: false };
    privateKeyToAccount(privateKey as `0x${string}`);
    const amounts = [env.PAYMENT_GAS_LIMIT, env.PAYMENT_MAX_FEE_PER_GAS_WEI, env.PAYMENT_MAX_PRIORITY_FEE_PER_GAS_WEI, env.PAYMENT_MAX_TOTAL_FEE_WEI];
    if (amounts.some(value => !value || !/^(0|[1-9]\d{0,77})$/.test(value))) return { ok: false };
    const [gas, maxFeePerGas, maxPriorityFeePerGas, maxTotalFee] = amounts.map(value => BigInt(value!));
    const uint256 = BigInt(2) ** BigInt(256);
    if (gas <= BigInt(0) || maxFeePerGas <= BigInt(0) || maxPriorityFeePerGas > maxFeePerGas || maxTotalFee <= BigInt(0) || amounts.some(value => BigInt(value!) >= uint256) || gas * maxFeePerGas > maxTotalFee) return { ok: false };
    return { ok: true, rpcUrl, privateKey: privateKey as `0x${string}`, encryptionKey: Uint8Array.from(Buffer.from(encryption, "hex")), limits: { gas, maxFeePerGas, maxPriorityFeePerGas, maxTotalFee } };
  } catch { return { ok: false }; }
}
