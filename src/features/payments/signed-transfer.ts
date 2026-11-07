import { encodeFunctionData, keccak256, parseAbi, parseTransaction, recoverTransactionAddress, type Address, type Hex } from "viem";
import { TWIN_ARGT_ARBITRUM } from "./wallet-check";
import { validateTransfer } from "./payment-request";

const abi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);

/** Offline verification only. It does not authorize, bound gas fees, or broadcast. */
export async function inspectSignedTransfer(raw: Hex, expected: { sender: Address; recipient: Address; amount: bigint; nonce: number }): Promise<{ ok: true; hash: Hex } | { ok: false }> {
  try {
    if (!Number.isSafeInteger(expected.nonce) || expected.nonce < 0 || !validateTransfer({ sender: expected.sender, destination: expected.recipient, amountAtomic: expected.amount.toString() }).ok) return { ok: false };
    const tx = parseTransaction(raw);
    const data = encodeFunctionData({ abi, functionName: "transfer", args: [expected.recipient, expected.amount] });
    if (!raw.startsWith("0x02") || tx.type !== "eip1559" || tx.chainId !== 42161 || tx.nonce !== expected.nonce || tx.to?.toLowerCase() !== TWIN_ARGT_ARBITRUM.toLowerCase() || (tx.value ?? BigInt(0)) !== BigInt(0) || tx.data?.toLowerCase() !== data.toLowerCase()) return { ok: false };
    const sender = await recoverTransactionAddress({ serializedTransaction: raw as `0x02${string}` });
    if (sender.toLowerCase() !== expected.sender.toLowerCase()) return { ok: false };
    return { ok: true, hash: keccak256(raw) };
  } catch { return { ok: false }; }
}
