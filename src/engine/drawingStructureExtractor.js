function assertNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}

function parseNumber(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be a finite number.`);
  }

  return parsed;
}

function parseAttributes(source) {
  const attributes = {};
  const regex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g;
  let match = regex.exec(source);

  while (match) {
    attributes[match[1]] = match[2];
    match = regex.exec(source);
  }

  return attributes;
}

function normalizePoint(point) {
  return {
    x: Number(point.x.toFixed(3)),
    y: Number(point.y.toFixed(3))
  };
}

function createSegment(x1, y1, x2, y2, sourceType, sourceId) {
  return {
    segmentId: `${sourceType}-${sourceId}-${x1}-${y1}-${x2}-${y2}`,
    sourceType,
    sourceId,
    start: normalizePoint({ x: x1, y: y1 }),
    end: normalizePoint({ x: x2, y: y2 }),
    length: Number(Math.hypot(x2 - x1, y2 - y1).toFixed(3))
  };
}

function parseLineElements(svgText) {
  const segments = [];
  const regex = /<line\b([^>]*)\/?>/g;
  let index = 0;
  let match = regex.exec(svgText);

  while (match) {
    const attrs = parseAttributes(match[1]);
    segments.push(
      createSegment(
        parseNumber(attrs.x1, "line.x1"),
        parseNumber(attrs.y1, "line.y1"),
        parseNumber(attrs.x2, "line.x2"),
        parseNumber(attrs.y2, "line.y2"),
        "line",
        attrs.id ?? `line-${index + 1}`
      )
    );
    index += 1;
    match = regex.exec(svgText);
  }

  return segments;
}

function parseRectElements(svgText) {
  const segments = [];
  const anchors = [];
  const regex = /<rect\b([^>]*)\/?>/g;
  let index = 0;
  let match = regex.exec(svgText);

  while (match) {
    const attrs = parseAttributes(match[1]);
    const rectId = attrs.id ?? `rect-${index + 1}`;
    const x = parseNumber(attrs.x ?? "0", "rect.x");
    const y = parseNumber(attrs.y ?? "0", "rect.y");
    const width = parseNumber(attrs.width, "rect.width");
    const height = parseNumber(attrs.height, "rect.height");
    const corners = {
      leftTop: { x, y },
      rightTop: { x: x + width, y },
      leftBottom: { x, y: y + height },
      rightBottom: { x: x + width, y: y + height }
    };

    segments.push(
      createSegment(x, y, x + width, y, "rect", rectId),
      createSegment(x + width, y, x + width, y + height, "rect", rectId),
      createSegment(x + width, y + height, x, y + height, "rect", rectId),
      createSegment(x, y + height, x, y, "rect", rectId)
    );

    anchors.push(
      {
        anchorId: `${rectId}-left-top`,
        anchorKind: "frame_left_top",
        sourceType: "rect",
        sourceId: rectId,
        point: normalizePoint(corners.leftTop)
      },
      {
        anchorId: `${rectId}-right-top`,
        anchorKind: "frame_right_top",
        sourceType: "rect",
        sourceId: rectId,
        point: normalizePoint(corners.rightTop)
      },
      {
        anchorId: `${rectId}-left-bottom`,
        anchorKind: "frame_left_bottom",
        sourceType: "rect",
        sourceId: rectId,
        point: normalizePoint(corners.leftBottom)
      },
      {
        anchorId: `${rectId}-right-bottom`,
        anchorKind: "frame_right_bottom",
        sourceType: "rect",
        sourceId: rectId,
        point: normalizePoint(corners.rightBottom)
      }
    );

    index += 1;
    match = regex.exec(svgText);
  }

  return { segments, anchors };
}

function parsePolylineElements(svgText) {
  const segments = [];
  const regex = /<polyline\b([^>]*)\/?>/g;
  let index = 0;
  let match = regex.exec(svgText);

  while (match) {
    const attrs = parseAttributes(match[1]);
    const polylineId = attrs.id ?? `polyline-${index + 1}`;
    const rawPoints = (attrs.points ?? "")
      .trim()
      .split(/\s+/)
      .map((pair) => pair.split(","))
      .filter((pair) => pair.length === 2)
      .map(([x, y]) => ({
        x: parseNumber(x, "polyline.points.x"),
        y: parseNumber(y, "polyline.points.y")
      }));

    for (let pointIndex = 0; pointIndex < rawPoints.length - 1; pointIndex += 1) {
      const start = rawPoints[pointIndex];
      const end = rawPoints[pointIndex + 1];
      segments.push(
        createSegment(
          start.x,
          start.y,
          end.x,
          end.y,
          "polyline",
          `${polylineId}-${pointIndex + 1}`
        )
      );
    }

    index += 1;
    match = regex.exec(svgText);
  }

  return segments;
}

function clusterCorners(points, tolerance = 4) {
  const clusters = [];

  for (const point of points) {
    const existing = clusters.find(
      (entry) =>
        Math.abs(entry.point.x - point.x) <= tolerance &&
        Math.abs(entry.point.y - point.y) <= tolerance
    );

    if (existing) {
      existing.members += 1;
      existing.point = normalizePoint({
        x: (existing.point.x + point.x) / 2,
        y: (existing.point.y + point.y) / 2
      });
      continue;
    }

    clusters.push({
      point: normalizePoint(point),
      members: 1
    });
  }

  return clusters
    .map((entry, index) => ({
      cornerId: `corner-${index + 1}`,
      point: entry.point,
      supportCount: entry.members
    }))
    .sort((left, right) => right.supportCount - left.supportCount);
}

export function extractDrawingStructureFromSvg(svgText, options = {}) {
  assertNonEmptyString(svgText, "svgText");
  const tolerance = Number.isFinite(options.cornerTolerance)
    ? options.cornerTolerance
    : 4;
  const lineSegments = parseLineElements(svgText);
  const rectResult = parseRectElements(svgText);
  const polylineSegments = parsePolylineElements(svgText);
  const segments = [...lineSegments, ...rectResult.segments, ...polylineSegments];
  const rawCornerPoints = segments.flatMap((segment) => [segment.start, segment.end]);
  const corners = clusterCorners(rawCornerPoints, tolerance);

  return {
    sourceFormat: "svg",
    segmentCount: segments.length,
    cornerCount: corners.length,
    segments,
    corners,
    anchorCandidates: [
      ...rectResult.anchors,
      ...corners.map((corner) => ({
        anchorId: `${corner.cornerId}-candidate`,
        anchorKind: "drawing_corner",
        sourceType: "corner",
        sourceId: corner.cornerId,
        point: corner.point,
        supportCount: corner.supportCount
      }))
    ]
  };
}
