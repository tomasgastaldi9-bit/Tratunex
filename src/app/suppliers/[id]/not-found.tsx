import Link from "next/link";
import { buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SuppliersFrame } from "@/features/crm/components/supplier-view";

export default function SupplierNotFound() {
  return <SuppliersFrame><EmptyState title="Este proveedor no está disponible"
    description="Volvé a la lista de la empresa activa para consultar sus proveedores."
    action={<Link href="/suppliers" className={buttonStyles({ variant: "secondary" })}>Volver a proveedores</Link>} /></SuppliersFrame>;
}
