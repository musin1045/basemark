# BaseMark Local Alignment Contract

## Purpose

This document defines the contract for aligning a drawing-defined local segment with a field image segment using structural anchors.

The goal is not full-space reconstruction.
The goal is to create the smallest usable comparison frame for one bounded local segment.

## Definition

Local alignment is the process of mapping a drawing-grounded structural frame into the observed field segment so normalized checkpoint positions can be projected and compared.

## Role In The Engine

Local alignment is used to:

1. connect the drawing-side anchor frame to field evidence
2. project normalized checkpoint positions into the field image
3. define expected checkpoint neighborhoods
4. support missing / extra / position_diff candidate generation

## Segment Constraint

Alignment must operate on a bounded local segment.

Examples:

- wall strip near a door frame
- span between two corners
- lower window section
- vertical band beside a shaft

The alignment contract intentionally excludes whole-room or whole-unit reconstruction as a requirement.

## Input Contract

Local alignment requires:

- `segmentId`
- drawing-side anchor set
- field-side observed anchor set
- normalized checkpoint definitions for the segment
- field evidence reference

## Alignment Output Contract

Alignment must output at least:

- `segmentId`
- `activeAnchors`
- `alignmentModel`
- `projectedCheckpoints`
- `expectedNeighborhoods`
- `alignmentQuality`

### Field Meaning

- `activeAnchors`: the selected anchors used in the final local frame
- `alignmentModel`: the mapping form used for local projection
- `projectedCheckpoints`: projected image-space or evidence-space locations derived from normalized coordinates
- `expectedNeighborhoods`: search or evidence windows around each projected checkpoint
- `alignmentQuality`: quality signal for whether comparison is safe enough to proceed

## Minimum Behavior

At minimum, local alignment must be able to:

1. take two or more active anchors
2. establish a usable local frame
3. project one checkpoint into one field image
4. define a neighborhood around the projected location

If the alignment quality is too low, the engine should fail safely rather than emit misleading candidates.

## Safe Failure Conditions

The engine should reject or defer candidate generation if:

1. the anchor set is inconsistent
2. the local segment is too occluded
3. the projected frame is too unstable
4. alignment quality falls below the minimum threshold

## Quality Contract

Alignment quality should reflect whether the local frame is trustworthy enough for comparison.

Possible factors include:

- anchor consistency
- anchor visibility
- geometric residual error
- stability of projected checkpoint neighborhoods

The exact scoring formula is implementation-specific.
The contract only requires that quality be explicit and usable by downstream candidate generation.

## Non-Goals

This contract does not require:

- global camera pose recovery
- mesh reconstruction
- BIM-scale scene registration
- semantic understanding of the full image
