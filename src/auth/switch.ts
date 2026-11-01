/**
 * Whether a product runs on the shared runtime yet: `AUTH_RUNTIME=accountkit`.
 * The one switch every product staging AccountKit beside Auth.js reads, so
 * "on" means the same thing everywhere. Free of every dependency, so a proxy
 * or a provider gate can ask without loading the runtime.
 */
export function sharedRuntimeEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.AUTH_RUNTIME === "accountkit";
}
