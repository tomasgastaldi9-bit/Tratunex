import { z } from "zod";

// Contratos de CRM (TRA-54). Ctx, ActionCtx y Result<T> pertenecen a
// contracts/common.ts (Tomás); estos schemas describen los payloads de data.
// Los campos de DTO que el brief no detalla son una propuesta para sus consumidores.
const IdSchema = z.string().uuid();
const UtcSchema = z.string().datetime();
const TextSchema = z.string().trim().min(1);
const ExternalEventIdSchema = z.string().min(1).refine(
  (value) => value === value.trim(),
  "El ID externo debe conservarse sin espacios agregados",
);
const WebUrlSchema = z.string().url().refine(
  (value) => /^https?:\/\//i.test(value),
  "La URL debe usar http o https",
);

export const PipelineStageSchema = z.enum([
  "new",
  "contacted",
  "potential_client",
  "follow_up",
  "won",
  "lost",
  "disqualified",
]);

export const PIPELINE_STAGES = [
  { code: "new", label: "Nuevo" },
  { code: "contacted", label: "Contactado" },
  { code: "potential_client", label: "Cliente potencial" },
  { code: "follow_up", label: "En seguimiento" },
  { code: "won", label: "Compró" },
  { code: "lost", label: "No compró" },
  { code: "disqualified", label: "No calificado" },
] as const satisfies readonly { code: z.infer<typeof PipelineStageSchema>; label: string }[];

export const PhoneE164Schema = z.string().regex(/^\+[1-9]\d{6,14}$/, "Usá formato E.164");
export const ContactSourceSchema = z.object({
  kind: z.enum(["csv", "firecrawl", "manual"]),
  label: TextSchema,
  url: WebUrlSchema.nullable(),
});

export const ContactDTOSchema = z.object({
  id: IdSchema,
  company_id: IdSchema,
  name: TextSchema,
  organization: TextSchema.nullable(),
  phone_e164: PhoneE164Schema,
  website: WebUrlSchema.nullable(),
  source: ContactSourceSchema,
  do_not_contact: z.boolean(),
  created_at: UtcSchema,
  updated_at: UtcSchema,
});

export const DealDTOSchema = z.object({
  id: IdSchema,
  company_id: IdSchema,
  contact_id: IdSchema,
  title: TextSchema,
  stage: PipelineStageSchema,
  created_at: UtcSchema,
  updated_at: UtcSchema,
});

export const TaskKindSchema = z.enum(["callback", "human_review"]);
export const TaskStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled"]);

export const TaskDTOSchema = z.object({
  id: IdSchema,
  company_id: IdSchema,
  contact_id: IdSchema,
  deal_id: IdSchema.nullable(),
  source_call_id: IdSchema.nullable(),
  kind: TaskKindSchema,
  status: TaskStatusSchema,
  due_at: UtcSchema.nullable(),
  reason: TextSchema,
  attempts: z.number().int().nonnegative(),
  lease_id: IdSchema.nullable(),
  lease_expires_at: UtcSchema.nullable(),
  call_id: IdSchema.nullable(),
  // Código estable de fallo; su catálogo debe acordarse con Voz/Plataforma.
  error_code: TextSchema.nullable(),
  created_at: UtcSchema,
  updated_at: UtcSchema,
}).superRefine((task, ctx) => {
  if (task.kind === "callback" && task.due_at === null) {
    ctx.addIssue({ code: "custom", path: ["due_at"], message: "Un callback requiere fecha UTC" });
  }
  if (task.status === "running" && (!task.lease_id || !task.lease_expires_at)) {
    ctx.addIssue({ code: "custom", path: ["lease_id"], message: "Una tarea running requiere lease y vencimiento" });
  }
});

export const NextActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("callback"), due_at: UtcSchema, reason: TextSchema }),
  z.object({ type: z.literal("human_review"), due_at: UtcSchema.nullable(), reason: TextSchema }),
]);

