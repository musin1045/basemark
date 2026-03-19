# BaseMark Identity

## Core Definition

BaseMark is not primarily a local record app.
BaseMark is a drawing-grounded field comparison engine that computes comparison candidates from structural reference relationships and leaves final confirmation to a human operator.

The core of BaseMark is:

1. structural anchor selection
2. normalized coordinate definition
3. local scene alignment
4. missing / extra / position_diff candidate generation

The operating layer of BaseMark is:

1. frozen baseline snapshot preservation
2. local persistence
3. record status management
4. report generation
5. backup / restore
6. write-conflict control

## Fixed Product Statement

BaseMark does not try to generally understand a scene.
BaseMark calculates comparison candidates against a drawing-defined structural reference.

More precisely:

> BaseMark uses drawing-defined structural references and checkpoints, selects stable structural anchors from a local field image or video segment, builds normalized reference coordinates from relative distance and ratio, aligns a local scene segment against those anchors, and computes missing / extra / position_diff candidates for human confirmation.

## Core Pipeline

### 1. Structural Anchor Selection

The first question is not "what objects are visible?" but "what structure in this local segment can serve as the most stable reference?"

Example anchor types:

- column corner
- wall corner
- boundary wall
- door frame
- window frame
- slab edge
- opening reference line

The anchor policy is not to force one fixed anchor type.
The system chooses the most stable available structure in the current local segment.

This allows comparison even when the view changes or parts of the scene are occluded.
It also avoids requiring full-scene or full-3D reconstruction.

### 2. Normalized Coordinates

BaseMark does not treat checkpoints as absolute pixel coordinates.
It expresses them through structural relations such as:

- 0.35 of a wall span
- 0.2W from the left side of a door width
- 0.6H from the floor
- a ratio position relative to a window frame
- a percentage point along the segment between anchor A and anchor B

The coordinate system is therefore a structural relation coordinate system, not a camera coordinate system.

This is what allows the same checkpoint meaning to survive differences in distance, zoom, and camera angle.

### 3. Local Alignment

BaseMark aligns only the minimum local segment needed for comparison.
It does not require whole-room or whole-unit understanding.

Example local segments:

- wall segment between two rooms
- left-side wall segment of a door frame
- lower window box segment
- vertical wall zone beside a shaft
- partial ceiling-corner segment

The goal is not full 3D recovery.
The goal is to create the smallest usable comparison frame for the target segment.

### 4. Candidate Generation

After local alignment, BaseMark projects normalized checkpoint positions into the observed field segment and generates comparison candidates.

Candidate types:

- `missing`: something expected by the drawing is absent or the expected location is empty
- `extra`: something not present in the baseline appears in the target segment
- `position_diff`: an expected element exists but falls outside an allowed relative position tolerance

BaseMark generates candidates.
A human confirms, rejects, or marks them for review.

## What BaseMark Is Not

BaseMark is not:

1. a general-purpose scene-understanding AI
2. a full-space recognition or 3D reconstruction engine
3. a fully automatic final judgment system
4. a backup / restore product as its main identity

Its identity is comparison-candidate generation through structural relation calculation.

## Input / Process / Output

### Inputs

- drawing-defined structural references
- local segment definitions
- checkpoint definitions
- local field photos or video
- anchor candidates

### Internal Processing

- structural anchor selection
- normalized coordinate calculation
- local segment alignment
- expected position projection
- empty / added / shifted condition calculation

### Outputs

- `missing` candidate
- `extra` candidate
- `position_diff` candidate
- candidate evidence imagery
- human confirmation result
- final record / report

## Priority Rule

Development priority should stay fixed in this order:

1. comparison engine
2. human review flow
3. operating infrastructure

Expanded:

1. comparison engine
   - drawing structure registration
   - checkpoint definition
   - structural anchor selection
   - normalized coordinate calculation
   - local alignment
   - candidate generation
2. human review flow
   - candidate review UI
   - review-needed marking
   - confirm / reject / hold
3. operating infrastructure
   - frozen baseline snapshot preservation
   - local persistence
   - reporting
   - backup / restore

## Final Fixed Statement

> BaseMark's core is a drawing-based field comparison pipeline made of structural anchor selection, normalized coordinate definition, local segment alignment, and missing / extra / position_diff candidate generation.
> Frozen baseline preservation, local persistence, status management, reporting, backup, and restore are supporting systems for preserving and operating the output of that core pipeline.
> Therefore, BaseMark's identity is not "a local record app" but "a system that computes field comparison candidates against drawing-defined structural references."
