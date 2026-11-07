import { ContactListInputSchema } from "@/contracts/crm";
import { ContactsAccessState, ContactsListView } from "@/features/crm/components/contacts-view";
import { loadContactsPage } from "@/features/crm/server/contacts-workspace";

export const dynamic = "force-dynamic";

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // Native GET forms send blank optional filters; repeated values and unknown keys still fail validation.
  const input = ContactListInputSchema.safeParse(Object.fromEntries(Object.entries(params).filter(([, value]) => value !== "" && value !== undefined)));
  if (!input.success) return <ContactsAccessState code="VALIDATION_ERROR" />;
  const result = await loadContactsPage({ readOnlyCookies: true, input: input.data });
  if (!result.ok) return <ContactsAccessState code={result.error.code} message={result.error.message} />;
  return <ContactsListView company={result.data.company} page={result.data.page} filters={input.data} />;
}
