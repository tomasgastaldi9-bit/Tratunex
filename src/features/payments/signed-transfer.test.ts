import { describe, expect, it } from "vitest";
import { encodeFunctionData, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { inspectSignedTransfer } from "./signed-transfer";
import { TWIN_ARGT_ARBITRUM } from "./wallet-check";

const account = privateKeyToAccount(`0x${"0".repeat(63)}1`);
const recipient = "0x0000000000000000000000000000000000000002" as const;
const abi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);
const expected = { sender: account.address, recipient, amount: BigInt(100), nonce: 4 };
async function signed(data: `0x${string}`, chainId = 42161) {
  return account.signTransaction({ chainId, type: "eip1559", nonce: 4, to: TWIN_ARGT_ARBITRUM, data, gas: BigInt(100000), maxFeePerGas: BigInt(1000000000), maxPriorityFeePerGas: BigInt(100000000), value: BigInt(0) });
}
describe("verificación de transacción firmada", () => {
  it("verifica firma, red, destino, monto, nonce y hash sin transmitir", async () => {
    const raw = await signed(encodeFunctionData({ abi, functionName: "transfer", args: [recipient, BigInt(100)] }));
    expect(await inspectSignedTransfer(raw, expected)).toMatchObject({ ok: true });
    expect(await inspectSignedTransfer(raw, { ...expected, amount: BigInt(101) })).toMatchObject({ ok: false });
    expect(await inspectSignedTransfer(raw, { ...expected, nonce: 5 })).toMatchObject({ ok: false });
    expect(await inspectSignedTransfer(raw, { ...expected, sender: "0x0000000000000000000000000000000000000003" })).toMatchObject({ ok: false });
  });
  it("rechaza una red distinta o datos de contrato ajenos", async () => {
    const data = encodeFunctionData({ abi, functionName: "transfer", args: [recipient, BigInt(100)] });
    expect(await inspectSignedTransfer(await signed(data, 8453), expected)).toMatchObject({ ok: false });
    expect(await inspectSignedTransfer(await signed("0x12345678"), expected)).toMatchObject({ ok: false });
  });
});
