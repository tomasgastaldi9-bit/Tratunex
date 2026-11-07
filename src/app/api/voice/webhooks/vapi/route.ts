import { NextResponse } from "next/server";
import { handleVapiWebhook, type WebhookDeps } from "@/features/voice/server/webhook";
import { createVoiceEventStore } from "@/features/voice/server/voice-event-store";
import { getServerEnv } from "@/lib/env";

// Único ingreso de avisos de Vapi (BRIEF §7). Autenticado con
// "Authorization: Bearer <VOICE_WEBHOOK_SECRET>" (Custom Credential de Vapi).

function webhookDeps(): WebhookDeps {
  try {
    const env = getServerEnv();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return {
      secret: env.VOICE_WEBHOOK_SECRET,
      store: supabaseUrl && env.SUPABASE_SECRET_KEY ? createVoiceEventStore(supabaseUrl, env.SUPABASE_SECRET_KEY) : null,
    };
  } catch {
    return { secret: undefined, store: null };
  }
}

export async function POST(request: Request) {
  const response = await handleVapiWebhook(
    { authorization: request.headers.get("authorization"), rawBody: await request.text() },
    webhookDeps(),
  );
  return NextResponse.json(response.body, { status: response.status });
}
