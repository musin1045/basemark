import {
  createFieldEvidence,
  createLocalSegment,
  createNormalizedCheckpoint,
  createObservedElement,
  createStructuralAnchor
} from "./models.js";

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clampMinimum(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function createVector(from, to) {
  return {
    x: to.x - from.x,
    y: to.y - from.y
  };
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y);

  if (length === 0) {
    throw new Error("Active anchor span must have non-zero length.");
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
    length
  };
}

function perpendicular(unitVector) {
  return {
    x: -unitVector.y,
    y: unitVector.x
  };
}

function createProjectedPoint(anchorA, anchorB, checkpoint) {
  const spanVector = createVector(
    anchorA.fieldObservation.point,
    anchorB.fieldObservation.point
  );
  const unitSpan = normalize(spanVector);
  const unitNormal = perpendicular(unitSpan);
  const spanRatio = checkpoint.normalizedPosition.spanRatio ?? 0;
  const heightRatio = checkpoint.normalizedPosition.heightRatio ?? 0;
  const basePoint = anchorA.fieldObservation.point;

  return {
    x:
      basePoint.x +
      unitSpan.x * unitSpan.length * spanRatio +
      unitNormal.x * unitSpan.length * heightRatio,
    y:
      basePoint.y +
      unitSpan.y * unitSpan.length * spanRatio +
      unitNormal.y * unitSpan.length * heightRatio,
    anchorSpanLength: unitSpan.length
  };
}

function createExpectedNeighborhood(projectedPoint, tolerance = {}) {
  const positionSpanRatio = clampMinimum(tolerance.positionSpanRatio, 0.05);
  const searchSpanRatio = clampMinimum(tolerance.searchSpanRatio, 0.2);

  return {
    center: {
      x: projectedPoint.x,
      y: projectedPoint.y
    },
    allowedRadius: projectedPoint.anchorSpanLength * positionSpanRatio,
    searchRadius: projectedPoint.anchorSpanLength * searchSpanRatio
  };
}

export function selectActiveAnchors(input) {
  const segment = createLocalSegment(input.segment);
  const anchors = (input.anchors ?? []).map(createStructuralAnchor);
  const candidates = anchors
    .filter((anchor) => anchor.segmentId === segment.segmentId)
    .filter((anchor) => anchor.visibilityState === "visible")
    .sort((left, right) => right.stabilityScore - left.stabilityScore);

  if (candidates.length < 2) {
    throw new Error(
      `At least two visible anchors are required for segment ${segment.segmentId}.`
    );
  }

  return {
    segment,
    consideredAnchors: anchors,
    activeAnchors: candidates.slice(0, 2)
  };
}

export function alignLocalSegment(input) {
  const selection = selectActiveAnchors(input);
  const checkpoints = (input.checkpoints ?? []).map(createNormalizedCheckpoint);
  const fieldEvidence = createFieldEvidence(input.fieldEvidence);

  if (fieldEvidence.segmentId !== selection.segment.segmentId) {
    throw new Error("fieldEvidence.segmentId must match the local segment.");
  }

  const activeAnchorIds = new Set(
    selection.activeAnchors.map((anchor) => anchor.anchorId)
  );
  const [anchorA, anchorB] = selection.activeAnchors;
  const projectedCheckpoints = checkpoints
    .filter((checkpoint) => checkpoint.segmentId === selection.segment.segmentId)
    .map((checkpoint) => {
      for (const anchorId of checkpoint.anchorBasis) {
        if (!activeAnchorIds.has(anchorId)) {
          throw new Error(
            `Checkpoint ${checkpoint.checkpointId} requires inactive anchor ${anchorId}.`
          );
        }
      }

      const projectedPoint = createProjectedPoint(anchorA, anchorB, checkpoint);
      const expectedNeighborhood = createExpectedNeighborhood(
        projectedPoint,
        checkpoint.allowedTolerance
      );

      return {
        checkpointId: checkpoint.checkpointId,
        semanticExpectation: checkpoint.semanticExpectation,
        normalizedBasis: {
          anchorBasis: checkpoint.anchorBasis,
          coordinateModel: checkpoint.coordinateModel,
          normalizedPosition: checkpoint.normalizedPosition,
          allowedTolerance: checkpoint.allowedTolerance
        },
        projectedPoint: {
          x: projectedPoint.x,
          y: projectedPoint.y
        },
        expectedNeighborhood
      };
    });

  return {
    segmentId: selection.segment.segmentId,
    fieldEvidence,
    activeAnchors: selection.activeAnchors,
    alignmentModel: "two_anchor_span_projection",
    projectedCheckpoints,
    expectedNeighborhoods: projectedCheckpoints.map((entry) => ({
      checkpointId: entry.checkpointId,
      ...entry.expectedNeighborhood
    })),
    alignmentQuality: {
      score:
        selection.activeAnchors.reduce(
          (sum, anchor) => sum + anchor.stabilityScore,
          0
        ) / selection.activeAnchors.length,
      status: "ok"
    }
  };
}

