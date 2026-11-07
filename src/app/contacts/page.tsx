import { readCrmDemo } from "@/features/crm/server/demo";
import { DemoShell } from "@/features/crm/components/demo-shell";
import { ContactsView } from "@/features/crm/components/crm-views";

export const dynamic = "force-dynamic";

export default async function ContactsPage({ searchParams }: {
  searchParams: Promise<{ demo?: string | string[] }>;
}) {
  const data = readCrmDemo((await searchParams).demo);
  return <DemoShell data={data}><ContactsView key={data.demo} data={data} /></DemoShell>;
}
