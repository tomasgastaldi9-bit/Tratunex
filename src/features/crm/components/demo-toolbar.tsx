"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { ModeBadge } from "@/components/ui/StatusBadges";

// Escenario ficticio de UI, nunca identidad, sesión ni empresa autorizada.
function remember(value: string) {
  document.cookie = `tratunex_demo=${value}; Path=/; SameSite=Lax; Max-Age=86400`;
}

export function DemoToolbar({ demo, companyName }: { demo: "prisma" | "orbita"; companyName: string }) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => { remember(demo); }, [demo]);

  return <div className="flex flex-wrap items-center justify-between gap-5 border-b border-line pb-5">
    <div className="min-w-0"><p className="text-sm font-bold">{companyName}</p>
      <p className="mt-1 text-xs text-ink-muted">Demostración mock · horarios de Argentina</p></div>
    <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
      <div className="w-full sm:w-64"><Select label="Empresa de demostración" hideLabel value={demo}
        options={[{ value: "prisma", label: "Distribuidora Prisma Ficticia" }, { value: "orbita", label: "Agencia Órbita Ficticia" }]}
        onChange={(event) => {
          remember(event.target.value);
          const destination = pathname === "/tasks" ? "/tasks" : pathname === "/contacts" ? "/contacts" : "/pipeline";
          router.push(`${destination}?demo=${event.target.value}`);
        }} /></div>
      <ModeBadge mode="mock" />
    </div>
  </div>;
}
