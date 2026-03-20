import test from "node:test";
import assert from "node:assert/strict";

import {
  alignLocalSegment,
  generateComparisonCandidates,
  selectActiveAnchors
} from "../src/engine/baseMarkEngine.js";

function createScenario() {
  return {
    segment: {
      segmentId: "segment-door-left-wall",
      segmentKind: "wall_strip",
      label: "Door-left wall segment"
    },
    anchors: [
      {
        anchorId: "anchor-left",
        segmentId: "segment-door-left-wall",
        anchorKind: "door_frame_edge",
        geometryType: "point",
        drawingReference: { point: { x: 0, y: 0 } },
        fieldObservation: { point: { x: 100, y: 120 } },
        stabilityScore: 0.96,
        visibilityState: "visible"
      },
      {
        anchorId: "anchor-right",
        segmentId: "segment-door-left-wall",
        anchorKind: "wall_corner",
        geometryType: "point",
        drawingReference: { point: { x: 1, y: 0 } },
        fieldObservation: { point: { x: 300, y: 120 } },
        stabilityScore: 0.92,
        visibilityState: "visible"
      }
    ],
    checkpoints: [
      {
        checkpointId: "checkpoint-switch",
        segmentId: "segment-door-left-wall",
        anchorBasis: ["anchor-left", "anchor-right"],
        coordinateModel: "span_ratio_plus_height_ratio",
        normalizedPosition: {
          spanRatio: 0.5,
          heightRatio: -0.1
        },
        allowedTolerance: {
          positionSpanRatio: 0.05,
          searchSpanRatio: 0.2
        },
        semanticExpectation: "switch_box"
      }
    ],
    fieldEvidence: {
      evidenceId: "evidence-1",
      segmentId: "segment-door-left-wall",
      imageRef: "fixtures/door-left-wall.jpg"
    },
    metricCalibration: {
      referenceAnchorBasis: ["anchor-left", "anchor-right"],
      knownDistanceMm: 900
    }
  };
}

test("selectActiveAnchors chooses the highest-stability visible anchors", () => {
  const selection = selectActiveAnchors(createScenario());

  assert.equal(selection.activeAnchors.length, 2);
  assert.equal(selection.activeAnchors[0].anchorId, "anchor-left");
  assert.equal(selection.activeAnchors[1].anchorId, "anchor-right");
});

test("alignLocalSegment projects normalized checkpoints into the field segment", () => {
  const alignment = alignLocalSegment(createScenario());

  assert.equal(alignment.segmentId, "segment-door-left-wall");
  assert.equal(alignment.projectedCheckpoints.length, 1);
  assert.deepEqual(alignment.projectedCheckpoints[0].projectedPoint, {
    x: 200,
    y: 100
  });
  assert.equal(alignment.alignmentModel, "two_anchor_span_projection");
  assert.equal(alignment.metricFrame.knownDistanceMm, 900);
  assert.equal(alignment.metricFrame.spanPixels, 200);
  assert.equal(alignment.metricFrame.millimetersPerPixel, 4.5);
  assert.equal(
    Number(alignment.projectedCheckpoints[0].metricProjection.distanceAlongSpanMm.toFixed(1)),
    450
  );
});

test("generateComparisonCandidates emits a missing candidate when no expected element is observed", () => {
  const result = generateComparisonCandidates({
    ...createScenario(),
    observedElements: []
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].candidateType, "missing");
  assert.equal(result.candidates[0].reasonCode, "expected_feature_not_found");
});

test("generateComparisonCandidates emits a position_diff candidate when the observed element exceeds tolerance", () => {
  const result = generateComparisonCandidates({
    ...createScenario(),
    observedElements: [
      {
        elementId: "observed-switch-1",
        segmentId: "segment-door-left-wall",
        elementKind: "switch_box",
        point: { x: 225, y: 100 }
      }
    ]
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].candidateType, "position_diff");
  assert.equal(result.candidates[0].reasonCode, "relative_offset_exceeds_tolerance");
  assert.equal(
    Number(result.candidates[0].metricOffset.offsetDistanceMm.toFixed(1)),
    112.5
  );
  assert.deepEqual(result.candidates[0].metricOffset.offsetVectorMm, {
    x: 112.5,
    y: 0
  });
});

test("generateComparisonCandidates emits an extra candidate for unmatched observed elements", () => {
  const result = generateComparisonCandidates({
    ...createScenario(),
    observedElements: [
      {
        elementId: "observed-switch-1",
        segmentId: "segment-door-left-wall",
        elementKind: "switch_box",
        point: { x: 202, y: 101 }
      },
      {
        elementId: "observed-extra-1",
        segmentId: "segment-door-left-wall",
        elementKind: "outlet_box",
        point: { x: 260, y: 95 }
      }
    ]
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].candidateType, "extra");
  assert.equal(result.candidates[0].checkpointId, null);
});

test("selectActiveAnchors rejects segments without two visible anchors", async () => {
  await assert.rejects(
    async () =>
      selectActiveAnchors({
        ...createScenario(),
        anchors: [
          {
            anchorId: "anchor-only",
            segmentId: "segment-door-left-wall",
            anchorKind: "door_frame_edge",
            geometryType: "point",
            drawingReference: { point: { x: 0, y: 0 } },
            fieldObservation: { point: { x: 100, y: 120 } },
            stabilityScore: 0.96,
            visibilityState: "visible"
          }
        ]
      }),
    /At least two visible anchors/
  );
});
