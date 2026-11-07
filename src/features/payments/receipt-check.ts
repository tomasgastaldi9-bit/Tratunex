import { decodeEventLog, type Address, type Hex } from "viem";

export const TRANSFER_EVENT = { type: "event", name: "Transfer", inputs: [
  { name: "from", type: "address", indexed: true },
  { name: "to", type: "address", indexed: true },
  { name: "value", type: "uint256", indexed: false },
] } as const;

/** Checks event contents, not finality, transaction hash, chain or receipt provenance. */
export function verifyTransferReceipt(receipt: { status: "success" | "reverted"; logs: readonly { address: Address; topics: readonly Hex[]; data: Hex }[] }, expected: { token: Address; sender: Address; recipient: Address; amount: bigint }): boolean {
  if (receipt.status !== "success") return false;
  return receipt.logs.some(log => {
    if (log.address.toLowerCase() !== expected.token.toLowerCase() || log.topics.length === 0) return false;
    try {
      const event = decodeEventLog({ abi: [TRANSFER_EVENT], data: log.data, topics: log.topics as [Hex, ...Hex[]], strict: true });
      return event.args.from.toLowerCase() === expected.sender.toLowerCase() && event.args.to.toLowerCase() === expected.recipient.toLowerCase() && event.args.value === expected.amount;
    } catch { return false; }
  });
}
