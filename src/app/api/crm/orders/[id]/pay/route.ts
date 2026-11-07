import { payOrderRequest } from "@/features/crm/server/purchase-orders-api";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return payOrderRequest(request, (await params).id);
}
