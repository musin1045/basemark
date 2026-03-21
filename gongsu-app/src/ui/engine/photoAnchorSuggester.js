function assertImageDataInput(input) {
  if (!input || typeof input !== "object") {
    throw new Error("imageData must be an object.");
  }

  if (!Number.isInteger(input.width) || input.width <= 0) {
    throw new Error("imageData.width must be a positive integer.");
  }

  if (!Number.isInteger(input.height) || input.height <= 0) {
    throw new Error("imageData.height must be a positive integer.");
  }

  if (!input.data || typeof input.data.length !== "number") {
    throw new Error("imageData.data must be an array-like RGBA buffer.");
  }

  if (input.data.length !== input.width * input.height * 4) {
    throw new Error("imageData.data length must equal width * height * 4.");
  }
}

function rgbaToLuma({ width, height, data }) {
  const luma = new Float32Array(width * height);

  for (let index = 0; index < width * height; index += 1) {
    const rgbaIndex = index * 4;
    luma[index] =
      data[rgbaIndex] * 0.299 +
      data[rgbaIndex + 1] * 0.587 +
      data[rgbaIndex + 2] * 0.114;
  }

  return luma;
}

function normalizePoint(point) {
  return {
    x: Number(point.x.toFixed(1)),
    y: Number(point.y.toFixed(1))
  };
}

function getPixel(luma, width, x, y) {
  return luma[y * width + x];
}

function getCornerResponse(luma, width, height, x, y) {
  if (x <= 1 || y <= 1 || x >= width - 2 || y >= height - 2) {
    return 0;
  }

  const center = getPixel(luma, width, x, y);
  const dx = getPixel(luma, width, x + 1, y) - getPixel(luma, width, x - 1, y);
  const dy = getPixel(luma, width, x, y + 1) - getPixel(luma, width, x, y - 1);
  const diagonalA = getPixel(luma, width, x + 1, y + 1) - getPixel(luma, width, x - 1, y - 1);
  const diagonalB = getPixel(luma, width, x + 1, y - 1) - getPixel(luma, width, x - 1, y + 1);
  const curvature =
    Math.abs(getPixel(luma, width, x + 1, y) - 2 * center + getPixel(luma, width, x - 1, y)) +
    Math.abs(getPixel(luma, width, x, y + 1) - 2 * center + getPixel(luma, width, x, y - 1));

  return Math.abs(dx) * Math.abs(dy) + Math.abs(diagonalA - diagonalB) * 0.5 + curvature * 8;
}

function getVerticalEdgeResponse(luma, width, height, x, y) {
  if (x <= 1 || y <= 1 || x >= width - 2 || y >= height - 2) {
    return 0;
  }

  const horizontalDelta = Math.abs(
    getPixel(luma, width, x + 1, y) - getPixel(luma, width, x - 1, y)
  );
  const verticalStability =
    Math.abs(getPixel(luma, width, x, y + 1) - getPixel(luma, width, x, y - 1)) * 0.35;

  return Math.max(0, horizontalDelta - verticalStability);
}

function getHorizontalEdgeResponse(luma, width, height, x, y) {
  if (x <= 1 || y <= 1 || x >= width - 2 || y >= height - 2) {
    return 0;
  }

  const verticalDelta = Math.abs(
    getPixel(luma, width, x, y + 1) - getPixel(luma, width, x, y - 1)
  );
  const horizontalStability =
    Math.abs(getPixel(luma, width, x + 1, y) - getPixel(luma, width, x - 1, y)) * 0.35;

  return Math.max(0, verticalDelta - horizontalStability);
}

function createQuadrantDefinitions(width, height, margin) {
  const centerX = width / 2;
  const centerY = height / 2;

  return [
    {
      suggestionId: "photo-window-left-top",
      anchorPresetKey: "window_left_top",
      anchorKind: "window_frame_left_top",
      label: "window left top",
      shortLabel: "LT",
      range: {
        minX: margin,
        maxX: Math.max(centerX, margin + 1),
        minY: margin,
        maxY: Math.max(centerY, margin + 1)
      },
      targetCorner: { x: margin, y: margin }
    },
    {
      suggestionId: "photo-window-right-top",
      anchorPresetKey: "window_right_top",
      anchorKind: "window_frame_right_top",
      label: "window right top",
      shortLabel: "RT",
      range: {
        minX: Math.min(centerX, width - margin - 1),
        maxX: width - margin,
        minY: margin,
        maxY: Math.max(centerY, margin + 1)
      },
      targetCorner: { x: width - margin, y: margin }
    },
    {
      suggestionId: "photo-window-left-bottom",
      anchorPresetKey: "window_left_bottom",
      anchorKind: "window_frame_left_bottom",
      label: "window left bottom",
      shortLabel: "LB",
      range: {
        minX: margin,
        maxX: Math.max(centerX, margin + 1),
        minY: Math.min(centerY, height - margin - 1),
        maxY: height - margin
      },
      targetCorner: { x: margin, y: height - margin }
    },
    {
      suggestionId: "photo-window-right-bottom",
      anchorPresetKey: "window_right_bottom",
      anchorKind: "window_frame_right_bottom",
      label: "window right bottom",
      shortLabel: "RB",
      range: {
        minX: Math.min(centerX, width - margin - 1),
        maxX: width - margin,
        minY: Math.min(centerY, height - margin - 1),
        maxY: height - margin
      },
      targetCorner: { x: width - margin, y: height - margin }
    }
  ];
}

