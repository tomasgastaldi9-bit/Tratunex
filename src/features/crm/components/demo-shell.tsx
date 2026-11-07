import type { ReactNode } from "react";
import { AppShell } from "@/components/ui/AppShell";
import { DemoToolbar } from "./demo-toolbar";
import type { CrmDemoData } from "../server/demo";
import "./crm.css";

export function DemoShell({ data, children }: { data: CrmDemoData; children: ReactNode }) {
  return <AppShell><DemoToolbar demo={data.demo} companyName={data.company.name} />{children}
    <footer className="mt-auto pt-5 text-xs text-ink-muted">Datos ficticios · sin llamadas telefónicas</footer>
  </AppShell>;
}
