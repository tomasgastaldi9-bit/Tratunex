import { NextResponse } from "next/server";
import { handleVapiWebhook, type WebhookDeps } from "@/features/voice/server/webhook";
import { createVoiceEventStore } from "@/features/voice/server/voice-event-store";
import { processVoiceEvents, voiceAdminClient } from "@/features/voice/server/public";
import { getServerEnv } from "@/lib/env";

// Único ingreso de avisos de Vapi (BRIEF §7). Autenticado con
// "Authorization: Bearer <VOICE_WEBHOOK_SECRET>" (Custom Credential de Vapi).

function webhookDeps(): WebhookDeps {
  let secret: string | undefined;
  try {
    secret = getServerEnv().VOICE_WEBHOOK_SECRET;
  } catch {
    secret = undefined;
  }
  const db = voiceAdminClient();
  return { secret, store: db ? createVoiceEventStore(db) : null };
}

export async function POST(request: Request) {
  const response = await handleVapiWebhook(
    { authorization: request.headers.get("authorization"), rawBody: await request.text() },
    webhookDeps(),
  );

  // El aviso ya quedó guardado: procesarlo ahora es lo más rápido, pero si falla
  // no cambia la respuesta a Vapi; queda pendiente y el cron lo reintenta.
  if (response.status === 200 && response.body.stored === true && response.body.event_type === "end-of-call-report") {
    await processVoiceEvents({ limit: 3 }).catch(() => undefined);
  }

  return NextResponse.json(response.body, { status: response.status });
}