function getCornerBias(x, y, targetCorner, width, height) {
  const dx = Math.abs(x - targetCorner.x) / Math.max(width, 1);
  const dy = Math.abs(y - targetCorner.y) / Math.max(height, 1);
  return Math.max(0.55, 1.15 - (dx + dy) * 0.9);
}

function refineSuggestion(luma, width, height, candidate, searchRadius = 8) {
  let bestPoint = candidate.point;
  let bestScore = candidate.rawScore;

  for (
    let y = Math.max(2, Math.floor(candidate.point.y) - searchRadius);
    y <= Math.min(height - 3, Math.ceil(candidate.point.y) + searchRadius);
    y += 1
  ) {
    for (
      let x = Math.max(2, Math.floor(candidate.point.x) - searchRadius);
      x <= Math.min(width - 3, Math.ceil(candidate.point.x) + searchRadius);
      x += 1
    ) {
      const score = getCornerResponse(luma, width, height, x, y);
      if (score > bestScore) {
        bestScore = score;
        bestPoint = { x, y };
      }
    }
  }

  return {
    ...candidate,
    point: normalizePoint(bestPoint),
    rawScore: bestScore
  };
}

function scanLinePeaks(length, sampleFn, step) {
  const scores = new Array(length).fill(0);

  for (let index = 0; index < length; index += 1) {
    scores[index] = sampleFn(index);
  }

  const peaks = [];

  for (let index = 2; index < length - 2; index += step) {
    const score = scores[index];
    if (
      score > 0 &&
      score >= scores[index - 1] &&
      score >= scores[index + 1] &&
      score >= scores[Math.max(index - 2, 0)] &&
      score >= scores[Math.min(index + 2, length - 1)]
    ) {
      peaks.push({ index, score });
    }
  }

  return peaks.sort((left, right) => right.score - left.score);
}

function buildVerticalPeaks(luma, width, height, step) {
  return scanLinePeaks(
    width,
    (x) => {
      let score = 0;
      for (let y = 2; y < height - 2; y += step) {
        score += getVerticalEdgeResponse(luma, width, height, x, y);
      }
      return score / Math.max(Math.floor(height / step), 1);
    },
    step
  );
}

function buildHorizontalPeaks(luma, width, height, step) {
  return scanLinePeaks(
    height,
    (y) => {
      let score = 0;
      for (let x = 2; x < width - 2; x += step) {
        score += getHorizontalEdgeResponse(luma, width, height, x, y);
      }
      return score / Math.max(Math.floor(width / step), 1);
    },
    step
  );
}

function pickPeak(peaks, predicate) {
  return peaks.find((peak) => predicate(peak.index)) ?? null;
}

function createWallCornerSuggestions(verticalPeaks, horizontalPeaks, width, height) {
  if (!verticalPeaks.length || !horizontalPeaks.length) {
    return [];
  }

  const topEdge = pickPeak(horizontalPeaks, (value) => value <= height * 0.4) ?? horizontalPeaks[0];
  const leftVertical =
    pickPeak(verticalPeaks, (value) => value <= width * 0.35) ?? verticalPeaks[0];
  const rightVertical =
    pickPeak(verticalPeaks, (value) => value >= width * 0.65) ?? verticalPeaks[0];
  const strongest = Math.max(leftVertical.score, rightVertical.score, topEdge.score, 1);

  return [
    {
      suggestionId: "photo-wall-left-corner",
      anchorPresetKey: "wall_left_corner",
      anchorKind: "wall_left_corner",
      label: "wall left corner",
      shortLabel: "WL",
      point: normalizePoint({ x: leftVertical.index, y: topEdge.index }),
      confidence: Number((Math.min(leftVertical.score, topEdge.score) / strongest).toFixed(3)),
      rawScore: Number(Math.min(leftVertical.score, topEdge.score).toFixed(3)),
      family: "wall_corner"
    },
    {
      suggestionId: "photo-wall-right-corner",
      anchorPresetKey: "wall_right_corner",
      anchorKind: "wall_right_corner",
      label: "wall right corner",
      shortLabel: "WR",
      point: normalizePoint({ x: rightVertical.index, y: topEdge.index }),
      confidence: Number((Math.min(rightVertical.score, topEdge.score) / strongest).toFixed(3)),
      rawScore: Number(Math.min(rightVertical.score, topEdge.score).toFixed(3)),
      family: "wall_corner"
    }
  ];
}

