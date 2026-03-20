import {
  createFieldEvidence,
  createLocalSegment,
  createMetricCalibration,
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

function anchorBasisMatches(referenceAnchorBasis, activeAnchors) {
  if (!referenceAnchorBasis || referenceAnchorBasis.length !== activeAnchors.length) {
    return false;
  }

  const reference = [...referenceAnchorBasis].sort();
  const active = activeAnchors.map((anchor) => anchor.anchorId).sort();
  return reference.every((anchorId, index) => anchorId === active[index]);
}

function createMetricFrame(calibration, activeAnchors) {
  if (!calibration) {
    return null;
  }

  if (!anchorBasisMatches(calibration.referenceAnchorBasis, activeAnchors)) {
    return null;
  }

  const spanPixels = distance(
    activeAnchors[0].fieldObservation.point,
    activeAnchors[1].fieldObservation.point
  );

  if (spanPixels === 0) {
    return null;
  }

  return {
    referenceAnchorBasis: [...calibration.referenceAnchorBasis],
    knownDistanceMm: calibration.knownDistanceMm,
    spanPixels,
    millimetersPerPixel: calibration.knownDistanceMm / spanPixels,
    pixelsPerMillimeter: spanPixels / calibration.knownDistanceMm
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
  const metricCalibration = createMetricCalibration(input.metricCalibration ?? null);

  if (fieldEvidence.segmentId !== selection.segment.segmentId) {
    throw new Error("fieldEvidence.segmentId must match the local segment.");
  }

  const activeAnchorIds = new Set(
    selection.activeAnchors.map((anchor) => anchor.anchorId)
  );
  const [anchorA, anchorB] = selection.activeAnchors;
  const metricFrame = createMetricFrame(metricCalibration, selection.activeAnchors);
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
      const metricProjection = metricFrame
        ? {
            distanceAlongSpanMm:
              projectedPoint.anchorSpanLength *
              (checkpoint.normalizedPosition.spanRatio ?? 0) *
              metricFrame.millimetersPerPixel,
            normalOffsetMm:
              projectedPoint.anchorSpanLength *
              (checkpoint.normalizedPosition.heightRatio ?? 0) *
              metricFrame.millimetersPerPixel,
            allowedRadiusMm:
              expectedNeighborhood.allowedRadius * metricFrame.millimetersPerPixel,
            searchRadiusMm:
              expectedNeighborhood.searchRadius * metricFrame.millimetersPerPixel
          }
        : null;

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
        expectedNeighborhood,
        metricProjection
      };
    });

  return {
    segmentId: selection.segment.segmentId,
    fieldEvidence,
    activeAnchors: selection.activeAnchors,
    alignmentModel: "two_anchor_span_projection",
    metricFrame,
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
        metricLocation: projected.metricProjection,
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
      const offsetVectorPx = {
        x: nearest.element.point.x - projected.projectedPoint.x,
        y: nearest.element.point.y - projected.projectedPoint.y
      };
      const metricOffset = alignment.metricFrame
        ? {
            offsetDistanceMm:
              nearest.distance * alignment.metricFrame.millimetersPerPixel,
            offsetVectorMm: {
              x: offsetVectorPx.x * alignment.metricFrame.millimetersPerPixel,
              y: offsetVectorPx.y * alignment.metricFrame.millimetersPerPixel
            }
          }
        : null;

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
        metricLocation: projected.metricProjection,
        metricOffset,
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
      metricLocation: alignment.metricFrame
        ? {
            evidenceRadiusMm: 24 * alignment.metricFrame.millimetersPerPixel
          }
        : null,
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
