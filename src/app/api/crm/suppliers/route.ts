import { UpsertContactInputSchema } from "@/contracts/crm";
import { mutateContact } from "@/features/crm/server/contacts-api";
import { listSuppliersRequest } from "@/features/crm/server/suppliers-api";
import { upsertSupplier } from "@/features/crm/server/public";
export const GET = listSuppliersRequest;
export const POST = (request: Request) => mutateContact(request, UpsertContactInputSchema, upsertSupplier);
