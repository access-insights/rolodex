import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ContactDetailPage } from "../features/contacts/ContactDetailPage";

const mockGetContact = vi.fn();
const mockAddComment = vi.fn();
const mockUpdateContact = vi.fn();
const mockListContacts = vi.fn();

vi.mock("../features/auth/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u-1", email: "admin@example.com", role: "admin" },
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn()
  })
}));

vi.mock("../lib/apiClient", () => ({
  apiClient: {
    getContact: (...args: unknown[]) => mockGetContact(...args),
    updateContact: (...args: unknown[]) => mockUpdateContact(...args),
    listContacts: (...args: unknown[]) => mockListContacts(...args),
    addComment: (...args: unknown[]) => mockAddComment(...args),
    archiveComment: vi.fn(),
    deleteComment: vi.fn(),
    deleteContact: vi.fn()
  }
}));

describe("Contact detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListContacts.mockResolvedValue({ ok: true, data: [] });
  });

  it("renders contact details from API data", async () => {
    mockGetContact.mockResolvedValue({
      ok: true,
      data: {
        id: "33333333-3333-3333-3333-333333333331",
        firstName: "Jordan",
        lastName: "Price",
        company: "Bright Path Advisors",
        role: "Lead Advisor",
        internalContact: "Alex Admin",
        referredBy: "",
        referredByContactId: null,
        contactType: "Advisor",
        status: "Active",
        linkedInProfileUrl: "https://www.linkedin.com/in/jordan-price",
        linkedInPictureUrl: null,
        linkedInCompany: null,
        linkedInJobTitle: null,
        linkedInLocation: null,
        attributes: [],
        phones: [{ value: "555-0100", label: "Office" }],
        emails: [{ value: "jordan@example.com", label: "Work" }],
        websites: [{ value: "https://example.com", label: "Main" }],
        referrals: [],
        comments: []
      }
    });

    render(
      <MemoryRouter initialEntries={["/contacts/33333333-3333-3333-3333-333333333331"]}>
        <Routes>
          <Route path="/contacts/:id" element={<ContactDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: /price, jordan/i })).toBeInTheDocument();
    expect(screen.getByText("Bright Path Advisors")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /first name/i })).not.toBeInTheDocument();
  });

  it("adds a comment and updates visible comments", async () => {
    mockGetContact
      .mockResolvedValueOnce({
        ok: true,
        data: {
          id: "33333333-3333-3333-3333-333333333331",
          firstName: "Jordan",
          lastName: "Price",
          company: "Bright Path Advisors",
          role: "Lead Advisor",
          internalContact: "Alex Admin",
          referredBy: "",
          referredByContactId: null,
          contactType: "Advisor",
          status: "Active",
          linkedInProfileUrl: "",
          linkedInPictureUrl: null,
          linkedInCompany: null,
          linkedInJobTitle: null,
          linkedInLocation: null,
          attributes: [],
          phones: [],
          emails: [],
          websites: [],
          referrals: [],
          comments: []
        }
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          id: "33333333-3333-3333-3333-333333333331",
          firstName: "Jordan",
          lastName: "Price",
          company: "Bright Path Advisors",
          role: "Lead Advisor",
          internalContact: "Alex Admin",
          referredBy: "",
          referredByContactId: null,
          contactType: "Advisor",
          status: "Active",
          linkedInProfileUrl: "",
          linkedInPictureUrl: null,
          linkedInCompany: null,
          linkedInJobTitle: null,
          linkedInLocation: null,
          attributes: [],
          phones: [],
          emails: [],
          websites: [],
          referrals: [],
          comments: [
            {
              id: "c-1",
              body: "Follow up next week",
              archived: false,
              createdAt: "2026-02-13T10:00:00.000Z",
              authorDisplayName: "Alex Admin"
            }
          ]
        }
      });

    mockAddComment.mockResolvedValue({ ok: true, data: { id: "c-1" } });

    render(
      <MemoryRouter initialEntries={["/contacts/33333333-3333-3333-3333-333333333331"]}>
        <Routes>
          <Route path="/contacts/:id" element={<ContactDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Add comment"), "Follow up next week");
    await user.click(screen.getByRole("button", { name: "Add Comment" }));

    await waitFor(() => {
      expect(screen.getByText("Follow up next week")).toBeInTheDocument();
    });
  });

  it("normalizes string attributes before saving", async () => {
    const contactId = "33333333-3333-3333-3333-333333333331";

    mockGetContact.mockResolvedValue({
      ok: true,
      data: {
        id: contactId,
        firstName: "Jordan",
        lastName: "Price",
        company: "Bright Path Advisors",
        role: "Lead Advisor",
        internalContact: "Alex Admin",
        referredBy: "",
        referredByContactId: null,
        contactType: "Advisor",
        status: "Active",
        linkedInProfileUrl: "",
        linkedInPictureUrl: null,
        linkedInCompany: null,
        linkedInJobTitle: null,
        linkedInLocation: null,
        attributes: "{Academia,\"AI Solutions\"}",
        phones: [],
        emails: [],
        websites: [],
        referrals: [],
        comments: []
      }
    });

    mockUpdateContact.mockResolvedValue({
      ok: true,
      data: {
        id: contactId,
        firstName: "Jordan",
        lastName: "Price",
        company: "Bright Path Advisors",
        role: "Lead Advisor",
        internalContact: "Alex Admin",
        referredBy: "",
        referredByContactId: null,
        contactType: "Advisor",
        status: "Active",
        linkedInProfileUrl: "",
        linkedInPictureUrl: null,
        linkedInCompany: null,
        linkedInJobTitle: null,
        linkedInLocation: null,
        attributes: ["Academia", "AI Solutions"],
        phones: [],
        emails: [],
        websites: [],
        referrals: [],
        comments: []
      }
    });

    render(
      <MemoryRouter initialEntries={[`/contacts/${contactId}`]}>
        <Routes>
          <Route path="/contacts/:id" element={<ContactDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    const user = userEvent.setup();
    await screen.findByRole("heading", { name: /price, jordan/i });

    await user.click(screen.getByRole("button", { name: "Edit contact" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockUpdateContact).toHaveBeenCalledWith(
        expect.objectContaining({
          id: contactId,
          attributes: ["Academia", "AI Solutions"]
        })
      );
    });
  });
});
