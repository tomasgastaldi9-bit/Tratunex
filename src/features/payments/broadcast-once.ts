import { keccak256, type Hex } from "viem";

type Port = { markStarted: (hash: Hex) => Promise<"acquired" | "already_started">; send: (raw: Hex) => Promise<Hex> };
/** Only use with a verified recovered transaction and an atomic, durable mark. */
export async function broadcastOnce(transaction: { raw: Hex; hash: Hex }, port: Port): Promise<{ state: "unknown" | "submitted" }> {
  try {
    if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(transaction.raw) || !/^0x[0-9a-fA-F]{64}$/.test(transaction.hash) || keccak256(transaction.raw).toLowerCase() !== transaction.hash.toLowerCase()) return { state: "unknown" };
    if (await port.markStarted(transaction.hash) !== "acquired") return { state: "unknown" };
    const result = await port.send(transaction.raw);
    return { state: result.toLowerCase() === transaction.hash.toLowerCase() ? "submitted" : "unknown" };
  } catch { return { state: "unknown" }; }
}
