import { describe, expect, it, vi } from "vitest";
import type { ActionCtx, Result } from "../../../contracts/common";
import { DEMO_QUOTE_REQUEST, QUOTE_END_CALL_MESSAGE, quoteAssistantPrompt } from "./quote-call";
import {
  buildVapiQuoteCallBody,
  formatNeededBy,
  quoteCallActionId,
  requestQuoteCall,
  type DialStore,
  type QuoteDialDeps,
  type QuoteDialRequest,
} from "./quote-dial";
import { createVapiCall, fetchVapiAssistantModel } from "./vapi-api";

const supplier = "33333333-3333-4333-8333-333333333333";
const purchase = "77777777-7777-4777-8777-777777777777";
const callId = "66666666-6666-4666-8666-666666666666";
const vapiId = "01a1b71c-99fc-7001-8c19-198725407098";
const actionCtx: ActionCtx = {
  company_id: "11111111-1111-4111-8111-111111111111",
  actor_type: "user",
  actor_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  action_id: quoteCallActionId("0b1c2d3e-0000-4000-8000-000000000001"),
};
const input = { supplier_contact_id: supplier, purchase_request_id: purchase };

function setup(reserve: Awaited<ReturnType<DialStore["reserveCall"]>>, dialResult: Result<{ provider_call_id: string }>) {
  const store = {
    reserveCall: vi.fn(async () => reserve),
    markDialed: vi.fn(async () => ({ ok: true as const, data: null })),
    markNotDialed: vi.fn(async () => ({ ok: true as const, data: null })),
  };
  const dial = vi.fn(async (_request: QuoteDialRequest) => dialResult);
  const deps: QuoteDialDeps = {
    store,
    dial,
    loadTarget: vi.fn(async () => ({ ok: true as const, data: { brief: DEMO_QUOTE_REQUEST, supplier_phone_e164: "+5491100000000" } })),
  };
  return { store, dial, deps };
}

const reservedNew = { ok: true as const, data: { call_id: callId, provider_call_id: null, created: true } };

