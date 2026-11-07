import "server-only";
import { createPersistentCrm } from "./persistent-crm";
import { getAuthorizedCrmClient } from "./client";
import { createSuppliersCrm } from "./suppliers-service";

// Explicitly mixed while later CRM tickets keep their published mock contracts.
export const crmIntegration = {
  mode: "mixed",
  operations: {
    getContact: "persisted", upsertContact: "persisted", updateContact: "persisted", listContacts: "persisted",
    upsertSupplier: "persisted", updateSupplier: "persisted", getSupplier: "persisted", listSuppliers: "persisted", setSupplierWallet: "persisted",
    createPurchaseOrder: "persisted", getPurchaseOrder: "persisted", listPurchaseOrders: "persisted",
    refreshPurchaseOrder: "persisted", approvePurchaseOrder: "persisted",
    recordCallResult: "mock", scheduleFollowup: "mock", claimDueFollowups: "mock",
    completeFollowup: "mock", failFollowup: "mock",
  },
} as const;

const contacts = createPersistentCrm(async (ctx, operation, input) => {
  const authorized = await getAuthorizedCrmClient(ctx, { readOnlyCookies: true });
  if (!authorized.ok) return { data: authorized, error: null };
  return authorized.data.rpc("contacts_execute", { p_ctx: ctx, p_operation: operation, p_input: input });
});
export const getContact = contacts.getContact;
export const upsertContact = contacts.upsertContact;
export const updateContact = contacts.updateContact;
export const listContacts = contacts.listContacts;
const suppliers = createSuppliersCrm(async (ctx, operation, input) => {
  const authorized = await getAuthorizedCrmClient(ctx, { readOnlyCookies: true });
  if (!authorized.ok) return { data: authorized, error: null };
  return authorized.data.rpc("suppliers_execute", { p_ctx: ctx, p_operation: operation, p_input: input });
});
export const upsertSupplier = suppliers.upsertSupplier;
export const updateSupplier = suppliers.updateSupplier;
export const getSupplier = suppliers.getSupplier;
export const listSuppliers = suppliers.listSuppliers;
export const setSupplierWallet = suppliers.setSupplierWallet;
export { recordCallResult, scheduleFollowup, claimDueFollowups, completeFollowup, failFollowup } from "./mock-public";
// ORD-03: contratos de lectura y aprobación; pagos permanecen deshabilitados.
export {
  createPurchaseOrder, getPurchaseOrder, listPurchaseOrders,
  refreshPurchaseOrder, approvePurchaseOrder,
} from "./purchase-orders-public";
