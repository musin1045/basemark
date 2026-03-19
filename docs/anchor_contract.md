# BaseMark Anchor Contract

## Purpose

This document defines the contract for structural anchors used by the BaseMark comparison engine.

Anchors are not generic detected objects.
Anchors are stable structural references chosen to define a usable local comparison frame.

## Definition

A structural anchor is a reference point, edge, line, or bounded structural feature that:

1. belongs to the drawing-grounded local segment
2. is expected to remain more stable than finish-level or movable objects
3. can support relative position reasoning for checkpoints

## Role In The Engine

Anchors are used to:

1. define the active local frame
2. support normalized coordinate construction
3. support local alignment between drawing and field evidence
4. preserve comparison meaning when the camera view changes

Without anchors, BaseMark should not attempt structural comparison.

## Anchor Types

Allowed anchor forms include:

- corner point
- edge endpoint
- frame edge
- boundary line
- opening side reference
- slab or ceiling boundary point

Example semantic classes include:

- wall corner
- door-frame edge
- window-frame edge
- shaft boundary
- slab edge
- opening line endpoint

The contract does not require one fixed anchor class across all scenes.

## Selection Rule

The selection rule is:

> choose the most stable available structural reference in the current local segment.

This means the engine should prefer:

1. structure over finish detail
2. geometry that is less likely to be temporarily occluded
3. references that best support relative position transfer

The engine should not hard-code a global rule such as "always use a door frame."

## Minimum Anchor Set

The minimum active anchor set is two anchors.

Two anchors are required to support:

1. a local span
2. a relative position ratio along that span
3. a minimal local frame for projection

Three or more anchors may be used if needed for better stability, but two is the minimum acceptable set.

## Anchor Data Contract

Each anchor record should contain at least:

- `anchorId`
- `segmentId`
- `anchorKind`
- `geometryType`
- `drawingReference`
- `fieldObservation`
- `stabilityScore`
- `visibilityState`

### Field Meaning

- `anchorId`: stable identifier within the comparison segment
- `segmentId`: local segment to which the anchor belongs
- `anchorKind`: semantic type such as `wall_corner` or `door_frame_edge`
- `geometryType`: one of `point`, `line`, `edge`, or another bounded structural form
- `drawingReference`: anchor location or geometry from the drawing side
- `fieldObservation`: observed location or geometry in the field image
- `stabilityScore`: score or rank used to justify anchor selection
- `visibilityState`: whether the anchor is visible, partial, occluded, or rejected

## Acceptance Conditions

An anchor may be accepted into the active anchor set only if:

1. it belongs to the selected local segment
2. it is structurally meaningful for relative comparison
3. it is sufficiently observable in the field evidence
4. it supports a consistent local frame with the other selected anchors

## Rejection Conditions

An anchor should be rejected if:

1. it depends on non-structural decoration only
2. it is too ambiguous to support stable matching
3. it is too occluded to define reliable geometry
4. it conflicts with the active local frame

## Output Requirement

For each comparison run, the engine should be able to state:

1. which anchors were considered
2. which anchors were selected
3. what local frame those anchors define
4. why rejected anchors were not used

## Non-Goals

This contract does not require:

- whole-scene anchor extraction
- global room understanding
- full 3D structural modeling
- final defect judgment
