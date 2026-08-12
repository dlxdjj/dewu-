import { describe, expect, it } from "vitest";
import { detectScreenshotBars } from "./image-processing";

describe("screenshot black-bar detection", () => {
  it("keeps the bright product panel and removes dark screenshot chrome", () => {
    const pixels = makePixels(200, 420, (x, y) => {
      if (y >= 95 && y < 305) return [248, 248, 248];
      // Sparse white controls inside the black UI must not break detection.
      if ((y < 95 && x > 20 && x < 42) || (y >= 305 && x > 170)) {
        return [245, 245, 245];
      }
      return [3, 3, 3];
    });

    expect(detectScreenshotBars(pixels)).toEqual({
      x: 0,
      y: 95,
      width: 200,
      height: 210,
    });
  });

  it("does not crop an already clean product image", () => {
    const pixels = makePixels(200, 300, (x, y) =>
      x > 55 && x < 145 && y > 45 && y < 255
        ? [25, 25, 25]
        : [250, 250, 250],
    );

    expect(detectScreenshotBars(pixels)).toBeNull();
  });

  it("requires dark panels on both edges", () => {
    const pixels = makePixels(200, 400, (_x, y) =>
      y < 100 ? [0, 0, 0] : [255, 255, 255],
    );

    expect(detectScreenshotBars(pixels)).toBeNull();
  });

  it("does not turn an all-dark image into an empty crop", () => {
    const pixels = makePixels(200, 400, () => [0, 0, 0]);
    expect(detectScreenshotBars(pixels)).toBeNull();
  });
});

function makePixels(
  width: number,
  height: number,
  colorAt: (x: number, y: number) => [number, number, number],
) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = colorAt(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height };
}
