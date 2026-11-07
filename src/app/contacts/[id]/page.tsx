import { notFound } from "next/navigation";
import { getContact } from "@/features/crm/server/public";
import { GetContactInputSchema } from "@/contracts/crm";
import { readCrmDemo } from "@/features/crm/server/demo";
import { DemoShell } from "@/features/crm/components/demo-shell";
import { ContactView } from "@/features/crm/components/crm-views";

export const dynamic = "force-dynamic";

export default async function ContactPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ demo?: string | string[] }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const data = readCrmDemo(query.demo);
  const input = GetContactInputSchema.safeParse({ contact_id: id });
  if (!input.success) notFound();
  // Actor de demostración fijo. No reemplaza sesión, RLS ni permisos reales.
  const result = await getContact({ company_id: data.company.id, actor_type: "system", actor_id: "crm-demo" }, input.data);
  if (!result.ok) notFound();
  return <DemoShell data={data}><ContactView data={data} contactId={result.data.contact.id} /></DemoShell>;
}