describe("requestQuoteCall", () => {
  it("reserva la llamada, llama con el prompt de la compra y guarda el ID de Vapi", async () => {
    const { store, dial, deps } = setup(reservedNew, { ok: true, data: { provider_call_id: vapiId } });
    const result = await requestQuoteCall(actionCtx, input, deps);
    expect(result).toEqual({ ok: true, data: { call_id: callId, provider_call_id: vapiId, created: true } });
    expect(store.reserveCall).toHaveBeenCalledWith({ company_id: actionCtx.company_id, supplier_contact_id: supplier, action_id: actionCtx.action_id });
    const request = dial.mock.calls[0][0];
    expect(request.system_prompt).toBe(quoteAssistantPrompt(DEMO_QUOTE_REQUEST));
    expect(request.metadata).toEqual({ company_id: actionCtx.company_id, call_id: callId, supplier_contact_id: supplier, purchase_request_id: purchase });
    expect(store.markDialed).toHaveBeenCalledWith({ call_id: callId, provider_call_id: vapiId });
  });

  it("un doble clic con la misma llamada ya hecha no vuelve a llamar", async () => {
    const { dial, deps } = setup({ ok: true, data: { call_id: callId, provider_call_id: vapiId, created: false } }, { ok: true, data: { provider_call_id: "otro" } });
    const result = await requestQuoteCall(actionCtx, input, deps);
    expect(result).toEqual({ ok: true, data: { call_id: callId, provider_call_id: vapiId, created: false } });
    expect(dial).not.toHaveBeenCalled();
  });

  it("si un intento anterior quedó sin confirmar, no llama a ciegas", async () => {
    const { dial, deps } = setup({ ok: true, data: { call_id: callId, provider_call_id: null, created: false } }, { ok: true, data: { provider_call_id: vapiId } });
    const result = await requestQuoteCall(actionCtx, input, deps);
    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT", retryable: false } });
    expect(dial).not.toHaveBeenCalled();
  });

  it("si Vapi no responde, la llamada queda en unknown; si la rechaza, en failed", async () => {
    const down = setup(reservedNew, { ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "sin red", retryable: true } });
    await requestQuoteCall(actionCtx, input, down.deps);
    expect(down.store.markNotDialed).toHaveBeenCalledWith({ call_id: callId, status: "unknown", reason: "sin red" });
    expect(down.store.markDialed).not.toHaveBeenCalled();

    const rejected = setup(reservedNew, { ok: false, error: { code: "PROVIDER_ERROR", message: "sin crédito", retryable: false } });
    const result = await requestQuoteCall(actionCtx, input, rejected.deps);
    expect(result).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
    expect(rejected.store.markNotDialed).toHaveBeenCalledWith({ call_id: callId, status: "failed", reason: "sin crédito" });
  });

  it("valida el input y los datos de la compra antes de reservar nada", async () => {
    const bad = setup(reservedNew, { ok: true, data: { provider_call_id: vapiId } });
    expect(await requestQuoteCall(actionCtx, { ...input, company_id: actionCtx.company_id }, bad.deps)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    const empty = setup(reservedNew, { ok: true, data: { provider_call_id: vapiId } });
    empty.deps.loadTarget = async () => ({ ok: true, data: { brief: { ...DEMO_QUOTE_REQUEST, product: "  " }, supplier_phone_e164: "+5491100000000" } });
    expect(await requestQuoteCall(actionCtx, input, empty.deps)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(bad.store.reserveCall).not.toHaveBeenCalled();
    expect(empty.store.reserveCall).not.toHaveBeenCalled();
  });

  it("si el proveedor no se puede llamar, no reserva ni llama", async () => {
    const { store, dial, deps } = setup(reservedNew, { ok: true, data: { provider_call_id: vapiId } });
    deps.loadTarget = async () => ({ ok: false, error: { code: "FORBIDDEN", message: "El proveedor pidió que no lo llamen", retryable: false } });
    expect(await requestQuoteCall(actionCtx, input, deps)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(store.reserveCall).not.toHaveBeenCalled();
    expect(dial).not.toHaveBeenCalled();
  });
});

describe("formatNeededBy", () => {
  it("convierte la fecha de la compra en texto para hablar", () => {
    expect(formatNeededBy("2026-11-09")).toBe("el lunes 9 de noviembre");
    expect(formatNeededBy("no-es-fecha")).toBe("no-es-fecha");
  });
});

describe("buildVapiQuoteCallBody", () => {
  it("copia el modelo del asistente y solo reemplaza el prompt", () => {
    const body = buildVapiQuoteCallBody(
      { phone_e164: "+5491100000000", first_message: "Hola", system_prompt: "PROMPT", metadata: { company_id: "c", call_id: "k", supplier_contact_id: "s", purchase_request_id: "p" } },
      { assistantId: "a", phoneNumberId: "n", assistantModel: { provider: "openai", model: "gpt-4.1-mini", toolIds: ["t"], messages: [{ role: "system", content: "viejo" }] } },
    );
    expect(body.customer).toEqual({ number: "+5491100000000" });
    expect(body.assistantOverrides.model).toEqual({ provider: "openai", model: "gpt-4.1-mini", toolIds: ["t"], messages: [{ role: "system", content: "PROMPT" }] });
    expect(body.assistantOverrides.endCallMessage).toBe(QUOTE_END_CALL_MESSAGE);
    expect(body.metadata.call_id).toBe("k");
  });
});

describe("API de Vapi para llamar", () => {
  const response = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

  it("lee el modelo del asistente y crea la llamada", async () => {
    const model = await fetchVapiAssistantModel("4bd373cd-792f-432c-a2ba-9b4bc113982f", { apiKey: "k", fetchImpl: response(200, { model: { provider: "openai" } }) });
    expect(model).toEqual({ ok: true, data: { provider: "openai" } });
    const call = await createVapiCall({}, { apiKey: "k", fetchImpl: response(201, { id: vapiId }) });
    expect(call).toEqual({ ok: true, data: { provider_call_id: vapiId } });
  });

  it("un 400 de Vapi trae el motivo y no se reintenta", async () => {
    const call = await createVapiCall({}, { apiKey: "k", fetchImpl: response(400, { message: "customer.number must be E.164" }) });
    expect(call).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR", retryable: false } });
    expect(!call.ok && call.error.message).toContain("E.164");
  });

  it("un ID de asistente inválido no consulta nada", async () => {
    const fetchImpl = vi.fn(response(200, {}));
    expect(await fetchVapiAssistantModel("../call", { apiKey: "k", fetchImpl })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
