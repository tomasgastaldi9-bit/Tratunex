"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function DemoBackLink() {
  const query = useSearchParams();
  const demo = query.get("demo") === "orbita" ? "orbita" : "prisma";
  return <Link className="button button-primary" href={`/pipeline?demo=${demo}`}>Volver al pipeline</Link>;
}
