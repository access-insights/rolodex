import { afterEach, describe, expect, it, vi } from "vitest";
const capture = vi.hoisted(() => vi.fn());
vi.mock("@azure/msal-browser", () => ({
  PublicClientApplication: class {
    constructor(configuration: unknown) { capture(configuration); }
  }
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  capture.mockClear();
});
describe("MSAL callback configuration", () => {
  it.each(["https://rolodex.accessinsights.net", "https://ai-rolodex.netlify.app"])("uses the initiating origin %s with stale Netlify configuration", async (origin) => {
    vi.stubEnv("VITE_AZURE_CLIENT_ID", "test-client");
    vi.stubEnv("VITE_AZURE_TENANT_ID", "test-tenant");
    vi.stubEnv("VITE_AZURE_REDIRECT_URI", "https://ai-rolodex.netlify.app/login");
    vi.stubEnv("VITE_AZURE_POST_LOGOUT_REDIRECT_URI", "https://ai-rolodex.netlify.app/login");
    vi.stubGlobal("window", { location: { origin }, crypto: { subtle: {} } });
    const { getMsalInstance } = await import("../features/auth/msal");
    const instance = getMsalInstance();
    expect(instance).not.toBeNull();
    expect(getMsalInstance()).toBe(instance);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith({
      auth: {
        clientId: "test-client",
        authority: "https://login.microsoftonline.com/test-tenant",
        redirectUri: `${origin}/login`,
        postLogoutRedirectUri: `${origin}/login`
      },
      cache: { cacheLocation: "sessionStorage" }
    });
  });
});
