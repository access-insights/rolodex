import { act, fireEvent, render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { LoginPage } from "../features/auth/LoginPage";

const auth = vi.hoisted(() => ({ user: null, isLoading: false, authError: null as string | null, login: vi.fn() }));
vi.mock("../features/auth/AuthContext", () => ({ useAuth: () => auth }));
beforeEach(() => { auth.isLoading = false; auth.authError = null; auth.login.mockReset(); });
afterEach(cleanup);
const renderLogin = () => render(<MemoryRouter><LoginPage /></MemoryRouter>);

describe("Login error and interrupted flows", () => {
  it("shows redirect errors as an accessible alert", () => {
    auth.authError = "Microsoft sign-in could not be completed.";
    renderLogin();
    expect(screen.getByRole("alert")).toHaveTextContent(auth.authError);
  });
  it("catches rejected login without exposing raw error details and allows retry", async () => {
    auth.login.mockRejectedValueOnce(new Error("private-raw-error"));
    renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "Login" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to start Microsoft sign-in");
    expect(screen.queryByText("private-raw-error")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Login" })).toBeEnabled();
    auth.login.mockResolvedValueOnce(undefined);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Login" })); });
    expect(auth.login).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("blocks repeated clicks while login is pending", async () => {
    let finish!: () => void;
    auth.login.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "Login" }));
    const button = screen.getByRole("button", { name: "Signing in..." });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(auth.login).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
  });
  it("does not start login before authentication initialization completes", () => {
    auth.isLoading = true;
    renderLogin();
    const button = screen.getByRole("button", { name: "Login" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(auth.login).not.toHaveBeenCalled();
  });
});
