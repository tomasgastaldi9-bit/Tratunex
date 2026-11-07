import type { ReactNode } from "react";
import { AppShell } from "@/components/ui/app-shell";
import type { CrmDemoData } from "../server/demo";

export function DemoShell({ data, children }: { data: CrmDemoData; children: ReactNode }) {
  return <AppShell demo={data.demo} companyName={data.company.name} companyIndustry={data.company.industry}>{children}</AppShell>;
}
