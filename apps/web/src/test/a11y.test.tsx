import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { axe, toHaveNoViolations } from "jest-axe";
import { App } from "../app/App";
import { AuthProvider } from "../features/auth/AuthContext";

expect.extend(toHaveNoViolations);

describe("Accessibility smoke", () => {
  it("has no critical accessibility violations in app shell", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
