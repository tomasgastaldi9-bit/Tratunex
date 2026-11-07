"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buttonStyles } from "@/components/ui/Button";

export function DemoBackLink() {
  const query = useSearchParams();
  const selected = query.get("demo");
  const href = selected === null ? "/pipeline" : `/pipeline?demo=${selected === "orbita" ? "orbita" : "prisma"}`;
  return <Link className={buttonStyles()} href={href}>Volver al pipeline</Link>;
}
