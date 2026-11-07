import { z } from "zod";
import { prospectSearchInputSchema, type ProspectCandidate, type ProspectSearchInput } from "../../../contracts/discovery";

export type SearchInput = ProspectSearchInput;
export type Candidate = ProspectCandidate;
export const parseSearchInput = (input: unknown): SearchInput => prospectSearchInputSchema.parse(input);

export function parseFirecrawlResults(input: unknown, limit: number): Candidate[] {
  const response = z.object({ success: z.literal(true), data: z.object({ web: z.array(z.object({ url: z.string(), title: z.string().optional(), markdown: z.string().optional(), json: z.unknown().optional() })).optional() }) }).parse(input);
  return (response.data.web ?? []).flatMap((item): Candidate[] => {
    let url: URL;
    try { url = new URL(item.url); } catch { return []; }
    if (!['http:', 'https:'].includes(url.protocol)) return [];
    let extracted = item.json;
    if (typeof extracted === "string") { try { extracted = JSON.parse(extracted); } catch { return []; } }
    const parsed = z.object({ company_name: z.string().trim().min(2).max(200), is_official_website: z.literal(true) }).safeParse(extracted);
    const content = item.markdown ?? "";
    if (!parsed.success || !content.toLocaleLowerCase().includes(parsed.data.company_name.toLocaleLowerCase()) || !item.title?.toLocaleLowerCase().includes(parsed.data.company_name.toLocaleLowerCase())) return [];
    const match = content.match(/(?:tel[eé]fono|tel\.?|phone|whatsapp)\s*[:：-]?\s*((?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)\d{3,4}[\s.-]?\d{3,4})/i);
    const phone = match?.[1] ?? null;
    return [{ name: parsed.data.company_name, phone, website: url.origin, source_url: url.href, evidence: match?.[0] ?? null }];
  }).slice(0, limit);
}
