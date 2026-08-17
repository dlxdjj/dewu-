import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryDbAdapter } from "@/lib/data/memory";
import SpreadsheetImport from "./SpreadsheetImport";

const readSpreadsheet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/import/spreadsheet", () => ({ readSpreadsheet }));

const timestamp = "2026-08-17T00:00:00Z";

describe("SpreadsheetImport", () => {
  it("previews canonical name and image matches before one atomic import", async () => {
    readSpreadsheet.mockResolvedValue({
      rows: [{
        rowNumber: 2,
        styleCode: "hp‑5969",
        productName: "表格旧名称",
        quantity: 2,
        unitPriceCents: 39990,
        size: "",
      }],
      errors: [],
      totalUnits: 2,
      totalCostCents: 79980,
      headerRowNumber: 1,
      fileHash: "a".repeat(64),
    });
    const db = new MemoryDbAdapter({
      preferences: {
        user_id: "test-user",
        workflow: "bulk",
        updated_at: timestamp,
      },
      catalogProducts: [{
        id: "catalog-1",
        normalized_style_code: "HP-5969",
        display_style_code: "HP-5969",
        canonical_name: "阿迪达斯 HP5969 运动鞋",
        image_path: "owner/product/hp-5969",
        source_user_id: "owner",
        verified_at: timestamp,
        created_at: timestamp,
        updated_at: timestamp,
      }],
    });
    const onImported = vi.fn();
    const user = userEvent.setup();
    render(<SpreadsheetImport dataSource={db} onImported={onImported} />);

    await user.upload(
      screen.getByLabelText("选择 Excel 表格"),
      new File(["test"], "采购.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );

    expect(await screen.findByText("阿迪达斯 HP5969 运动鞋")).toBeInTheDocument();
    expect(screen.getByText("已匹配标准名称和商品图片")).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === "名称匹配 1 款")).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === "图片匹配 1 款")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认导入 2 件" }));
    await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
    expect(db.snapshot().units).toHaveLength(2);
    expect(db.snapshot().products[0].name).toBe("阿迪达斯 HP5969 运动鞋");
  });
});
