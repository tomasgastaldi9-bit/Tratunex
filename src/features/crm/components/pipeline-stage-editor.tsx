"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { PIPELINE_STAGES, SetDealStageInputSchema, type DealDTO, type PipelineStage } from "@/contracts/crm";
import { usePipelineMutation } from "./pipeline-mutation";

export function PipelineStageEditor({ deal }: { deal: DealDTO }) {
  const router = useRouter();
  const [stage, setStage] = useState<PipelineStage>(deal.stage);
  const mutation = usePipelineMutation(`${deal.company_id}:pipeline:stage:${deal.id}`, deal.company_id, deal.id);

  async function save(event: FormEvent) {
    event.preventDefault();
    const input = SetDealStageInputSchema.safeParse({ deal_id: deal.id, stage, expected_stage: deal.stage });
    if (!input.success) return;
    const payload = { stage: input.data.stage, expected_stage: input.data.expected_stage };
    await mutation.submit(`/api/crm/deals/${deal.id}/stage`, payload, "Guardamos la nueva etapa.");
  }

  return <form aria-label={`Cambiar etapa de ${deal.title}`} className="mt-4 space-y-3 border-t border-line pt-4" onSubmit={save}>
    <Select label={`Etapa de ${deal.title}`} value={stage} disabled={mutation.locked}
      onChange={event => setStage(event.target.value as PipelineStage)}
      options={PIPELINE_STAGES.map(item => ({ value: item.code, label: item.label }))} />
    {stage === "won" && <p className="text-xs text-ink-muted">Marcá Compró cuando una persona haya confirmado el cierre.</p>}
    {mutation.error && <Alert tone={mutation.uncertain ? "warning" : "danger"}>{mutation.error}</Alert>}
    {mutation.success && <p role="status" className="text-xs text-success">{mutation.success}</p>}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" type="submit" loading={mutation.pending} disabled={stage === deal.stage && !mutation.uncertain}>
        {mutation.uncertain ? "Confirmar cambio" : "Guardar etapa"}</Button>
      {mutation.error && !mutation.uncertain && <Button size="sm" variant="ghost" onClick={() => router.refresh()}>Actualizar tablero</Button>}
    </div>
  </form>;
}
