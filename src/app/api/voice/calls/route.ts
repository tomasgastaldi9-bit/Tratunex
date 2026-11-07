import { NextResponse } from "next/server";
import { getCompanyContext } from "@/features/platform/server/public";
import { httpStatusFor, startCallActionId } from "@/features/voice/server/http";
import { listCalls, startCall } from "@/features/voice/server/public";

// GET  /api/voice/calls?contact_id=&cursor=&limit=  → Result<{ items, next_cursor }>
// POST /api/voice/calls  (header Idempotency-Key)    → Result<{ call }>
// La empresa sale de la sesión verificada, nunca del cuerpo ni de la URL.

export async function GET(request: Request) {
  const context = await getCompanyContext();
  if (!context.ok) return NextResponse.json(context, { status: httpStatusFor(context) });

  const params = new URL(request.url).searchParams;
  const limit = params.get("limit");
  const result = await listCalls(context.data, {
    ...(params.get("contact_id") ? { contact_id: params.get("contact_id")! } : {}),
    ...(params.get("cursor") ? { cursor: params.get("cursor")! } : {}),
    ...(limit ? { limit: Number(limit) } : {}),
  });
  return NextResponse.json(result, { status: httpStatusFor(result) });
}

export async function POST(request: Request) {
  const actionId = startCallActionId(request.headers.get("idempotency-key"));
  if (!actionId) {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "Falta el header Idempotency-Key", retryable: false } },
      { status: 400 },
    );
  }

  const context = await getCompanyContext();
  if (!context.ok) return NextResponse.json(context, { status: httpStatusFor(context) });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "VALIDATION_ERROR", message: "JSON inválido", retryable: false } },
      { status: 400 },
    );
  }

  // startCall valida el input con Zod; el tipo del contrato es solo para el compilador.
  const result = await startCall({ ...context.data, action_id: actionId }, input as Parameters<typeof startCall>[1]);
  return NextResponse.json(result, { status: httpStatusFor(result, 202) });
}
