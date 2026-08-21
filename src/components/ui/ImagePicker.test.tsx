import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  compressImage,
  prepareProductImage,
  PRODUCT_IMAGE_MAX_SIDE,
  PRODUCT_IMAGE_QUALITY,
} from "@/lib/image-processing";
import ImagePicker from "./ImagePicker";

vi.mock("@/lib/image-processing", () => ({
  compressImage: vi.fn(),
  prepareProductImage: vi.fn(),
  PRODUCT_IMAGE_MAX_SIDE: 720,
  PRODUCT_IMAGE_QUALITY: 0.78,
}));

const mockedPrepare = vi.mocked(prepareProductImage);
const mockedCompress = vi.mocked(compressImage);

describe("ImagePicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports an automatic crop and lets the user switch to the original", async () => {
    const cropped = new Blob(["cropped"], { type: "image/jpeg" });
    const original = new Blob(["original"], { type: "image/jpeg" });
    mockedPrepare.mockResolvedValue({
      blob: cropped,
      cropApplied: true,
      sourceWidth: 1280,
      sourceHeight: 2774,
      outputWidth: 1200,
      outputHeight: 1200,
    });
    mockedCompress.mockResolvedValue(original);
    const onChange = vi.fn();
    const { container } = render(
      <ImagePicker label="添加商品图片" value={null} onChange={onChange} />,
    );
    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();

    await userEvent.upload(
      input as HTMLInputElement,
      new File(["image"], "screenshot.jpg", { type: "image/jpeg" }),
    );

    expect(await screen.findByText("已自动裁去截图黑边")).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(cropped);
    await userEvent.click(screen.getByRole("button", { name: "使用原图" }));
    expect(await screen.findByText("当前使用原图")).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(original);
    expect(mockedCompress).toHaveBeenCalledWith(
      expect.any(File),
      PRODUCT_IMAGE_MAX_SIDE,
      PRODUCT_IMAGE_QUALITY,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "恢复自动裁剪" }),
    );
    expect(await screen.findByText("已自动裁去截图黑边")).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(cropped);
  });

  it("leaves a clean image without a misleading crop message", async () => {
    const clean = new Blob(["clean"], { type: "image/jpeg" });
    mockedPrepare.mockResolvedValue({
      blob: clean,
      cropApplied: false,
      sourceWidth: 1290,
      sourceHeight: 1269,
      outputWidth: 1200,
      outputHeight: 1180,
    });
    const { container } = render(
      <ImagePicker label="添加商品图片" value={null} onChange={vi.fn()} />,
    );

    await userEvent.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["image"], "clean.jpg", { type: "image/jpeg" }),
    );

    expect(
      screen.queryByText("已自动裁去截图黑边"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "使用原图" }),
    ).not.toBeInTheDocument();
  });

  it("shows a readable error when image processing fails", async () => {
    mockedPrepare.mockRejectedValue(new Error("图片读取失败"));
    const { container } = render(
      <ImagePicker label="添加商品图片" value={null} onChange={vi.fn()} />,
    );

    await userEvent.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File(["bad"], "bad.jpg", { type: "image/jpeg" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("图片读取失败");
  });
});
