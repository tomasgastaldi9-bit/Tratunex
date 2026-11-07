import Link from "next/link";
import { buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ContactsFrame } from "@/features/crm/components/contacts-view";

export default function ContactNotFound() {
  return <ContactsFrame><EmptyState title="Este contacto no está disponible"
    description="Volvé a la lista de la empresa activa para consultar sus contactos."
    action={<Link href="/contacts" className={buttonStyles({ variant: "secondary" })}>Volver a contactos</Link>} /></ContactsFrame>;
}
