import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, type Hex } from "viem";
import { verifyTransferReceipt, TRANSFER_EVENT } from "./receipt-check";

const token = "0x59863989d080B22476DB95656d0C3CC18be92214" as const;
const sender = "0x0000000000000000000000000000000000000001" as const;
const recipient = "0x0000000000000000000000000000000000000002" as const;
const log = { address: token, topics: encodeEventTopics({ abi: [TRANSFER_EVENT], eventName: "Transfer", args: { from: sender, to: recipient } }) as [Hex, ...Hex[]], data: encodeAbiParameters([{ type: "uint256" }], [BigInt(100)]) };
const expected = { token, sender, recipient, amount: BigInt(100) };
describe("comprobante de transferencia", () => {
  it("valida evento y resultado exitoso de la transacción", () => {
    expect(verifyTransferReceipt({ status: "success", logs: [log] }, expected)).toBe(true);
  });
  it("rechaza recibos revertidos y montos, destinatarios o contratos diferentes", () => {
    expect(verifyTransferReceipt({ status: "reverted", logs: [log] }, expected)).toBe(false);
    expect(verifyTransferReceipt({ status: "success", logs: [log] }, { ...expected, amount: BigInt(101) })).toBe(false);
    expect(verifyTransferReceipt({ status: "success", logs: [log] }, { ...expected, recipient: sender })).toBe(false);
    expect(verifyTransferReceipt({ status: "success", logs: [{ ...log, address: recipient }] }, expected)).toBe(false);
    expect(verifyTransferReceipt({ status: "success", logs: [] }, expected)).toBe(false);
  });
});
