import { render, screen, cleanup } from "@testing-library/react";
import { vi } from "vitest";
import { AuthProvider, useAuth } from "../features/auth/AuthContext";
const msal = vi.hoisted(() => ({ initialize: vi.fn(), handleRedirectPromise: vi.fn(), getAllAccounts: vi.fn() }));
vi.mock("../features/auth/msal", () => ({ getMsalInstance: () => msal }));
const api = vi.hoisted(() => ({ setApiAuthToken: vi.fn(), setApiAuthTokenProvider: vi.fn() }));
vi.mock("../lib/apiClient", () => api);
function Probe() {
  const { user, isLoading, authError } = useAuth();
  return <div>{isLoading ? "Loading" : "Ready"}{user ? "Signed in" : "Signed out"}{authError && <p role="alert">{authError}</p>}</div>;
}
afterEach(cleanup);
it("clears authorization and reports redirect failures rather than silently returning to login", async () => {
  msal.initialize.mockResolvedValue(undefined);
  msal.handleRedirectPromise.mockRejectedValue(new Error("private-error-detail"));
  render(<AuthProvider><Probe /></AuthProvider>);
  expect(await screen.findByRole("alert")).toHaveTextContent("Microsoft sign-in could not be completed");
  expect(screen.getByText(/ReadySigned out/)).toBeInTheDocument();
  expect(api.setApiAuthToken).toHaveBeenCalledWith(null);
  expect(api.setApiAuthTokenProvider).toHaveBeenCalledWith(null);
  expect(screen.queryByText("private-error-detail")).not.toBeInTheDocument();
});
