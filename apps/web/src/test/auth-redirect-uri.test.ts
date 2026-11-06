import { describe, expect, it } from "vitest";
import { resolveAuthRedirectUri } from "../features/auth/redirectUri";

describe("same-origin authentication callbacks", () => {
  it("keeps the custom domain when an old Netlify callback is configured", () => {
    expect(resolveAuthRedirectUri("https://rolodex.accessinsights.net", "https://ai-rolodex.netlify.app/login"))
      .toBe("https://rolodex.accessinsights.net/login");
  });
  it("keeps the Netlify domain when signing in there", () => {
    expect(resolveAuthRedirectUri("https://ai-rolodex.netlify.app", "https://ai-rolodex.netlify.app/login"))
      .toBe("https://ai-rolodex.netlify.app/login");
  });
  it("preserves same-origin configured callback paths", () => {
    expect(resolveAuthRedirectUri("https://example.com", "/auth/callback"))
      .toBe("https://example.com/auth/callback");
  });
  it.each(["", "https://other.example/login", "//other.example/login", "javascript:alert(1)", "https://example.com/login#code=example", "https://example.com/login?next=other"])("safely defaults for %s", (configured) => {
    expect(resolveAuthRedirectUri("https://example.com", configured)).toBe("https://example.com/login");
  });
  it("supports the registered local development callback", () => {
    expect(resolveAuthRedirectUri("http://localhost:8888", "https://ai-rolodex.netlify.app/login"))
      .toBe("http://localhost:8888/login");
  });
});
