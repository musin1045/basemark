# BaseMark Normalized Coordinate Contract

## Purpose

This document defines how BaseMark represents checkpoints in structural relation coordinates rather than camera-pixel coordinates.

The contract exists so checkpoint meaning remains stable across image scale, zoom, and moderate viewpoint variation.

## Definition

A normalized coordinate is a checkpoint representation expressed relative to the active structural anchor set of a local segment.

It should describe where a checkpoint belongs in the structural frame, not where it happens to appear in one captured image.

## Role In The Engine

Normalized coordinates are used to:

1. preserve checkpoint meaning across captures
2. enable projection from drawing-defined positions into field evidence
3. support position-difference reasoning through relative tolerances

## Coordinate Basis

The coordinate basis must be derived from active anchors.

Allowed bases include:

- span ratio between anchor A and anchor B
- perpendicular offset from an anchor line
- relative height against floor, slab, or frame height
- width-relative offset from a door or window frame
- ratio within a bounded structural sub-segment

The preferred basis is the simplest one that preserves structural meaning for the checkpoint.

## Prohibited Primary Basis

The engine must not treat raw image pixels as the primary checkpoint definition.

Pixel coordinates may appear as derived outputs after projection, but not as the base representation.

## Checkpoint Data Contract

Each checkpoint definition should contain at least:

- `checkpointId`
- `segmentId`
- `anchorBasis`
- `coordinateModel`
- `normalizedPosition`
- `allowedTolerance`
- `semanticExpectation`

### Field Meaning

- `checkpointId`: stable identifier of the structural checkpoint
- `segmentId`: local segment in which the checkpoint is defined
- `anchorBasis`: the anchors or anchor lines used as the reference frame
- `coordinateModel`: the relation model, such as `span_ratio` or `span_ratio_plus_height_ratio`
- `normalizedPosition`: the relative coordinate values
- `allowedTolerance`: allowed deviation for position comparison
- `semanticExpectation`: what kind of expected element should appear at the checkpoint

## Example Coordinate Forms

Examples include:

- `span_ratio = 0.35`
- `span_ratio = 0.20`, `height_ratio = 0.60`
- `left_frame_offset_ratio = 0.15`
- `anchor_line_offset_ratio = 0.10`

These are examples only.
The contract is about structural relation, not one fixed parameterization.

## Acceptance Conditions

A normalized coordinate definition is valid only if:

1. it is grounded in the active anchor set
2. it preserves the checkpoint's structural meaning
3. it can be projected into a local field segment
4. it includes a usable tolerance model for comparison

## Tolerance Contract

Tolerance should be expressed relative to the same normalized basis when possible.

Examples:

- span-relative tolerance
- height-relative tolerance
- local neighborhood radius derived from anchor span

Tolerance should not depend only on fixed pixels unless the pixel threshold is explicitly derived from the normalized basis.

## Output Requirement

For each checkpoint, the engine should be able to state:

1. what anchor basis was used
2. what normalized values define the checkpoint
3. what tolerance applies
4. how the normalized definition was projected into field evidence

## Non-Goals

This contract does not require:

- exact camera calibration
- global coordinate recovery for the full room
- universal coordinate models for all possible segment types
