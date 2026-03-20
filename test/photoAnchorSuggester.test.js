import test from "node:test";
import assert from "node:assert/strict";

import { suggestPhotoAnchorsFromImageData } from "../src/engine/photoAnchorSuggester.js";

function createBlankImage(width, height, fill = 245) {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < width * height; index += 1) {
    const rgbaIndex = index * 4;
    data[rgbaIndex] = fill;
    data[rgbaIndex + 1] = fill;
    data[rgbaIndex + 2] = fill;
    data[rgbaIndex + 3] = 255;
  }

  return { width, height, data };
}

function drawRectOutline(image, rect, shade = 32, thickness = 3) {
  const { width, data } = image;

  function paintPixel(x, y) {
    const rgbaIndex = (y * width + x) * 4;
    data[rgbaIndex] = shade;
    data[rgbaIndex + 1] = shade;
    data[rgbaIndex + 2] = shade;
    data[rgbaIndex + 3] = 255;
  }

  for (let y = rect.top; y <= rect.bottom; y += 1) {
    for (let offset = 0; offset < thickness; offset += 1) {
      paintPixel(rect.left + offset, y);
      paintPixel(rect.right - offset, y);
    }
  }

  for (let x = rect.left; x <= rect.right; x += 1) {
    for (let offset = 0; offset < thickness; offset += 1) {
      paintPixel(x, rect.top + offset);
      paintPixel(x, rect.bottom - offset);
    }
  }
}

function assertSuggestionNearPoint(suggestions, presetKey, expectedPoint, tolerance = 10) {
  const suggestion = suggestions.find((entry) => entry.anchorPresetKey === presetKey);
  assert.ok(suggestion, `Expected suggestion for ${presetKey}`);
  assert.ok(
    Math.abs(suggestion.point.x - expectedPoint.x) <= tolerance,
    `Expected ${presetKey}.x to be near ${expectedPoint.x}, got ${suggestion.point.x}`
  );
  assert.ok(
    Math.abs(suggestion.point.y - expectedPoint.y) <= tolerance,
    `Expected ${presetKey}.y to be near ${expectedPoint.y}, got ${suggestion.point.y}`
  );
}

test("suggestPhotoAnchorsFromImageData finds rectangular frame corners by quadrant", () => {
  const image = createBlankImage(120, 90);
  drawRectOutline(image, { left: 20, top: 15, right: 100, bottom: 75 });

  const suggestions = suggestPhotoAnchorsFromImageData(image, {
    step: 2,
    margin: 8
  });

  assertSuggestionNearPoint(suggestions, "window_left_top", { x: 20, y: 15 });
  assertSuggestionNearPoint(suggestions, "window_right_top", { x: 100, y: 15 });
  assertSuggestionNearPoint(suggestions, "window_left_bottom", { x: 20, y: 75 });
  assertSuggestionNearPoint(suggestions, "window_right_bottom", { x: 100, y: 75 });
  assert.ok(
    suggestions
      .filter((entry) => entry.family === "window_frame")
      .every((entry) => entry.confidence > 0.4),
    "Expected rectangular frame suggestions to have meaningful confidence."
  );
});

test("suggestPhotoAnchorsFromImageData proposes wall corner anchors from strong vertical and top edges", () => {
  const image = createBlankImage(140, 100);
  drawRectOutline(image, { left: 18, top: 12, right: 122, bottom: 82 });

  const suggestions = suggestPhotoAnchorsFromImageData(image, {
    step: 2,
    margin: 8
  });

  assertSuggestionNearPoint(suggestions, "wall_left_corner", { x: 18, y: 12 }, 12);
  assertSuggestionNearPoint(suggestions, "wall_right_corner", { x: 122, y: 12 }, 12);
  assert.ok(
    suggestions.some((entry) => entry.family === "wall_corner"),
    "Expected wall-corner suggestions to be present."
  );
});

test("suggestPhotoAnchorsFromImageData returns no suggestions for flat images", () => {
  const image = createBlankImage(80, 60);
  const suggestions = suggestPhotoAnchorsFromImageData(image);

  assert.deepEqual(suggestions, []);
});

test("suggestPhotoAnchorsFromImageData validates RGBA input shape", () => {
  assert.throws(
    () => suggestPhotoAnchorsFromImageData({ width: 10, height: 10, data: new Uint8Array(12) }),
    /width \* height \* 4/
  );
});
