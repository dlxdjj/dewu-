import { expect, test } from "@playwright/test";

/** Configuration-only browser checks run against a dedicated unconfigured server. */
test("unconfigured deployment exits loading and explains required setup", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Supabase 未配置" })).toBeVisible();
  await expect(page.getByText("正在连接 Supabase")).not.toBeVisible();
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
});
