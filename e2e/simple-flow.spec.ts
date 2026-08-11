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
      "sb-localhost-auth-token",
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

test("390px inventory supports quick batch settlement and shipping with freight", async ({
  page,
}) => {
  await installAuthenticatedSession(page);

  const now = "2026-08-11T00:00:00Z";
  const products = [
    {
      id: "product-1",
      user_id: "test-user",
      name: "真实流程测试鞋",
      style_code: "E2E-1",
      brand: "测试品牌",
      created_at: now,
      updated_at: now,
    },
  ];
  const batches = [
    {
      id: "batch-1",
      user_id: "test-user",
      product_id: "product-1",
      platform: "taobao",
      order_no: null,
      unit_price_cents: 10000,
      quantity: 3,
      shipping_fee_cents: 0,
      discount_amount_cents: 0,
      purchased_at: "2026-08-10",
      note: null,
      created_at: now,
      updated_at: now,
    },
  ];
  const units = ["sold-1", "sold-2", "arrived-1"].map((id, index) => ({
    id,
    user_id: "test-user",
    batch_id: "batch-1",
    product_id: "product-1",
    size: "42",
    unit_cost_cents: 10000,
    listing_price_cents: null,
    outbound_shipping_cents: 0,
    status: index < 2 ? "sold" : "arrived",
    created_at: `2026-08-11T00:00:0${index}Z`,
    updated_at: now,
  }));
  const sales = ["sold-1", "sold-2"].map((unitId, index) => ({
    id: `sale-${index + 1}`,
    user_id: "test-user",
    unit_id: unitId,
    sold_price_cents: null,
    platform_fee_cents: 0,
    platform_subsidy_cents: 0,
    express_fee_cents: 0,
    other_fee_cents: 0,
    actual_payout_cents: null as number | null,
    sold_at: "2026-08-10",
    settled_at: null as string | null,
    created_at: now,
    updated_at: now,
  }));

  await page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split("/").at(-1);
    if (table === "products") return route.fulfill({ json: products });
    if (table === "purchase_batches") return route.fulfill({ json: batches });
    if (table === "inventory_units") return route.fulfill({ json: units });
    if (table === "sales") return route.fulfill({ json: sales });
    if (table === "attachments") return route.fulfill({ json: [] });

    if (table === "settle_units") {
      const body = route.request().postDataJSON() as {
        p_unit_ids: string[];
        p_actual_payout_cents: number;
        p_settled_at: string;
      };
      for (const unit of units) {
        if (body.p_unit_ids.includes(unit.id)) unit.status = "settled";
      }
      for (const sale of sales) {
        if (body.p_unit_ids.includes(sale.unit_id)) {
          sale.actual_payout_cents = body.p_actual_payout_cents;
          sale.settled_at = body.p_settled_at;
        }
      }
      return route.fulfill({ status: 204 });
    }

    if (table === "ship_units") {
      const body = route.request().postDataJSON() as {
        p_unit_ids: string[];
        p_total_shipping_cents: number;
      };
      const allocations = body.p_unit_ids.map((unitId) => ({
        unitId,
        shippingCents: body.p_total_shipping_cents,
      }));
      for (const unit of units) {
        if (!body.p_unit_ids.includes(unit.id)) continue;
        unit.status = "shipping";
        unit.outbound_shipping_cents = body.p_total_shipping_cents;
      }
      return route.fulfill({
        json: {
          allocations,
          totalShippingCents: body.p_total_shipping_cents,
          overwrittenUnitIds: [],
        },
      });
    }

    return route.fulfill({ json: [] });
  });

  await page.goto("/inventory/");
  await expect(
    page.getByRole("button", { name: "录到手价 · 2 件待结算" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "录到手价 · 2 件待结算" })
    .click();
  const payout = page.getByLabel("实际到手价");
  expect(await payout.evaluate((node) => getComputedStyle(node).fontSize)).toBe(
    "16px",
  );
  await payout.fill("160");
  await expect(page.getByText("实际到账合计 ¥320.00")).toBeVisible();
  await page.getByRole("button", { name: "确认到手价并结算" }).click();
  await expect(
    page.getByRole("button", { name: "录到手价 · 2 件待结算" }),
  ).not.toBeVisible();

  await page.getByRole("button", { name: "已到货" }).click();
  await expect(page.getByText("1 件 · 1 组")).toBeVisible();
  await page.getByRole("button", { name: "批量操作" }).click();
  await page
    .getByRole("button", { name: "选择 E2E-1 42，共 1 件" })
    .click();
  await page.getByLabel("目标状态").selectOption("shipping");
  await page.getByRole("button", { name: "填写运费" }).click();
  const freight = page.getByLabel("寄出快递费");
  expect(await freight.evaluate((node) => getComputedStyle(node).fontSize)).toBe(
    "16px",
  );
  await freight.fill("9");
  await expect(page.getByText("本件运费：¥9.00")).toBeVisible();
  await page.getByRole("button", { name: "确认运费并寄出" }).click();
  await expect(page.getByText("0 件 · 0 组")).toBeVisible();

  expect(units.find((unit) => unit.id === "arrived-1")).toMatchObject({
    status: "shipping",
    outbound_shipping_cents: 900,
  });
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
});
