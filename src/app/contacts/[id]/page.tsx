import { notFound } from "next/navigation";
import { GetContactInputSchema } from "@/contracts/crm";
import { ContactsAccessState, ContactDetailView } from "@/features/crm/components/contacts-view";
import { loadContactPage } from "@/features/crm/server/contacts-workspace";

export const dynamic = "force-dynamic";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const input = GetContactInputSchema.safeParse({ contact_id: id });
  if (!input.success) notFound();
  const result = await loadContactPage(input.data.contact_id);
  if (!result.ok) {
    if (result.error.code === "NOT_FOUND") notFound();
    return <ContactsAccessState code={result.error.code} message={result.error.message} />;
  }
  return <ContactDetailView company={result.data.company} contact={result.data.contact} />;
}
