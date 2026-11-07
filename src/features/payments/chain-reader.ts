import type { Address, Hex } from "viem";
type Receipt = { transactionHash: Hex; from: Address; to: Address | null; status: "success" | "reverted"; blockNumber: bigint; blockHash: Hex; logs: readonly { address: Address; topics: readonly Hex[]; data: Hex }[] };
type Client = { getChainId: () => Promise<number>; getTransactionReceipt: (arg: { hash: Hex }) => Promise<Receipt | null>; getBlock: (arg: { blockTag: "finalized" } | { blockNumber: bigint }) => Promise<{ number: bigint | null; hash: Hex | null }> };
export function createPaymentReader(client: Client) {
  return {
    getChainId: () => client.getChainId(),
    getReceipt: (hash: Hex) => client.getTransactionReceipt({ hash }),
    getFinalizedBlockNumber: async () => {
      const block = await client.getBlock({ blockTag: "finalized" });
      if (block.number === null || block.hash === null) throw new Error("Bloque finalizado no disponible.");
      return block.number;
    },
    getBlockHash: async (blockNumber: bigint) => (await client.getBlock({ blockNumber })).hash,
  };
}
