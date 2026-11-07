import "server-only";
import type { Ctx } from "../../../contracts/common";
import type { CheckPurchasePolicyInput } from "../../../contracts/purchases";
import { checkPurchasePolicy } from "../../agent/server/public";
import { checkBeforePayment } from "../policy-gate";

/** Preliminary policy check; not authorization to sign or send a transaction. */
export const checkPaymentPolicy = (ctx: Ctx, input: CheckPurchasePolicyInput) => checkBeforePayment(ctx, input, checkPurchasePolicy);
