import { describe, expect, it, vi } from "vitest";
import { createPreparedStore } from "./prepared-store";

const identity = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", companyId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", orderId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", actionId: "one", sender: "0x0000000000000000000000000000000000000001" as const, recipient: "0x0000000000000000000000000000000000000002" as const, amount: BigInt(100), nonce: 7 };
const hash = `0x${"a".repeat(64)}` as const;
const envelope = JSON.stringify({ version: 1, iv: "dummy", tag: "dummy", ciphertext: "encrypted" });
const row = { id: identity.id, state: "prepared", tx_hash: hash, envelope: JSON.parse(envelope), chain_id: 42161, sender: identity.sender, nonce: 7, token: "0x59863989d080b22476db95656d0c3cc18be92214", destination: identity.recipient, amount_atomic: "100" };
describe("adaptador del sobre preparado", () => {
  it("solo devuelve un sobre cuya reserva coincide con todos los datos", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: row, error: null }) };
    const store = createPreparedStore(client, identity);
    const result = await store.read();
    expect(result).toMatchObject({ id: identity.id, hash });
    expect(JSON.parse(result!.envelope)).toEqual(JSON.parse(envelope));
    client.rpc.mockResolvedValue({ data: { ...row, nonce: 8 }, error: null });
    await expect(store.read()).rejects.toThrow();
  });
  it("escribe únicamente el sobre, hash y referencias de la reserva", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: {}, error: null }) };
    const store = createPreparedStore(client, identity);
    await store.write({ id: identity.id, hash, envelope });
    expect(client.rpc).toHaveBeenCalledWith("store_prepared_payment", { p_company: identity.companyId, p_order: identity.orderId, p_action: identity.actionId, p_reservation_id: identity.id, p_hash: hash, p_envelope: JSON.parse(envelope) });
  });
  it("distingue ausencia de una falla de conexión", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "NOT_FOUND: prepared payment" } }) };
    expect(await createPreparedStore(client, identity).read()).toBeNull();
    client.rpc.mockResolvedValue({ data: null, error: { code: "08006", message: "connection" } });
    await expect(createPreparedStore(client, identity).read()).rejects.toThrow();
  });
});
