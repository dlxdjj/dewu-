import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Stat from "./Stat";

describe("Stat", () => {
  it("centers and scales a long compact currency value", () => {
    render(<Stat label="总销售额" value="¥2,389.00" compact />);

    const value = screen.getByText("¥2,389.00");
    expect(value).toHaveClass(
      "whitespace-nowrap",
      "tabular-nums",
      "text-[clamp(15px,4.1vw,21px)]",
    );
    expect(value.parentElement).toHaveClass(
      "min-w-0",
      "overflow-hidden",
      "text-center",
    );
  });
});
