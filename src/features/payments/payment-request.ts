import { isAddress, zeroAddress } from "viem";

/** Validates values only. Authority, policy and order ownership must be checked separately. */
export function validateTransfer(input: { sender: string; destination: string; amountAtomic: string }): { ok: true } | { ok: false } {
  if (!isAddress(input.sender) || !isAddress(input.destination) || input.destination.toLowerCase() === zeroAddress || input.destination.toLowerCase() === input.sender.toLowerCase()) return { ok: false };
  if (!/^[1-9]\d{0,77}$/.test(input.amountAtomic)) return { ok: false };
  if (BigInt(input.amountAtomic) >= BigInt(2) ** BigInt(256)) return { ok: false };
  return { ok: true };
}
