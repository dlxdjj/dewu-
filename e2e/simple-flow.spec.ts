import { expect, test, type Page } from "@playwright/test";

function contrastRatio(foreground: string, background: string): number {
  const luminance = (css: string) => {
    const channels = (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const linear = channels.map((value) => {
      const channel = value / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

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

  const safeAreaBackgrounds = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).backgroundColor,
    body: getComputedStyle(document.body).backgroundColor,
  }));
  expect(safeAreaBackgrounds).toEqual({
    html: "rgb(184, 212, 241)",
    body: "rgb(184, 212, 241)",
  });
});

test("390px settings keeps the original Cirrus theme only", async ({
  page,
}) => {
  await installAuthenticatedSession(page);
  await page.addInitScript(() => {
    localStorage.setItem("dewu_app_theme", "voltura");
  });
  await page.route("**/rest/v1/**", (route) => {
    if (route.request().url().includes("/rpc/get_my_account_preferences")) {
      return route.fulfill({
        json: {
          user_id: "test-user",
          workflow: "standard",
          updated_at: "2026-08-17T00:00:00Z",
        },
      });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("/settings/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "cirrus");
  await expect(page.getByText("外观主题")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /像素工坊|伏特夜航|流明边界/ })).toHaveCount(0);
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);

  await page.goto("/");
  const profitLabel = page.locator("p").filter({ hasText: /^\d+月利润$/ }).first();
  await expect(profitLabel).toBeVisible();
  const profitCard = profitLabel.locator("..");
  const colors = await profitCard.evaluate((card) => ({
    background: getComputedStyle(card).backgroundColor,
    amount: getComputedStyle(card.querySelectorAll("p")[1]).color,
  }));
  expect(contrastRatio(colors.amount, colors.background)).toBeGreaterThanOrEqual(4.5);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "cirrus");
});

