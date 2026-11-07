import { createOrderRequest, listOrdersRequest } from "@/features/crm/server/purchase-orders-api";
export const GET = listOrdersRequest;
export const POST = createOrderRequest;
