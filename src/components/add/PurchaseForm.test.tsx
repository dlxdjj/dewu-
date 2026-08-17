import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryDbAdapter } from "@/lib/data/memory";
import PurchaseForm from "./PurchaseForm";

vi.mock("@/components/ui/ImagePicker", () => ({
  default: ({
    label,
    onChange,
  }: {
    label: string;
    onChange: (blob: Blob) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange(new Blob(["test-image"], { type: "image/jpeg" }))
      }
    >
      {label}
    </button>
  ),
}));

const timestamp = "2026-08-01T00:00:00Z";

async function fillRequiredFields(styleCode = "STYLE-001"): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("品名（必填）"), "测试鞋");
  await user.type(screen.getByLabelText("货号（必填）"), styleCode);
  await user.type(screen.getByLabelText("尺码（必填）"), "42");
  await user.type(screen.getByLabelText("单件进价（元，必填）"), "100");
}

describe("PurchaseForm", () => {
  it("keeps sale settlement and refund out of purchase initial states", () => {
    render(<PurchaseForm dataSource={new MemoryDbAdapter()} onComplete={vi.fn()} />);

    const status = screen.getByLabelText("当前状态");
    expect(status).not.toHaveTextContent("发往得物途中");
    expect(status).not.toHaveTextContent("已售待结算");
    expect(status).not.toHaveTextContent("已结算");
    expect(status).not.toHaveTextContent("退款");
  });

  it("marks style code required and reports whitespace-only input", async () => {
    const db = new MemoryDbAdapter();
    render(<PurchaseForm dataSource={db} onComplete={vi.fn()} />);

    expect(screen.getByLabelText("货号（必填）")).toBeRequired();
    expect(screen.getByLabelText("品名（必填）")).toBeRequired();
    expect(screen.getByLabelText("尺码（必填）")).toBeRequired();
    expect(screen.getByLabelText("单件进价（元，必填）")).toBeRequired();
    expect(screen.getByLabelText("数量（必填）")).toBeRequired();
    expect(screen.getByLabelText("采购日期（必填）")).toBeRequired();
    await fillRequiredFields("   ");
    await userEvent.click(
      screen.getByRole("button", { name: /保存并生成/ }),
    );

    expect(await screen.findByText("请填写货号")).toBeInTheDocument();
    expect(db.snapshot().units).toHaveLength(0);
  });

  it("shows the newest image for an existing style code", async () => {
    const db = new MemoryDbAdapter({
      products: [
        {
          id: "p1",
          user_id: "u1",
          name: "测试鞋",
          style_code: "STYLE-001",
          brand: null,
          created_at: timestamp,
          updated_at: timestamp,
        },
      ],
      attachments: [
        {
          id: "old",
          user_id: "u1",
          owner_type: "product",
          owner_id: "p1",
          kind: "product_image",
          path: "old-image",
          content_type: "image/jpeg",
          created_at: timestamp,
        },
        {
          id: "new",
          user_id: "u1",
          owner_type: "product",
          owner_id: "p1",
          kind: "product_image",
          path: "new-image",
          content_type: "image/jpeg",
          created_at: "2026-08-02T00:00:00Z",
        },
      ],
    });
    render(<PurchaseForm dataSource={db} onComplete={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("货号（必填）"), "style-001");

    expect(
      await screen.findByText("该货号已有图片，将默认复用"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "style-001 已有商品图片" }),
    ).toHaveAttribute("src", "memory://new-image");
  });

  it("retries only the image after the purchase has already succeeded", async () => {
    const db = new MemoryDbAdapter();
    vi.spyOn(db, "saveAttachment").mockRejectedValueOnce(
      new Error("upload failed"),
    );
    const onComplete = vi.fn();
    render(<PurchaseForm dataSource={db} onComplete={onComplete} />);
    await fillRequiredFields();
    await userEvent.click(
      screen.getByRole("button", { name: "添加商品图片" }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: /保存并生成/ }),
    );
    expect(
      await screen.findByText("商品已保存，但图片上传失败"),
    ).toBeInTheDocument();
    expect(db.snapshot().units).toHaveLength(1);
    expect(db.snapshot().attachments).toHaveLength(0);

    await userEvent.click(
      screen.getByRole("button", { name: "重试上传图片" }),
    );
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(db.snapshot().units).toHaveLength(1);
    expect(db.snapshot().attachments).toHaveLength(1);
  });

  it("constrains the purchase date input to the mobile card width", () => {
    render(<PurchaseForm dataSource={new MemoryDbAdapter()} onComplete={vi.fn()} />);

    const input = screen.getByLabelText("采购日期（必填）");
    expect(input).toHaveClass("mobile-date-input");
    expect(input.parentElement).toHaveClass("date-input-shell");
  });

  it("lets a bulk account omit size and hides purchase platform", async () => {
    const db = new MemoryDbAdapter({
      preferences: {
        user_id: "test-user",
        workflow: "bulk",
        updated_at: timestamp,
      },
    });
    const onComplete = vi.fn();
    render(
      <PurchaseForm
        dataSource={db}
        showPlatform={false}
        allowMissingSize
        onComplete={onComplete}
      />,
    );
    expect(screen.queryByLabelText("采购平台")).not.toBeInTheDocument();
    expect(screen.getByLabelText("尺码（可后补）")).not.toBeRequired();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("品名（必填）"), "测试鞋");
    await user.type(screen.getByLabelText("货号（必填）"), "BULK-1");
    await user.type(screen.getByLabelText("单件进价（元，必填）"), "88.80");
    await user.click(screen.getByRole("button", { name: /保存并生成/ }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(db.snapshot().units[0].size).toBe("");
    expect(db.snapshot().batches[0].platform).toBe("other");
  });

  it("fills the canonical name and image when a bulk account enters a known style code", async () => {
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
    render(
      <PurchaseForm
        dataSource={db}
        showPlatform={false}
        allowMissingSize
        onComplete={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByLabelText("货号（必填）"), " hp‑5969 ");

    expect(await screen.findByDisplayValue("阿迪达斯 HP5969 运动鞋")).toBeInTheDocument();
    expect(screen.getByText("已按货号匹配标准名称和商品图片")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /已有商品图片/ })).toHaveAttribute(
      "src",
      "memory://owner/product/hp-5969",
    );
  });
});
