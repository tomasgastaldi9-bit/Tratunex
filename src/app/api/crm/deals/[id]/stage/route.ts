import { SetDealStageInputSchema } from "@/contracts/crm";
import { mutateContact } from "@/features/crm/server/contacts-api";
import { setDealStage } from "@/features/crm/server/public";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return mutateContact(request, SetDealStageInputSchema.omit({ deal_id: true }), (ctx, input) =>
    setDealStage(ctx, { ...input, deal_id: id }));
}
