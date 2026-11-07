import { describe, expect, it } from "vitest";
import { parsePaymentConfig, paymentConfigured } from "./payment-config";
import { TWIN_ARGT_ARBITRUM } from "./wallet-check";

const env = { PAYMENT_CHAIN: "arbitrum", ARGT_TOKEN_ADDRESS: TWIN_ARGT_ARBITRUM, PAYMENT_RPC_URL: "https://rpc.example.test", AGENT_WALLET_PRIVATE_KEY: `0x${"0".repeat(63)}1`, PAYMENT_ENCRYPTION_KEY: "ab".repeat(32), PAYMENT_GAS_LIMIT: "100000", PAYMENT_MAX_FEE_PER_GAS_WEI: "200000000", PAYMENT_MAX_PRIORITY_FEE_PER_GAS_WEI: "100000000", PAYMENT_MAX_TOTAL_FEE_WEI: "20000000000000" };
describe("configuración de pagos", () => {
  it("exige red, token, cifrado y límites explícitos", () => {
    expect(parsePaymentConfig(env).ok).toBe(true);
    for (const change of [{ PAYMENT_CHAIN: "base" }, { ARGT_TOKEN_ADDRESS: "0x0000000000000000000000000000000000000001" }, { PAYMENT_ENCRYPTION_KEY: "" }, { PAYMENT_MAX_TOTAL_FEE_WEI: "1" }, { PAYMENT_RPC_URL: "http://example.test" }]) expect(parsePaymentConfig({ ...env, ...change }).ok).toBe(false);
  });
  it("rechaza límites fraccionarios, prioridad mayor al máximo y claves inválidas", () => {
    for (const change of [{ PAYMENT_GAS_LIMIT: "1.5" }, { PAYMENT_MAX_PRIORITY_FEE_PER_GAS_WEI: "300000000" }, { AGENT_WALLET_PRIVATE_KEY: "wrong" }, { PAYMENT_ENCRYPTION_KEY: "xx".repeat(32) }]) expect(parsePaymentConfig({ ...env, ...change }).ok).toBe(false);
  });
  it("solo anuncia disponibilidad con interruptor y configuración completa", () => {
    const ready = { ...env, PAYMENT_ENABLED: "true", SUPABASE_SECRET_KEY: "dummy", NEXT_PUBLIC_SUPABASE_URL: "https://example.test", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dummy", NEXT_PUBLIC_APP_URL: "https://app.example.test" };
    expect(paymentConfigured(ready)).toBe(true);
    for (const change of [{ PAYMENT_ENABLED: "false" }, { PAYMENT_RPC_URL: "" }, { SUPABASE_SECRET_KEY: "" }, { NEXT_PUBLIC_APP_URL: "" }, { DISCOVERY_MODE: "invalid" }]) expect(paymentConfigured({ ...ready, ...change })).toBe(false);
  });
});
