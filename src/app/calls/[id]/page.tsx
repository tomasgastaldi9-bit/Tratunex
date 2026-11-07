import { ArrowLeft, FlaskConical } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/ui/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { CallStatusBadge, ModeBadge, PotentialBadge } from "@/components/ui/StatusBadges";
import { getCompanyContext } from "@/features/platform/server/public";
import {
  ANSWERED_BY_LABELS,
  formatArgentina,
  nextActionLabel,
  OUTCOME_LABELS,
  transportMode,
} from "@/features/voice/components/labels";
import { getCall } from "@/features/voice/server/public";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:gap-5">
      <dt className="shrink-0 text-sm text-ink-muted sm:w-48">{label}</dt>
      <dd className="min-w-0 text-sm font-bold break-words">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-base font-bold">{title}</h2>
      {children}
    </Card>
  );
}

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getCompanyContext(undefined, { readOnlyCookies: true });
  if (!context.ok && (context.error.code === "FORBIDDEN" || context.error.code === "VALIDATION_ERROR")) {
    redirect("/login/companies");
  }
  if (!context.ok) {
    return (
      <AppShell>
        <Alert tone="danger" title="No pudimos comprobar tu acceso">Intentá de nuevo en unos segundos.</Alert>
      </AppShell>
    );
  }

  const loaded = await getCall(context.data, { call_id: id });
  if (!loaded.ok && (loaded.error.code === "NOT_FOUND" || loaded.error.code === "VALIDATION_ERROR")) notFound();
  if (!loaded.ok) {
    return (
      <AppShell>
        <Alert tone="danger" title="No pudimos cargar la llamada">{loaded.error.message}</Alert>
      </AppShell>
    );
  }

  const call = loaded.data.call;
  const result = call.result;
  const isMock = call.transport === "mock";

  return (
    <AppShell>
      <Link href="/calls" className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-ink-muted hover:text-ink">
        <ArrowLeft size={16} aria-hidden />
        Llamadas
      </Link>

      <PageHeader
        title={`Llamada del ${formatArgentina(call.created_at)}`}
        description={call.objective ?? "Sin objetivo cargado"}
        actions={
          <>
            <CallStatusBadge status={call.status} />
            <ModeBadge mode={transportMode(call.transport)} />
          </>
        }
      />

      {isMock && (
        <p className="flex items-center gap-1.5 text-xs text-ink-subtle">
          <FlaskConical size={12} aria-hidden /> Ejemplo: esta llamada es de muestra, no se llamó a nadie.
          <span className="sr-only"> (datos de prueba)</span>
        </p>
      )}

      <Section title="Resultado">
        {!result ? (
          <p className="text-sm text-ink-muted">
            Todavía no hay resultado. Aparece cuando la llamada termina y se procesa el reporte del agente.
          </p>
        ) : (
          <>
            <p className="text-sm leading-snug">{result.summary}</p>
            <dl className="flex flex-col gap-3">
              <Row label="Quién atendió">{ANSWERED_BY_LABELS[result.answered_by]}</Row>
              <Row label="Resultado">{OUTCOME_LABELS[result.outcome]}</Row>
              <Row label="Cliente potencial">
                <PotentialBadge value={result.is_potential_client} score={result.score ?? undefined} />
              </Row>
              <Row label="Pidió no ser llamado">
                {result.do_not_contact_requested ? <Badge tone="danger">Sí: no volver a llamar</Badge> : "No"}
              </Row>
              <Row label="Próxima acción">{nextActionLabel(result.next_action)}</Row>
            </dl>
          </>
        )}
      </Section>

      <Section title="Grabación">
        {call.recording_url ? (
          <audio controls preload="none" src={call.recording_url} className="w-full">
            Tu navegador no puede reproducir la grabación.
          </audio>
        ) : (
          <p className="text-sm text-ink-muted">
            {isMock ? "Las llamadas de prueba no tienen grabación." : "Todavía no hay grabación de esta llamada."}
          </p>
        )}
      </Section>

      <Section title="Transcripción">
        {call.transcript ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{call.transcript}</p>
        ) : (
          <p className="text-sm text-ink-muted">Todavía no hay transcripción de esta llamada.</p>
        )}
      </Section>

      <Section title="Datos técnicos">
        <dl className="flex flex-col gap-3">
          <Row label="Motivo de fin">{call.ended_reason ?? "—"}</Row>
          <Row label="Terminó">{call.ended_at ? formatArgentina(call.ended_at) : "—"}</Row>
          <Row label="ID en Vapi">{call.provider_call_id ?? "—"}</Row>
          <Row label="Versión del agente">{call.agent_version ?? "—"}</Row>
          <Row label="Contacto">
            <Link href={`/contacts/${call.contact_id}`} className="underline underline-offset-2">
              Ver en el CRM
            </Link>
          </Row>
        </dl>
      </Section>
    </AppShell>
  );
}
