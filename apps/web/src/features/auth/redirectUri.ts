/** OAuth state is origin-scoped; callbacks must return to the initiating origin. */
export function resolveAuthRedirectUri(origin: string, configuredUri = ""): string {
  const fallback = `${origin}/login`;
  if (!configuredUri) return fallback;
  try {
    const configured = new URL(configuredUri, origin);
    if (configured.origin === origin && !configured.search && !configured.hash) {
      return configured.href;
    }
  } catch {
    // Invalid or cross-origin configuration must not strand the login transaction.
  }
  return fallback;
}
