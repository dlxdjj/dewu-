import { expect, test } from "@playwright/test";

test("390px no-session page does not overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\/?$/);

  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
});

test("390px add form keeps the purchase date inside the viewport", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const session = JSON.stringify({
        access_token:
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjQxMDI0NDQ4MDAsInN1YiI6InRlc3QtdXNlciIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSJ9.signature",
        refresh_token: "test-refresh-token",
        expires_at: 4102444800,
        expires_in: 3600,
        token_type: "bearer",
        user: {
          id: "test-user",
          aud: "authenticated",
          role: "authenticated",
          email: "test@example.com",
          app_metadata: {},
          user_metadata: {},
          created_at: "2026-08-01T00:00:00Z",
        },
      });
    for (const storageKey of [
      "sb-example-auth-token",
      "sb-iswpkxgyadofufnuaubl-auth-token",
    ]) {
      localStorage.setItem(storageKey, session);
    }
  });
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({
      json: {
        id: "test-user",
        aud: "authenticated",
        role: "authenticated",
        email: "test@example.com",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-08-01T00:00:00Z",
      },
    }),
  );

  await page.goto("/add/");
  const date = page.getByLabel("采购日期");
  await expect(date).toBeVisible();
  const bounds = await date.boundingBox();
  expect(bounds).not.toBeNull();
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(374);
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
});
