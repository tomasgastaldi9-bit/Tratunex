import "server-only";
import type { ActionCtx } from "@/contracts/common";
import { executeConfiguredPayment } from "../payment-entry";
import { createPaymentPorts } from "./payment-ports";
import { paymentConfigured } from "../payment-config";

export const paymentEnabled = () => paymentConfigured(process.env);
export function payInvoice(ctx: ActionCtx, input: { order_id: string }) {
  return executeConfiguredPayment(process.env.PAYMENT_ENABLED, ctx, input, createPaymentPorts);
}
