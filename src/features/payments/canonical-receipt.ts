import type { Hex } from "viem";

type Reader = { getBlockHash: (number: bigint) => Promise<Hex | null>; getBlockNumber: () => Promise<bigint> };
type Result = { state: "unknown" } | { state: "pending" | "depth_reached"; confirmations: string };

/** Depth is not L1 finality or proof that the RPC is honest. Never authorizes a resend. */
export async function inspectCanonicalReceipt(receipt: { blockNumber: bigint; blockHash: Hex }, reader: Reader, minimum: bigint): Promise<Result> {
  if (minimum < BigInt(1) || receipt.blockNumber < BigInt(0) || !/^0x[0-9a-fA-F]{64}$/.test(receipt.blockHash)) return { state: "unknown" };
  try {
    const first = await reader.getBlockHash(receipt.blockNumber);
    const head = await reader.getBlockNumber();
    const second = await reader.getBlockHash(receipt.blockNumber);
    if (!first || !second || first.toLowerCase() !== receipt.blockHash.toLowerCase() || second.toLowerCase() !== receipt.blockHash.toLowerCase() || head < receipt.blockNumber) return { state: "unknown" };
    const count = head - receipt.blockNumber + BigInt(1);
    return { state: count >= minimum ? "depth_reached" : "pending", confirmations: count.toString() };
  } catch { return { state: "unknown" }; }
}