export function generateComparisonCandidates(input) {
  const alignment = alignLocalSegment(input);
  const observedElements = (input.observedElements ?? []).map(createObservedElement);
  const segmentObserved = observedElements.filter(
    (element) => element.segmentId === alignment.segmentId
  );
  const matchedElementIds = new Set();
  const candidates = [];

  for (const projected of alignment.projectedCheckpoints) {
    const compatibleObserved = segmentObserved
      .filter(
        (element) => element.elementKind === projected.semanticExpectation
      )
      .map((element) => ({
        element,
        distance: distance(element.point, projected.projectedPoint)
      }))
      .sort((left, right) => left.distance - right.distance);

    const nearest = compatibleObserved[0] ?? null;

    if (!nearest || nearest.distance > projected.expectedNeighborhood.searchRadius) {
      candidates.push({
        candidateId: `candidate-${projected.checkpointId}-missing`,
        candidateType: "missing",
        segmentId: alignment.segmentId,
        checkpointId: projected.checkpointId,
        activeAnchors: alignment.activeAnchors.map((anchor) => anchor.anchorId),
        normalizedBasis: projected.normalizedBasis,
        expectedLocation: projected.expectedNeighborhood,
        evidenceRegion: {
          evidenceId: alignment.fieldEvidence.evidenceId,
          center: projected.expectedNeighborhood.center,
          radius: projected.expectedNeighborhood.searchRadius
        },
        reasonCode: "expected_feature_not_found",
        reviewHint: "needs_review"
      });
      continue;
    }

    matchedElementIds.add(nearest.element.elementId);

    if (nearest.distance > projected.expectedNeighborhood.allowedRadius) {
      candidates.push({
        candidateId: `candidate-${projected.checkpointId}-position-diff`,
        candidateType: "position_diff",
        segmentId: alignment.segmentId,
        checkpointId: projected.checkpointId,
        activeAnchors: alignment.activeAnchors.map((anchor) => anchor.anchorId),
        normalizedBasis: projected.normalizedBasis,
        expectedLocation: {
          ...projected.expectedNeighborhood,
          observedPoint: nearest.element.point,
          observedElementId: nearest.element.elementId
        },
        evidenceRegion: {
          evidenceId: alignment.fieldEvidence.evidenceId,
          center: projected.expectedNeighborhood.center,
          radius: projected.expectedNeighborhood.searchRadius
        },
        reasonCode: "relative_offset_exceeds_tolerance",
        reviewHint: "needs_review"
      });
    }
  }

  for (const element of segmentObserved) {
    if (matchedElementIds.has(element.elementId)) {
      continue;
    }

    candidates.push({
      candidateId: `candidate-${element.elementId}-extra`,
      candidateType: "extra",
      segmentId: alignment.segmentId,
      checkpointId: null,
      activeAnchors: alignment.activeAnchors.map((anchor) => anchor.anchorId),
      normalizedBasis: null,
      expectedLocation: null,
      evidenceRegion: {
        evidenceId: alignment.fieldEvidence.evidenceId,
        center: element.point,
        radius: 24
      },
      reasonCode: "unmatched_observed_element",
      reviewHint: "needs_review"
    });
  }

  return {
    ...alignment,
    candidates
  };
}
