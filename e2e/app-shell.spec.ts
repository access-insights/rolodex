import { test, expect } from "@playwright/test";

test("login, open contact detail, add comment", async ({ page }) => {
  const contactId = "33333333-3333-3333-3333-333333333331";
  const comments: Array<{ id: string; body: string; archived: boolean; createdAt: string; authorDisplayName: string }> = [];

  await page.route("**/api?action=**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const action = url.searchParams.get("action");

    if (action === "contact.list") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: [
            {
              id: contactId,
              firstName: "Jordan",
              lastName: "Price",
              company: "Bright Path Advisors",
              contactType: "Advisor",
              status: "Active"
            }
          ]
        })
      });
      return;
    }

    if (action === "contact.get") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            id: contactId,
            firstName: "Jordan",
            lastName: "Price",
            company: "Bright Path Advisors",
            role: "Lead Advisor",
            internalContact: "Alex Admin",
            referredBy: "Board Introduction",
            referredByContactId: null,
            contactType: "Advisor",
            status: "Active",
            linkedInProfileUrl: "",
            linkedInPictureUrl: null,
            linkedInCompany: null,
            linkedInJobTitle: null,
            linkedInLocation: null,
            phones: [],
            emails: [],
            websites: [],
            referrals: [],
            comments
          }
        })
      });
      return;
    }

    if (action === "contact.addComment") {
      const payload = JSON.parse(request.postData() || "{}") as { body?: string };
      comments.unshift({
        id: `comment-${comments.length + 1}`,
        body: payload.body || "",
        archived: false,
        createdAt: new Date().toISOString(),
        authorDisplayName: "Dev User"
      });

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: comments[0] })
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false }) });
  });

  await page.goto("/login");
  const loginButton = page.getByRole("button", { name: "Login" });
  if (await loginButton.count()) {
    await loginButton.click();
  } else {
    await page.goto("/contacts");
  }

  await expect(page).toHaveURL(/\/contacts/);
  await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();

  await page.getByRole("link", { name: "33333333" }).click();

  await expect(page).toHaveURL(new RegExp(`/contacts/${contactId}`));
  await expect(page.getByRole("heading", { name: "Price, Jordan" })).toBeVisible();

  await page.getByLabel("Add comment").fill("Reach out on Monday");
  await page.getByRole("button", { name: "Add Comment" }).click();

  await expect(page.getByText("Reach out on Monday")).toBeVisible();
});
