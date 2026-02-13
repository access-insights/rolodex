import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ContactsListPage } from "../features/contacts/ContactsListPage";

const mockListContacts = vi.fn();
let role: "admin" | "creator" | "participant" = "participant";

vi.mock("../features/auth/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u-1", email: "user@example.com", role },
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn()
  })
}));

vi.mock("../lib/apiClient", () => ({
  apiClient: {
    listContacts: (...args: unknown[]) => mockListContacts(...args),
    importLinkedIn: vi.fn(),
    importCsv: vi.fn(),
    deleteContact: vi.fn()
  }
}));

describe("Contacts list role behavior", () => {
  beforeEach(() => {
    mockListContacts.mockResolvedValue({
      ok: true,
      data: [
        {
          id: "33333333-3333-3333-3333-333333333331",
          firstName: "Jordan",
          lastName: "Price",
          company: "Bright Path Advisors",
          contactType: "Advisor",
          status: "Active",
          attributes: []
        }
      ]
    });
  });

  it("shows delete button for admin", async () => {
    role = "admin";

    render(
      <MemoryRouter>
        <ContactsListPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("hides delete button for non-admin roles", async () => {
    role = "participant";

    render(
      <MemoryRouter>
        <ContactsListPage />
      </MemoryRouter>
    );

    await screen.findByText(/loaded/i);
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });
});
