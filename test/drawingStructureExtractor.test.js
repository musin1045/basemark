import test from "node:test";
import assert from "node:assert/strict";

import { extractDrawingStructureFromSvg } from "../src/engine/drawingStructureExtractor.js";

const SIMPLE_DRAWING = `
  <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
    <line id="wall-top" x1="20" y1="20" x2="220" y2="20" />
    <line id="wall-left" x1="20" y1="20" x2="20" y2="220" />
    <rect id="window-frame" x="80" y="60" width="100" height="120" />
    <polyline id="shaft-edge" points="260,30 300,30 300,120" />
  </svg>
`;

test("extractDrawingStructureFromSvg reads line, rect, and polyline geometry", () => {
  const extracted = extractDrawingStructureFromSvg(SIMPLE_DRAWING);

  assert.equal(extracted.sourceFormat, "svg");
  assert.equal(extracted.segmentCount, 8);
  assert.equal(extracted.segments[0].sourceType, "line");
  assert.equal(
    extracted.segments.some((segment) => segment.sourceType === "rect"),
    true
  );
  assert.equal(
    extracted.segments.some((segment) => segment.sourceType === "polyline"),
    true
  );
});

test("extractDrawingStructureFromSvg proposes frame anchors for rect geometry", () => {
  const extracted = extractDrawingStructureFromSvg(SIMPLE_DRAWING);
  const frameAnchors = extracted.anchorCandidates.filter(
    (anchor) => anchor.sourceId === "window-frame"
  );

  assert.equal(frameAnchors.length, 4);
  assert.deepEqual(
    frameAnchors.map((anchor) => anchor.anchorKind).sort(),
    [
      "frame_left_bottom",
      "frame_left_top",
      "frame_right_bottom",
      "frame_right_top"
    ]
  );
});

test("extractDrawingStructureFromSvg clusters repeated endpoints into corner candidates", () => {
  const extracted = extractDrawingStructureFromSvg(SIMPLE_DRAWING);
  const strongestCorner = extracted.corners[0];

  assert.ok(strongestCorner.supportCount >= 2);
  assert.ok(extracted.anchorCandidates.some((anchor) => anchor.anchorKind === "drawing_corner"));
});

test("extractDrawingStructureFromSvg rejects empty input", async () => {
  await assert.rejects(
    async () => extractDrawingStructureFromSvg(""),
    /svgText must be a non-empty string/
  );
});