function createWallCornerFallbackFromWindowCandidates(candidates) {
  const leftTop = candidates.find((candidate) => candidate.anchorPresetKey === "window_left_top");
  const rightTop = candidates.find((candidate) => candidate.anchorPresetKey === "window_right_top");

  if (!leftTop || !rightTop) {
    return [];
  }

  return [
    {
      suggestionId: "photo-wall-left-corner",
      anchorPresetKey: "wall_left_corner",
      anchorKind: "wall_left_corner",
      label: "wall left corner",
      shortLabel: "WL",
      point: leftTop.point,
      confidence: Number((leftTop.rawScore / Math.max(leftTop.rawScore, rightTop.rawScore, 1)).toFixed(3)),
      rawScore: Number(leftTop.rawScore.toFixed(3)),
      family: "wall_corner"
    },
    {
      suggestionId: "photo-wall-right-corner",
      anchorPresetKey: "wall_right_corner",
      anchorKind: "wall_right_corner",
      label: "wall right corner",
      shortLabel: "WR",
      point: rightTop.point,
      confidence: Number((rightTop.rawScore / Math.max(leftTop.rawScore, rightTop.rawScore, 1)).toFixed(3)),
      rawScore: Number(rightTop.rawScore.toFixed(3)),
      family: "wall_corner"
    }
  ];
}

export function suggestPhotoAnchorsFromImageData(input, options = {}) {
  assertImageDataInput(input);
  const step = Number.isInteger(options.step) && options.step > 0 ? options.step : 3;
  const margin = Number.isInteger(options.margin) && options.margin > 0 ? options.margin : 16;
  const minimumConfidence =
    typeof options.minimumConfidence === "number" ? options.minimumConfidence : 0.16;
  const luma = rgbaToLuma(input);
  const quadrants = createQuadrantDefinitions(input.width, input.height, margin);
  const candidates = [];
  let strongestRawScore = 0;

  for (const quadrant of quadrants) {
    let best = null;

    for (let y = quadrant.range.minY; y < quadrant.range.maxY; y += step) {
      for (let x = quadrant.range.minX; x < quadrant.range.maxX; x += step) {
        const rawScore = getCornerResponse(luma, input.width, input.height, x, y);
        if (rawScore <= 0) {
          continue;
        }

        const weightedScore =
          rawScore * getCornerBias(x, y, quadrant.targetCorner, input.width, input.height);

        if (!best || weightedScore > best.weightedScore) {
          best = {
            ...quadrant,
            point: { x, y },
            rawScore,
            weightedScore,
            family: "window_frame"
          };
        }
      }
    }

    if (!best) {
      continue;
    }

    const refined = refineSuggestion(luma, input.width, input.height, best);
    strongestRawScore = Math.max(strongestRawScore, refined.rawScore);
    candidates.push(refined);
  }

  const verticalPeaks = buildVerticalPeaks(luma, input.width, input.height, step);
  const horizontalPeaks = buildHorizontalPeaks(luma, input.width, input.height, step);
  const wallCornerCandidates = createWallCornerSuggestions(
    verticalPeaks,
    horizontalPeaks,
    input.width,
    input.height
  );
  const normalizedWallCandidates =
    wallCornerCandidates.length > 0
      ? wallCornerCandidates
      : createWallCornerFallbackFromWindowCandidates(candidates);

  for (const candidate of normalizedWallCandidates) {
    strongestRawScore = Math.max(strongestRawScore, candidate.rawScore);
    candidates.push(candidate);
  }

  if (strongestRawScore === 0) {
    return [];
  }

  return candidates
    .map((candidate) => ({
      suggestionId: candidate.suggestionId,
      anchorPresetKey: candidate.anchorPresetKey,
      anchorKind: candidate.anchorKind,
      label: candidate.label,
      shortLabel: candidate.shortLabel,
      point: candidate.point,
      family: candidate.family ?? "generic",
      confidence:
        typeof candidate.confidence === "number"
          ? candidate.confidence
          : Number((candidate.rawScore / strongestRawScore).toFixed(3)),
      rawScore: Number(candidate.rawScore.toFixed(3))
    }))
    .filter((candidate) => candidate.confidence >= minimumConfidence)
    .sort((left, right) => right.confidence - left.confidence);
}
