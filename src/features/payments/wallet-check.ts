import { isAddress, type Address } from "viem";

/** Official Twin ARGt contract on Base mainnet (chain 8453). */
export const TWIN_ARGT_BASE = "0xf016413834E6D1A14F3D628B11D6Ef725a6bdbDD" as const;
export const ARGT_ABI = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;
type ReadClient = {
  getChainId(): Promise<number>;
  getBytecode(input: { address: Address }): Promise<`0x${string}` | undefined>;
  getBalance(input: { address: Address }): Promise<bigint>;
  readContract(input: { address: Address; abi: typeof ARGT_ABI; functionName: "symbol" | "decimals" | "balanceOf"; args?: readonly [Address] }): Promise<unknown>;
};

/** Read-only check; no key, signing or token movement is involved. */
export async function inspectWallet(client: ReadClient, wallet: Address, token: Address) {
  if (!isAddress(wallet) || !isAddress(token)) throw new Error("Dirección inválida.");
  if (token.toLowerCase() !== TWIN_ARGT_BASE.toLowerCase()) throw new Error("El contrato no coincide con Twin ARGt en Base.");
  const chainId = await client.getChainId();
  if (chainId !== 8453) throw new Error("La red configurada no es Base principal.");
  const code = await client.getBytecode({ address: token });
  if (!code || code === "0x") throw new Error("El contrato ARGt no tiene código en Base.");
  const [symbol, decimals, ethWei, argtAtomic] = await Promise.all([
    client.readContract({ address: token, abi: ARGT_ABI, functionName: "symbol" }),
    client.readContract({ address: token, abi: ARGT_ABI, functionName: "decimals" }),
    client.getBalance({ address: wallet }),
    client.readContract({ address: token, abi: ARGT_ABI, functionName: "balanceOf", args: [wallet] }),
  ]);
  if (symbol !== "ARGt" || decimals !== 18 || typeof argtAtomic !== "bigint") throw new Error("Los datos del contrato ARGt no coinciden.");
  return { chainId, wallet, token, ethWei: ethWei.toString(), argtAtomic: argtAtomic.toString() };
}
