import "server-only";

// Every call revalidates the session and the user's current membership.
export { getCompanyContext } from "@/lib/auth/company";
