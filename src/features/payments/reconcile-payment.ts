import type { Address, Hex } from "viem";
import { verifyTransferReceipt } from "./receipt-check";
import { validateTransfer } from "./payment-request";
import { TWIN_ARGT_ARBITRUM } from "./wallet-check";
type Expected = { hash: Hex; sender: Address; recipient: Address; amount: bigint };
type Receipt = { transactionHash: Hex; from: Address; to: Address | null; status: "success" | "reverted"; blockNumber: bigint; blockHash: Hex; logs: readonly { address: Address; topics: readonly Hex[]; data: Hex }[] };
type Reader = { getChainId: () => Promise<number>; getReceipt: (hash: Hex) => Promise<Receipt | null>; getFinalizedBlockNumber: () => Promise<bigint>; getBlockHash: (number: bigint) => Promise<Hex | null> };
/** Read-only observation. Requires a trusted RPC and separately verified signed bytes. */
export async function reconcilePayment(expected: Expected, reader: Reader): Promise<{ state: "unknown" | "pending" | "confirmed" | "reverted" }> {
  try {
    if (!/^0x[0-9a-fA-F]{64}$/.test(expected.hash) || !validateTransfer({ sender: expected.sender, destination: expected.recipient, amountAtomic: expected.amount.toString() }).ok || await reader.getChainId() !== 42161) return { state: "unknown" };
    const receipt = await reader.getReceipt(expected.hash);
    if (!receipt || receipt.transactionHash.toLowerCase() !== expected.hash.toLowerCase() || receipt.from.toLowerCase() !== expected.sender.toLowerCase() || receipt.to?.toLowerCase() !== TWIN_ARGT_ARBITRUM.toLowerCase() || receipt.blockNumber < BigInt(0) || !/^0x[0-9a-fA-F]{64}$/.test(receipt.blockHash)) return { state: "unknown" };
    if (receipt.status === "success" && !verifyTransferReceipt(receipt, { token: TWIN_ARGT_ARBITRUM, sender: expected.sender, recipient: expected.recipient, amount: expected.amount })) return { state: "unknown" };
    if (receipt.status !== "success" && receipt.status !== "reverted") return { state: "unknown" };
    const before = await reader.getBlockHash(receipt.blockNumber);
    const finalized = await reader.getFinalizedBlockNumber();
    const after = await reader.getBlockHash(receipt.blockNumber);
    if (!before || !after || before.toLowerCase() !== receipt.blockHash.toLowerCase() || after.toLowerCase() !== receipt.blockHash.toLowerCase() || finalized < BigInt(0)) return { state: "unknown" };
    if (finalized < receipt.blockNumber) return { state: "pending" };
    return { state: receipt.status === "success" ? "confirmed" : "reverted" };
  } catch { return { state: "unknown" }; }
}
