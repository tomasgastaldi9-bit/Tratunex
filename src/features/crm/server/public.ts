import "server-only";
import { createPersistentCrm } from "./persistent-crm";
import { getAuthorizedCrmClient } from "./client";

// Explicitly mixed while later CRM tickets keep their published mock contracts.
export const crmIntegration = {
  mode: "mixed",
  operations: {
    getContact: "persisted", upsertContact: "persisted", updateContact: "persisted", listContacts: "persisted",
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
export { recordCallResult, scheduleFollowup, claimDueFollowups, completeFollowup, failFollowup } from "./mock-public";
