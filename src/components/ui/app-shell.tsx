"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
  demo: "prisma" | "orbita";
  companyName: string;
  companyIndustry: string;
};

const crmNavigation = [
  { href: "/pipeline", label: "Pipeline", icon: "▥" },
  { href: "/contacts", label: "Contactos", icon: "◎" },
  { href: "/tasks", label: "Seguimientos", icon: "☷" },
];

/** Shell compartido. El selector recorre escenarios mock; no administra membresías. */
export function AppShell({ children, demo, companyName, companyIndustry }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const current = pathname.startsWith("/contacts") ? "Contactos" : pathname.startsWith("/tasks") ? "Seguimientos" : "Pipeline";

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Ir al contenido</a>
      <aside className={`sidebar${menuOpen ? " sidebar-open" : ""}`}>
        <Link className="brand" href={`/pipeline?demo=${demo}`} aria-label="Tratunex · inicio">
          <span className="brand-mark" aria-hidden="true">t</span>tratunex
        </Link>
        <div className="company-switcher">
          <label className="field-label" htmlFor="demo-company">Empresa de demostración</label>
          <select id="demo-company" value={demo} onChange={(event) => {
            setMenuOpen(false);
            const destination = pathname === "/tasks" ? "/tasks" : pathname === "/contacts" ? "/contacts" : "/pipeline";
            router.push(`${destination}?demo=${event.target.value}`);
          }}>
            <option value="prisma">Distribuidora Prisma Ficticia</option>
            <option value="orbita">Agencia Órbita Ficticia</option>
          </select>
          <p className="company-description">{companyIndustry}</p>
        </div>
        <p className="nav-group-label">ESPACIO DE TRABAJO</p>
        <nav className="main-nav" aria-label="Navegación principal">
          {crmNavigation.map((item) => (
            <Link key={item.href} href={`${item.href}?demo=${demo}`}
              aria-current={pathname.startsWith(item.href) ? "page" : undefined}
              onClick={() => setMenuOpen(false)}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}
            </Link>
          ))}
        </nav>
        <div className="pending-modules">
          <p className="nav-group-label">MÓDULOS DEL EQUIPO</p>
          <p>Agente <span>Próximamente</span></p>
          <p>Prospección <span>Próximamente</span></p>
          <p>Llamadas <span>Próximamente</span></p>
        </div>
        <div className="sidebar-bottom">
          <span className="avatar" aria-hidden="true">D</span>
          <div><strong>Espacio de demostración</strong><span>Datos ficticios · modo mock</span></div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button className="button mobile-menu" type="button" aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
          <div className="breadcrumb"><span>CRM</span><span aria-hidden="true">/</span><strong>{current}</strong></div>
          <span className="badge badge-amber">Mock · datos ficticios</span>
        </header>
        <div className="workspace-note"><span>{companyName}</span><span>Horarios de Argentina · UTC−3</span></div>
        <main id="main-content" className="app-main" tabIndex={-1}>{children}</main>
        <footer className="app-footer">Demostración del CRM · datos ficticios · sin llamadas telefónicas</footer>
      </div>
    </div>
  );
}
