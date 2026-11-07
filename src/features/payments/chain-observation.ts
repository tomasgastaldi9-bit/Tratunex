import type { Address, Hex } from "viem";
import { verifyTransferReceipt } from "./receipt-check";
import { TWIN_ARGT_ARBITRUM } from "./wallet-check";

type Receipt = { transactionHash: Hex; from: Address; to: Address | null; status: "success" | "reverted"; blockNumber: bigint; logs: readonly { address: Address; topics: readonly Hex[]; data: Hex }[] };
type Reader = { getChainId: () => Promise<number>; getReceipt: (hash: Hex) => Promise<Receipt | null>; getBlockNumber: () => Promise<bigint> };
type Observation = { state: "unknown" | "inconsistent" } | { state: "observed_success" | "observed_revert"; confirmations: string };

/** Read-only observation. The caller must verify the signed transaction, receipt provenance and finality separately. */
export async function observePayment(expected: { hash: Hex; sender: Address; recipient: Address; amount: bigint }, reader: Reader): Promise<Observation> {
  try {
    if (!/^0x[0-9a-fA-F]{64}$/.test(expected.hash) || await reader.getChainId() !== 42161) return { state: "unknown" };
    const receipt = await reader.getReceipt(expected.hash);
    if (!receipt) return { state: "unknown" };
    if (receipt.transactionHash.toLowerCase() !== expected.hash.toLowerCase() || receipt.from.toLowerCase() !== expected.sender.toLowerCase() || receipt.to?.toLowerCase() !== TWIN_ARGT_ARBITRUM.toLowerCase()) return { state: "inconsistent" };
    const latest = await reader.getBlockNumber();
    if (latest < receipt.blockNumber) return { state: "unknown" };
    const confirmations = (latest - receipt.blockNumber + BigInt(1)).toString();
    if (receipt.status === "reverted") return { state: "observed_revert", confirmations };
    if (!verifyTransferReceipt(receipt, { token: TWIN_ARGT_ARBITRUM, sender: expected.sender, recipient: expected.recipient, amount: expected.amount })) return { state: "inconsistent" };
    return { state: "observed_success", confirmations };
  } catch { return { state: "unknown" }; }
}
