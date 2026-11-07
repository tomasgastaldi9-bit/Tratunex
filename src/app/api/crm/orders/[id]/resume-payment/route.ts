import { resumeOrderPaymentRequest } from "@/features/crm/server/purchase-orders-api";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return resumeOrderPaymentRequest(request, (await params).id);
}