// Contrato de integración literal de docs/BRIEF.md §10. La implementación y el
// webhook de Voz siguen siendo de Bautista. No añadir campos de identidad al input.
export const CallResultV1Schema = z.object({
  schema_version: z.literal("1"),
  event_id: ExternalEventIdSchema, // ID externo estable: no necesariamente UUID.
  occurred_at: UtcSchema,
  company_id: IdSchema,
  call_id: IdSchema,
  contact_id: IdSchema,
  deal_id: IdSchema.nullable(),
  agent_version: z.number().int().positive(),
  technical_status: z.enum(["completed", "failed"]),
  answered_by: z.enum(["human", "voicemail", "unknown"]),
  is_potential_client: z.enum(["yes", "no", "unknown"]),
  outcome: z.enum(["interested", "not_interested", "callback_requested", "wants_to_buy", "not_assessed"]),
  do_not_contact_requested: z.boolean(),
  score: z.number().min(0).max(100).nullable(),
  summary: TextSchema,
  transcript_url: WebUrlSchema.nullable(),
  next_action: NextActionSchema.nullable(),
});

// Los inputs de navegador no aceptan company_id, actor, action_id ni timestamps
// administrados por servidor. ActionCtx se recibe separado y viene de Plataforma.
export const UpsertContactInputSchema = z.object({
  name: TextSchema,
  organization: TextSchema.nullable(),
  phone_e164: PhoneE164Schema,
  website: WebUrlSchema.nullable(),
  source: ContactSourceSchema,
  // En el servidor es sticky: false/omisión jamás revierte un true existente.
  do_not_contact: z.boolean().optional(),
}).strict();
export const GetContactInputSchema = z.object({ contact_id: IdSchema }).strict();
export const ScheduleFollowupInputSchema = z.object({
  contact_id: IdSchema,
  deal_id: IdSchema.optional(),
  source_call_id: IdSchema.optional(),
  kind: TaskKindSchema,
  due_at: UtcSchema.nullable(),
  reason: TextSchema,
}).strict().superRefine((input, ctx) => {
  if (input.kind === "callback" && input.due_at === null) {
    ctx.addIssue({ code: "custom", path: ["due_at"], message: "Un callback requiere fecha UTC" });
  }
});
export const ClaimDueFollowupsInputSchema = z.object({
  limit: z.number().int().positive(),
  lease_seconds: z.number().int().positive(),
}).strict();
export const CompleteFollowupInputSchema = z.object({
  task_id: IdSchema,
  call_id: IdSchema,
  lease_id: IdSchema,
}).strict();
export const FailFollowupInputSchema = z.object({
  task_id: IdSchema,
  lease_id: IdSchema,
  error_code: TextSchema,
  retry_at: UtcSchema.optional(),
}).strict();

export const UpsertContactDataSchema = z.object({ contact: ContactDTOSchema, created: z.boolean() });
export const GetContactDataSchema = z.object({ contact: ContactDTOSchema });
export const RecordCallResultDataSchema = z.object({
  event_id: ExternalEventIdSchema,
  duplicate: z.boolean(),
  deal: DealDTOSchema.nullable(),
  tasks: z.array(TaskDTOSchema),
});
export const FollowupDataSchema = z.object({ task: TaskDTOSchema });
export const ClaimDueFollowupsDataSchema = z.object({ tasks: z.array(TaskDTOSchema) });

// Catálogo de payloads, consumido por las siete operaciones de server/public.ts.
// Ctx, ActionCtx y Result<T> se importan del contrato común de Plataforma.
export const crmOperationSchemas = {
  upsertContact: { input: UpsertContactInputSchema, data: UpsertContactDataSchema },
  getContact: { input: GetContactInputSchema, data: GetContactDataSchema },
  recordCallResult: { input: CallResultV1Schema, data: RecordCallResultDataSchema },
  scheduleFollowup: { input: ScheduleFollowupInputSchema, data: FollowupDataSchema },
  claimDueFollowups: { input: ClaimDueFollowupsInputSchema, data: ClaimDueFollowupsDataSchema },
  completeFollowup: { input: CompleteFollowupInputSchema, data: FollowupDataSchema },
  failFollowup: { input: FailFollowupInputSchema, data: FollowupDataSchema },
} as const;

