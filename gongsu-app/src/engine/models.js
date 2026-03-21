function assertObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }
}

function assertArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}

function assertFiniteNumber(value, fieldName) {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number.`);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createPoint(input, fieldName) {
  assertObject(input, fieldName);
  assertFiniteNumber(input.x, `${fieldName}.x`);
  assertFiniteNumber(input.y, `${fieldName}.y`);

  return {
    x: input.x,
    y: input.y
  };
}

export function createLocalSegment(input) {
  assertObject(input, "localSegment");
  assertNonEmptyString(input.segmentId, "localSegment.segmentId");
  assertNonEmptyString(input.segmentKind, "localSegment.segmentKind");

  return {
    segmentId: input.segmentId,
    segmentKind: input.segmentKind,
    label: input.label ?? null
  };
}

export function createStructuralAnchor(input) {
  assertObject(input, "structuralAnchor");
  assertNonEmptyString(input.anchorId, "structuralAnchor.anchorId");
  assertNonEmptyString(input.segmentId, "structuralAnchor.segmentId");
  assertNonEmptyString(input.anchorKind, "structuralAnchor.anchorKind");
  assertNonEmptyString(input.geometryType, "structuralAnchor.geometryType");
  assertObject(input.drawingReference, "structuralAnchor.drawingReference");
  assertObject(input.fieldObservation, "structuralAnchor.fieldObservation");
  assertFiniteNumber(input.stabilityScore, "structuralAnchor.stabilityScore");
  assertNonEmptyString(input.visibilityState, "structuralAnchor.visibilityState");

  return {
    anchorId: input.anchorId,
    segmentId: input.segmentId,
    anchorKind: input.anchorKind,
    geometryType: input.geometryType,
    drawingReference: {
      point: createPoint(
        input.drawingReference.point ?? input.drawingReference,
        "structuralAnchor.drawingReference.point"
      )
    },
    fieldObservation: {
      point: createPoint(
        input.fieldObservation.point ?? input.fieldObservation,
        "structuralAnchor.fieldObservation.point"
      )
    },
    stabilityScore: input.stabilityScore,
    visibilityState: input.visibilityState
  };
}

export function createNormalizedCheckpoint(input) {
  assertObject(input, "normalizedCheckpoint");
  assertNonEmptyString(input.checkpointId, "normalizedCheckpoint.checkpointId");
  assertNonEmptyString(input.segmentId, "normalizedCheckpoint.segmentId");
  assertArray(input.anchorBasis, "normalizedCheckpoint.anchorBasis");
  assertNonEmptyString(
    input.coordinateModel,
    "normalizedCheckpoint.coordinateModel"
  );
  assertObject(input.normalizedPosition, "normalizedCheckpoint.normalizedPosition");
  assertObject(input.allowedTolerance, "normalizedCheckpoint.allowedTolerance");
  assertNonEmptyString(
    input.semanticExpectation,
    "normalizedCheckpoint.semanticExpectation"
  );

  for (const anchorId of input.anchorBasis) {
    assertNonEmptyString(anchorId, "normalizedCheckpoint.anchorBasis[]");
  }

  return {
    checkpointId: input.checkpointId,
    segmentId: input.segmentId,
    anchorBasis: [...input.anchorBasis],
    coordinateModel: input.coordinateModel,
    normalizedPosition: clone(input.normalizedPosition),
    allowedTolerance: clone(input.allowedTolerance),
    semanticExpectation: input.semanticExpectation
  };
}

export function createObservedElement(input) {
  assertObject(input, "observedElement");
  assertNonEmptyString(input.elementId, "observedElement.elementId");
  assertNonEmptyString(input.segmentId, "observedElement.segmentId");
  assertNonEmptyString(input.elementKind, "observedElement.elementKind");

  return {
    elementId: input.elementId,
    segmentId: input.segmentId,
    elementKind: input.elementKind,
    point: createPoint(input.point, "observedElement.point")
  };
}

export function createFieldEvidence(input) {
  assertObject(input, "fieldEvidence");
  assertNonEmptyString(input.evidenceId, "fieldEvidence.evidenceId");
  assertNonEmptyString(input.segmentId, "fieldEvidence.segmentId");

  return {
    evidenceId: input.evidenceId,
    segmentId: input.segmentId,
    imageRef: input.imageRef ?? null
  };
}

export function createMetricCalibration(input) {
  if (input == null) {
    return null;
  }

  assertObject(input, "metricCalibration");
  assertArray(input.referenceAnchorBasis, "metricCalibration.referenceAnchorBasis");
  assertFiniteNumber(input.knownDistanceMm, "metricCalibration.knownDistanceMm");

  if (input.referenceAnchorBasis.length !== 2) {
    throw new Error("metricCalibration.referenceAnchorBasis must contain exactly two anchor ids.");
  }

  for (const anchorId of input.referenceAnchorBasis) {
    assertNonEmptyString(anchorId, "metricCalibration.referenceAnchorBasis[]");
  }

  return {
    referenceAnchorBasis: [...input.referenceAnchorBasis],
    knownDistanceMm: input.knownDistanceMm
  };
}
