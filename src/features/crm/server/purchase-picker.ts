import "server-only";
import { getAuthorizedCrmClient } from "./client";
import { databaseFailure } from "./persistent-crm";
import { createPurchasePickerService } from "./purchase-picker-service";

/** Read-only index over BUY-01's published table and fields, scoped twice by company + RLS.
 * No budget conversion, duplicated business rules, or write to Agent-owned data.
 */
export const listPurchasesForComparison = createPurchasePickerService(async (ctx, { offset, limit }) => {
  const client = await getAuthorizedCrmClient(ctx, { readOnlyCookies: true });
  if (!client.ok) return client;
  const read = await client.data.from("purchase_requests").select("id,company_id,product,quantity,unit,needed_by")
    .eq("company_id", ctx.company_id).order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (read.error) return databaseFailure(read.error);
  return { ok: true, data: read.data };
});
