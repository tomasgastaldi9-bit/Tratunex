import { cookies } from "next/headers";
import { createServerSupabaseClient } from "./server";

export async function createRequestSupabaseClient(options: { readOnlyCookies?: boolean } = {}) {
  const store = await cookies();
  return createServerSupabaseClient({
    getAll: () => store.getAll(),
    setAll: (updates) => {
      try {
        updates.forEach(({ name, value, options }) => store.set(name, value, options));
      } catch (error) {
        // Server Components cannot write cookies; the proxy refreshes them.
        if (!options.readOnlyCookies) throw error;
      }
    },
  });
}
