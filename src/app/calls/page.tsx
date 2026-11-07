import { Clock, FlaskConical, Phone } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/ui/AppShell";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListItem } from "@/components/ui/ListItem";
import { PageHeader } from "@/components/ui/PageHeader";
import { CallStatusBadge, ModeBadge, PotentialBadge } from "@/components/ui/StatusBadges";
import type { CallListItem } from "@/contracts/voice";
import { getCompanyContext } from "@/features/platform/server/public";
import { ANSWERED_BY_LABELS, formatArgentina, transportMode } from "@/features/voice/components/labels";
import { listCalls, voiceMode } from "@/features/voice/server/public";

function CallBadges({ call }: { call: CallListItem }) {
  const result = call.result;
  return (
    <>
      <CallStatusBadge status={call.status} />
      {result && result.answered_by === "human" && (
        <PotentialBadge value={result.is_potential_client} score={result.score ?? undefined} />
      )}
      {result && result.answered_by !== "human" && <Badge tone="neutral">{ANSWERED_BY_LABELS[result.answered_by]}</Badge>}
      {result?.next_action?.type === "callback" && (
        <Badge tone="warning" icon={Clock}>
          Volver a llamar: {formatArgentina(result.next_action.due_at)}
        </Badge>
      )}
      <ModeBadge mode={transportMode(call.transport)} />
    </>
  );
}

export default async function CallsPage() {
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

  const mode = voiceMode();
  const result = await listCalls(context.data, {});

  return (
    <AppShell>
      <PageHeader title="Llamadas" description="Cada llamada del agente, con su estado y su resultado." />

      {mode === "mock" && (
        <p className="flex items-center gap-1.5 text-xs text-ink-subtle">
          <FlaskConical size={12} aria-hidden /> Ejemplo: estas llamadas son de muestra, no se llamó a nadie.
          <span className="sr-only"> (datos de prueba)</span>
        </p>
      )}

      {!result.ok ? (
        <Alert tone="danger" title="No pudimos cargar las llamadas">
          {result.error.message}
        </Alert>
      ) : result.data.items.length === 0 ? (
        <EmptyState
          icon={Phone}
          title="Todavía no hay llamadas"
          description="Iniciá una desde el detalle de un contacto en el CRM y la vas a ver acá."
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {result.data.items.map((call) => (
            <li key={call.id}>
              <Link
                href={`/calls/${call.id}`}
                className="block rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <ListItem
                  title={`Llamada del ${formatArgentina(call.created_at)}`}
                  subtitle={call.result?.summary ?? call.objective ?? "Sin objetivo cargado"}
                  meta={<CallBadges call={call} />}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
