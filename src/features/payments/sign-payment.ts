import { encodeFunctionData, parseAbi, parseTransaction, type Address, type Hex } from "viem";
import { inspectSignedTransfer } from "./signed-transfer";
import { validateTransfer } from "./payment-request";
import { TWIN_ARGT_ARBITRUM } from "./wallet-check";
type Identity = { sender: Address; recipient: Address; amount: bigint; nonce: number };
type Limits = { gas: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; maxTotalFee: bigint };
type Transaction = { chainId: 42161; type: "eip1559"; nonce: number; to: Address; data: Hex; value: bigint; gas: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
type Signer = { address: Address; signTransaction: (transaction: Transaction) => Promise<Hex> };
export type ParametersOfSignPayment = [Identity, Limits, Signer];
/** Recheck recovered bytes against the current explicit gas ceiling before broadcast. */
export function verifyPaymentFees(raw: Hex, limits: Limits): boolean {
  try {
    const tx = parseTransaction(raw);
    return tx.type === "eip1559" && tx.gas !== undefined && tx.gas > BigInt(0) && tx.gas <= limits.gas
      && tx.maxFeePerGas !== undefined && tx.maxFeePerGas > BigInt(0) && tx.maxFeePerGas <= limits.maxFeePerGas
      && tx.maxPriorityFeePerGas !== undefined && tx.maxPriorityFeePerGas >= BigInt(0) && tx.maxPriorityFeePerGas <= limits.maxPriorityFeePerGas
      && tx.maxPriorityFeePerGas <= tx.maxFeePerGas && limits.maxTotalFee > BigInt(0) && tx.gas * tx.maxFeePerGas <= limits.maxTotalFee
      && (tx.accessList?.length ?? 0) === 0;
  } catch { return false; }
}
/** Internal only: claim authorization, secret access and encrypted persistence belong to the caller. */
export async function signPayment(identity: Identity, limits: Limits, signer: Signer): Promise<{ ok: true; raw: Hex } | { ok: false }> {
  try {
    if (identity.sender.toLowerCase() !== signer.address.toLowerCase() || !Number.isSafeInteger(identity.nonce) || identity.nonce < 0 || !validateTransfer({ sender: identity.sender, destination: identity.recipient, amountAtomic: identity.amount.toString() }).ok || limits.gas <= BigInt(0) || limits.maxFeePerGas <= BigInt(0) || limits.maxPriorityFeePerGas < BigInt(0) || limits.maxPriorityFeePerGas > limits.maxFeePerGas || limits.maxTotalFee <= BigInt(0) || limits.gas * limits.maxFeePerGas > limits.maxTotalFee) return { ok: false };
    const data = encodeFunctionData({ abi: parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]), functionName: "transfer", args: [identity.recipient, identity.amount] });
    const raw = await signer.signTransaction({ chainId: 42161, type: "eip1559", nonce: identity.nonce, to: TWIN_ARGT_ARBITRUM, data, value: BigInt(0), gas: limits.gas, maxFeePerGas: limits.maxFeePerGas, maxPriorityFeePerGas: limits.maxPriorityFeePerGas });
    const inspected = await inspectSignedTransfer(raw, identity);
    if (!inspected.ok) return { ok: false };
    const tx = parseTransaction(raw);
    if (tx.type !== "eip1559" || tx.gas !== limits.gas || tx.maxFeePerGas !== limits.maxFeePerGas || tx.maxPriorityFeePerGas !== limits.maxPriorityFeePerGas || (tx.accessList?.length ?? 0) !== 0) return { ok: false };
    return { ok: true, raw };
  } catch { return { ok: false }; }
}
