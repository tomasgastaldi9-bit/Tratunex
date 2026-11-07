import { getOrderRequest } from "@/features/crm/server/purchase-orders-api";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return getOrderRequest((await params).id);
}
