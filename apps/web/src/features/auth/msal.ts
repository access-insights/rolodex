import { PublicClientApplication } from "@azure/msal-browser";

const clientId = import.meta.env.VITE_AZURE_CLIENT_ID || "";
const tenantId = import.meta.env.VITE_AZURE_TENANT_ID || "common";
const redirectUri = import.meta.env.VITE_AZURE_REDIRECT_URI || window.location.origin;
const postLogoutRedirectUri = import.meta.env.VITE_AZURE_POST_LOGOUT_REDIRECT_URI || `${window.location.origin}/login`;

let msalInstance: PublicClientApplication | null = null;

export function getMsalInstance(): PublicClientApplication | null {
  if (msalInstance) return msalInstance;

  if (typeof window === "undefined") return null;
  if (!window.crypto?.subtle) return null;
  if (!clientId) return null;

  msalInstance = new PublicClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri,
      postLogoutRedirectUri
    },
    cache: {
      cacheLocation: "sessionStorage"
    }
  });

  return msalInstance;
}
