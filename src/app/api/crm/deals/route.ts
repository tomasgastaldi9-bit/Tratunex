import { CreateDealInputSchema } from "@/contracts/crm";
import { mutateContact } from "@/features/crm/server/contacts-api";
import { listPipelineRequest } from "@/features/crm/server/pipeline-api";
import { createDeal } from "@/features/crm/server/public";
export const GET = (request: Request) => listPipelineRequest(request, "deals");
export const POST = (request: Request) => mutateContact(request, CreateDealInputSchema, createDeal);
