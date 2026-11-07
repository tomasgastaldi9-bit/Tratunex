import { DEMO_SENDER } from "./demo-constants";
import { paymentConfigured } from "./payment-config";

/** The ordinary payment flag cannot enable this exception. */
export function demoPaymentConfigured(env: Record<string, string | undefined>, sender: string): boolean {
  return sender.toLowerCase() === DEMO_SENDER.toLowerCase()
    && paymentConfigured({ ...env, PAYMENT_ENABLED: env.PAYMENT_DEMO_ENABLED });
}
