import { expect, test, type Page } from "@playwright/test";

async function installAuthenticatedSession(page: Page): Promise<void> {
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
}

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
  await installAuthenticatedSession(page);

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

test("390px rebate form is readable and saves both sources", async ({
  page,
}) => {
  await installAuthenticatedSession(page);
  await page.route("**/rest/v1/**", async (route) => {
    if (route.request().url().includes("/rpc/save_monthly_rebates")) {
      await route.fulfill({
        json: [
          {
            id: "rebate-1",
            user_id: "test-user",
            month: "2026-08-01",
            source: "taobao_alliance",
            amount_cents: 1000,
            created_at: "2026-08-11T00:00:00Z",
            updated_at: "2026-08-11T00:00:00Z",
          },
          {
            id: "rebate-2",
            user_id: "test-user",
            month: "2026-08-01",
            source: "jingfen",
            amount_cents: 2000,
            created_at: "2026-08-11T00:00:00Z",
            updated_at: "2026-08-11T00:00:00Z",
          },
        ],
      });
      return;
    }
    await route.fulfill({ json: [] });
  });

  await page.goto("/reports/");
  const taobao = page.getByLabel("淘宝联盟返利");
  const jingfen = page.getByLabel("京粉返利");
  await expect(taobao).toBeVisible();
  await expect(jingfen).toBeVisible();
  expect(await taobao.evaluate((node) => getComputedStyle(node).fontSize)).toBe(
    "16px",
  );
  await taobao.fill("10");
  await jingfen.fill("20");
  await page.getByRole("button", { name: "保存本月返利" }).click();
  await expect(page.getByText("本月返利已保存并计入利润。")).toBeVisible();

  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
});
