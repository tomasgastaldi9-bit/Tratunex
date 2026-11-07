type Readiness = { observedNonce: number; reservedNonce: number; ethWei: bigint; tokenAtomic: bigint; maxTotalFee: bigint; amount: bigint };
/** Read-only check; does not lock a wallet or authorize a transfer. */
export function paymentReady(input: Readiness): boolean {
  return Number.isSafeInteger(input.observedNonce) && input.observedNonce >= 0 && Number.isSafeInteger(input.reservedNonce) && input.observedNonce === input.reservedNonce && input.maxTotalFee > BigInt(0) && input.amount > BigInt(0) && input.ethWei >= input.maxTotalFee && input.tokenAtomic >= input.amount;
}
