import { LoaderCircle } from "lucide-react";
import { PipelineFrame } from "@/features/crm/components/pipeline-view";
import { PageHeader } from "@/components/ui/PageHeader";

export default function PipelineLoading() {
  return <PipelineFrame><PageHeader title="Pipeline" /><p role="status" className="flex items-center gap-2 text-sm text-ink-muted">
    <LoaderCircle size={18} aria-hidden className="animate-spin" />Cargando oportunidades…</p></PipelineFrame>;
}
