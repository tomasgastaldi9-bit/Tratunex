import { readCrmDemo } from "@/features/crm/server/demo";
import { DemoShell } from "@/features/crm/components/demo-shell";
import { TasksView } from "@/features/crm/components/crm-views";

export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: {
  searchParams: Promise<{ demo?: string | string[] }>;
}) {
  const data = readCrmDemo((await searchParams).demo);
  return <DemoShell data={data}><TasksView key={data.demo} data={data} /></DemoShell>;
}