test("390px add form keeps the purchase date inside the viewport", async ({
  page,
}) => {
  await installAuthenticatedSession(page);
  await page.route("**/rest/v1/**", (route) => {
    if (route.request().url().includes("/rpc/get_my_account_preferences")) {
      return route.fulfill({
        json: {
          user_id: "test-user",
          workflow: "standard",
          updated_at: "2026-08-17T00:00:00Z",
        },
      });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("/add/");
  const save = page.getByRole("button", { name: /保存并生成/ });
  await expect(save).toBeVisible();
  expect(await save.locator("..").evaluate((node) => getComputedStyle(node).position))
    .toBe("fixed");
  const date = page.getByLabel("采购日期");
  await expect(date).toBeVisible();
  const bounds = await date.boundingBox();
  expect(bounds).not.toBeNull();
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(374);
  const dateGeometry = await date.evaluate((input) => {
    const control = input.getBoundingClientRect();
    const shell = input.parentElement?.getBoundingClientRect();
    const card = input.closest(".rounded-2xl")?.getBoundingClientRect();
    return {
      controlLeft: control.left,
      controlRight: control.right,
      shellLeft: shell?.left ?? 0,
      shellRight: shell?.right ?? 0,
      cardLeft: card?.left ?? 0,
      cardRight: card?.right ?? 0,
    };
  });
  expect(dateGeometry.controlLeft).toBeGreaterThanOrEqual(
    dateGeometry.shellLeft,
  );
  expect(dateGeometry.controlRight).toBeLessThanOrEqual(
    dateGeometry.shellRight,
  );
  expect(dateGeometry.shellLeft).toBeGreaterThanOrEqual(dateGeometry.cardLeft);
  expect(dateGeometry.shellRight).toBeLessThanOrEqual(dateGeometry.cardRight);
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
});

test("390px product image picker crops screenshot bars and can restore the original", async ({
  page,
}) => {
  await installAuthenticatedSession(page);
  await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
  await page.goto("/add/");

  const screenshotSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="1000">
      <rect width="400" height="1000" fill="#000"/>
      <rect y="250" width="400" height="400" fill="#fff"/>
      <rect x="120" y="320" width="160" height="260" rx="24" fill="#b40020"/>
      <circle cx="45" cy="65" r="12" fill="#fff"/>
      <rect x="320" y="850" width="35" height="35" fill="#fff"/>
    </svg>`;
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({
    name: "product-screenshot.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(screenshotSvg),
  });

  await expect(page.getByText("已自动裁去截图黑边")).toBeVisible();
  const preview = page.getByRole("img", { name: "添加商品图片" });
  await expect(preview).toBeVisible();
  expect(
    await preview.evaluate((image: HTMLImageElement) => ({
      width: image.naturalWidth,
      height: image.naturalHeight,
    })),
  ).toEqual({ width: 400, height: 400 });

  await page.getByRole("button", { name: "使用原图" }).click();
  await expect(page.getByText("当前使用原图")).toBeVisible();
  await expect
    .poll(() =>
      preview.evaluate((image: HTMLImageElement) => ({
        width: image.naturalWidth,
        height: image.naturalHeight,
      })),
    )
    .toEqual({ width: 288, height: 720 });
  expect(
    await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    })),
  ).toMatchObject({ client: 390, scroll: 390 });
});

test("390px rebate form is readable and saves both sources", async ({
  page,
}) => {
  await installAuthenticatedSession(page);
  await page.route("**/rest/v1/**", async (route) => {
    if (route.request().url().includes("/rpc/get_my_account_preferences")) {
      await route.fulfill({
        json: {
          user_id: "test-user",
          workflow: "standard",
          updated_at: "2026-08-17T00:00:00Z",
        },
      });
      return;
    }
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
  await page.getByText("编辑本月返利").click();
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

test("390px bulk account has no rebate income feature", async ({ page }) => {
  await installAuthenticatedSession(page);
  let rebateReads = 0;
  await page.route("**/rest/v1/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/rpc/get_my_account_preferences")) {
      await route.fulfill({
        json: {
          user_id: "friend",
          workflow: "bulk",
          updated_at: "2026-08-17T00:00:00Z",
        },
      });
      return;
    }
    if (url.includes("/monthly_rebates")) rebateReads += 1;
    await route.fulfill({ json: [] });
  });

  await page.goto("/");
  await expect(page.getByText("按实际到账减进价和运费")).toBeVisible();
  await expect(page.getByText(/返利/)).toHaveCount(0);

  await page.goto("/reports/");
  await expect(page.getByText("已结算实际到账")).toBeVisible();
  await expect(page.getByLabel("淘宝联盟返利")).toHaveCount(0);
  await expect(page.getByLabel("京粉返利")).toHaveCount(0);
  await expect(page.getByText(/返利/)).toHaveCount(0);
  expect(rebateReads).toBe(0);
});

test("390px report centers a long sales amount inside its card", async ({
  page,
}) => {
  await installAuthenticatedSession(page);
  const timestamp = "2026-08-12T00:00:00Z";
  await page.route("**/rest/v1/**", (route) => {
    const table = new URL(route.request().url()).pathname.split("/").at(-1);
    if (table === "products") {
      return route.fulfill({
        json: [
          {
            id: "report-product",
            user_id: "test-user",
            name: "报表测试商品",
            style_code: "REPORT-1",
            brand: null,
            created_at: timestamp,
            updated_at: timestamp,
          },
        ],
      });
    }
    if (table === "purchase_batches") {
      return route.fulfill({
        json: [
          {
            id: "report-batch",
            user_id: "test-user",
            product_id: "report-product",
            platform: "taobao",
            order_no: null,
            unit_price_cents: 225719,
            quantity: 1,
            shipping_fee_cents: 0,
            discount_amount_cents: 0,
            purchased_at: "2026-08-01",
            note: null,
            created_at: timestamp,
            updated_at: timestamp,
          },
        ],
      });
    }
    if (table === "inventory_units") {
      return route.fulfill({
        json: [
          {
            id: "report-unit",
            user_id: "test-user",
            batch_id: "report-batch",
            product_id: "report-product",
            size: "L",
            unit_cost_cents: 225719,
            listing_price_cents: null,
            outbound_shipping_cents: 0,
            status: "settled",
            created_at: timestamp,
            updated_at: timestamp,
          },
        ],
      });
    }
    if (table === "sales") {
      return route.fulfill({
        json: [
          {
            id: "report-sale",
            user_id: "test-user",
            unit_id: "report-unit",
            sold_price_cents: null,
            platform_fee_cents: 0,
            platform_subsidy_cents: 0,
            express_fee_cents: 0,
            other_fee_cents: 0,
            actual_payout_cents: 238900,
            sold_at: "2026-08-11",
            settled_at: "2026-08-12",
            created_at: timestamp,
            updated_at: timestamp,
          },
        ],
      });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("/reports/");
  const salesAmount = page.getByText("¥2,389.00").first();
  await expect(salesAmount).toBeVisible();
  const metrics = await salesAmount.evaluate((value) => {
    const card = value.parentElement;
    const valueRect = value.getBoundingClientRect();
    const cardRect = card?.getBoundingClientRect();
    return {
      textAlign: getComputedStyle(value).textAlign,
      clientWidth: value.clientWidth,
      scrollWidth: value.scrollWidth,
      valueLeft: valueRect.left,
      valueRight: valueRect.right,
      cardLeft: cardRect?.left ?? 0,
      cardRight: cardRect?.right ?? 0,
    };
  });
  expect(metrics.textAlign).toBe("center");
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.valueLeft).toBeGreaterThanOrEqual(metrics.cardLeft);
  expect(metrics.valueRight).toBeLessThanOrEqual(metrics.cardRight);
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

    if (table === "record_shipment") {
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
  await page.getByRole("button", { name: "待结算 2" }).click();
  await expect(
    page.getByRole("button", { name: "录入到手价 · 2 件" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "录入到手价 · 2 件" })
    .click();
  await expect(page.getByRole("dialog", { name: "批量登记到手价（2 件）" }))
    .toHaveAttribute("aria-modal", "true");
  const payout = page.getByLabel("实际到手价");
  expect(await payout.evaluate((node) => getComputedStyle(node).fontSize)).toBe(
    "16px",
  );
  await payout.fill("160");
  await expect(page.getByText("2 件到账合计 ¥320.00")).toBeVisible();
  await expect(page.getByText("+¥120.00")).toBeVisible();
  await page.getByRole("button", { name: "确认到手价并结算" }).click();
  await expect(
    page.getByRole("button", { name: "录入到手价 · 2 件" }),
  ).not.toBeVisible();

  await page.getByRole("button", { name: "当前库存 1" }).click();
  await page.getByRole("button", { name: "筛选" }).click();
  await page.getByRole("button", { name: "已到货" }).click();
  await page.getByRole("button", { name: "查看结果" }).click();
  await expect(page.getByText("1 件 · 1 款")).toBeVisible();
  await page.getByRole("button", { name: "批量操作" }).click();
  await page
    .getByRole("button", { name: "选择 E2E-1 42，共 1 件" })
    .click();
  await page.getByRole("button", { name: "寄往得物" }).click();
  const freight = page.getByLabel("寄出快递费");
  expect(await freight.evaluate((node) => getComputedStyle(node).fontSize)).toBe(
    "16px",
  );
  await freight.fill("9");
  await expect(page.getByText("本件运费：¥9.00")).toBeVisible();
  await page.getByRole("button", { name: "确认运费并寄出" }).click();
  await expect(page.getByText("0 件 · 0 款")).toBeVisible();

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
