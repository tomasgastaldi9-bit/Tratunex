import { describe, expect, it } from "vitest";
import { inspectWallet, TWIN_ARGT_BASE } from "./wallet-check";

const wallet = "0x0000000000000000000000000000000000000001" as const;
const client = { getChainId: async () => 8453, getBytecode: async () => "0x1234" as const, getBalance: async () => BigInt(100), readContract: async (args: { functionName: string }) => args.functionName === "symbol" ? "ARGt" : args.functionName === "decimals" ? 18 : BigInt("2500000000000000000") };

describe("inspección de billetera", () => {
  it("lee el contrato de Twin y los saldos sin firmar transacciones", async () => {
    expect(await inspectWallet(client, wallet, TWIN_ARGT_BASE)).toMatchObject({ chainId: 8453, token: TWIN_ARGT_BASE, wallet, argtAtomic: "2500000000000000000", ethWei: "100" });
  });
  it("rechaza redes y contratos incorrectos", async () => {
    await expect(inspectWallet({ ...client, getChainId: async () => 1 }, wallet, TWIN_ARGT_BASE)).rejects.toThrow("Base");
    await expect(inspectWallet(client, wallet, wallet)).rejects.toThrow("contrato");
    await expect(inspectWallet({ ...client, readContract: async () => "FALSO" }, wallet, TWIN_ARGT_BASE)).rejects.toThrow("ARGt");
  });
});
