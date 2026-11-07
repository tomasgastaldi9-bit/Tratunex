import { SetSupplierWalletInputSchema } from "@/contracts/crm";
import { mutateContact } from "@/features/crm/server/contacts-api";
import { setSupplierWallet } from "@/features/crm/server/public";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return mutateContact(request, SetSupplierWalletInputSchema.omit({ contact_id: true }), (ctx, input) =>
    setSupplierWallet(ctx, { ...input, contact_id: id }));
}
