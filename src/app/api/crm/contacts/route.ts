import { UpsertContactInputSchema } from "@/contracts/crm";
import { listContactsRequest, mutateContact } from "@/features/crm/server/contacts-api";
import { upsertContact } from "@/features/crm/server/public";
export const GET = listContactsRequest;
export const POST = (request: Request) => mutateContact(request, UpsertContactInputSchema, upsertContact);
