// Preload for the explicitly local verification child only. Never used by app runtime/deploy.
if (process.env.CRM_LOCAL_VERIFICATION !== "loopback-fixtures-only") throw new Error("This network guard is verification-only");
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, options) => {
  const raw = typeof input === "string" || input instanceof URL ? input : input.url;
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || !["3101", "55440"].includes(url.port)) {
    return Promise.reject(new Error("External integrations are disabled in local verification"));
  }
  return originalFetch(input, options);
};
