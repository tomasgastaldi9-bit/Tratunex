import { z } from "zod";

export const prospectSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(120),
  location: z.string().trim().min(1).max(120),
  limit: z.number().int().min(1).max(5),
});
export const prospectCandidateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().nullable(),
  website: z.url(),
  source_url: z.url(),
  evidence: z.string().nullable(),
});
export type ProspectSearchInput = z.infer<typeof prospectSearchInputSchema>;
export type ProspectCandidate = z.infer<typeof prospectCandidateSchema>;
