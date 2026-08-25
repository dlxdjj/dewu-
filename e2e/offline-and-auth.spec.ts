import { expect, test } from "@playwright/test";

test("no-session gate settles on login without an infinite spinner", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page).toHaveURL(/\/login\/?$/);
  await expect(page.getByRole("heading", { name: "登录进销存" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "主导航" })).toHaveCount(0);
  await expect(page.getByText("正在连接 Supabase")).not.toBeVisible();
  expect(
    consoleErrors.filter(
      (message) => !message.includes("AuthSessionMissingError"),
    ),
  ).toEqual([]);
});

test("callback failure exits loading and offers recovery", async ({ page }) => {
  await page.goto(
    "/?error=access_denied&error_description=Expired%20Magic%20Link",
  );
  await expect(page.getByText("登录或数据源连接失败")).toBeVisible();
  await expect(page.getByRole("button", { name: "重试" })).toBeVisible();
  await expect(page.getByRole("button", { name: "返回登录" })).toBeVisible();
  await expect(page.getByText("正在连接 Supabase")).not.toBeVisible();
});
