import { describe, expect, it } from "vitest";
import { demoPaymentConfigured } from "./demo-config";
import { DEMO_SENDER } from "./demo-constants";
import { TWIN_ARGT_ARBITRUM } from "./wallet-check";

const env = { PAYMENT_DEMO_ENABLED: "true", PAYMENT_CHAIN: "arbitrum", ARGT_TOKEN_ADDRESS: TWIN_ARGT_ARBITRUM, PAYMENT_RPC_URL: "https://rpc.example.test", AGENT_WALLET_PRIVATE_KEY: `0x${"0".repeat(63)}1`, PAYMENT_ENCRYPTION_KEY: "ab".repeat(32), PAYMENT_GAS_LIMIT: "100000", PAYMENT_MAX_FEE_PER_GAS_WEI: "200000000", PAYMENT_MAX_PRIORITY_FEE_PER_GAS_WEI: "100000000", PAYMENT_MAX_TOTAL_FEE_WEI: "20000000000000", SUPABASE_SECRET_KEY: "dummy", NEXT_PUBLIC_SUPABASE_URL: "https://db.example.test", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dummy", NEXT_PUBLIC_APP_URL: "https://app.example.test" };
describe("habilitación aislada de demo", () => {
  it("requiere flag de demo, emisor autorizado y la configuración completa", () => {
    expect(demoPaymentConfigured(env, DEMO_SENDER)).toBe(true);
    expect(demoPaymentConfigured({ ...env, PAYMENT_DEMO_ENABLED: "" }, DEMO_SENDER)).toBe(false);
    expect(demoPaymentConfigured(env, `0x${"2".repeat(40)}`)).toBe(false);
    expect(demoPaymentConfigured({ ...env, PAYMENT_RPC_URL: "" }, DEMO_SENDER)).toBe(false);
  });
});