export type PipelineStage = z.infer<typeof PipelineStageSchema>;
export type ContactDTO = z.infer<typeof ContactDTOSchema>;
export type DealDTO = z.infer<typeof DealDTOSchema>;
export type TaskDTO = z.infer<typeof TaskDTOSchema>;
export type CallResultV1 = z.infer<typeof CallResultV1Schema>;
export type UpsertContactInput = z.infer<typeof UpsertContactInputSchema>;
export type GetContactInput = z.infer<typeof GetContactInputSchema>;
export type ScheduleFollowupInput = z.infer<typeof ScheduleFollowupInputSchema>;
export type ClaimDueFollowupsInput = z.infer<typeof ClaimDueFollowupsInputSchema>;
export type CompleteFollowupInput = z.infer<typeof CompleteFollowupInputSchema>;
export type FailFollowupInput = z.infer<typeof FailFollowupInputSchema>;
export type UpsertContactData = z.infer<typeof UpsertContactDataSchema>;
export type GetContactData = z.infer<typeof GetContactDataSchema>;
export type RecordCallResultData = z.infer<typeof RecordCallResultDataSchema>;
export type FollowupData = z.infer<typeof FollowupDataSchema>;
export type ClaimDueFollowupsData = z.infer<typeof ClaimDueFollowupsDataSchema>;

// CRM-03: edición explícita por ID; upsert conserva su firma para importadores.
export const UpdateContactInputSchema = UpsertContactInputSchema.extend({ contact_id: IdSchema });
export const ContactListInputSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: IdSchema.optional(),
  query: z.string().trim().min(1).max(100).optional(),
  source: z.enum(["csv", "firecrawl", "manual"]).optional(),
  do_not_contact: z.enum(["true", "false"]).optional(),
}).strict();
export const ContactPageSchema = z.object({
  items: z.array(ContactDTOSchema), next_cursor: IdSchema.nullable(),
});
export type UpdateContactInput = z.infer<typeof UpdateContactInputSchema>;
export type ContactListInput = z.infer<typeof ContactListInputSchema>;
export type ContactPage = z.infer<typeof ContactPageSchema>;

// ORD-01: información comercial de proveedor, con destino cargado por una persona.
export const SupplierChainSchema = z.enum(["base", "arbitrum"]);
export const CollectionWalletSchema = z.object({
  chain: SupplierChainSchema,
  // Preserve the entered casing; this schema checks syntax, not ERC-55 ownership or balances.
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Usá una dirección EVM completa con 0x")
    .refine(address => !/^0x0{40}$/i.test(address), "La dirección cero no puede recibir el cobro"),
}).strict();
export const SupplierDTOSchema = ContactDTOSchema.extend({
  is_supplier: z.literal(true),
  collection_wallet: CollectionWalletSchema.nullable(),
  wallet_version: z.number().int().nonnegative(),
  wallet_updated_at: UtcSchema.nullable(),
});
export const SupplierDataSchema = z.object({ supplier: SupplierDTOSchema });
export const UpsertSupplierDataSchema = SupplierDataSchema.extend({ created: z.boolean() });
export const SupplierListInputSchema = ContactListInputSchema.extend({
  wallet_status: z.enum(["pending", "configured"]).optional(),
});
export const SupplierPageSchema = z.object({ items: z.array(SupplierDTOSchema), next_cursor: IdSchema.nullable() });
export const SetSupplierWalletInputSchema = z.object({
  contact_id: IdSchema,
  collection_wallet: CollectionWalletSchema.nullable(),
  expected_wallet_version: z.number().int().nonnegative(),
}).strict();
export type SupplierDTO = z.infer<typeof SupplierDTOSchema>;
export type CollectionWallet = z.infer<typeof CollectionWalletSchema>;
export type SupplierListInput = z.infer<typeof SupplierListInputSchema>;
export type SetSupplierWalletInput = z.infer<typeof SetSupplierWalletInputSchema>;
