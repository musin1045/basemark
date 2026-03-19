# BaseMark Minimum Engine Scope

## Purpose

This document fixes the minimum product slice that should exist before the main BaseMark patent is rewritten around the comparison engine.

The goal is not a full app.
The goal is to prove the technical core:

1. structural anchor selection
2. normalized coordinate definition
3. local segment alignment
4. missing / extra / position_diff candidate generation

## Fixed Boundary

This minimum slice is for the comparison engine only.

It is not primarily about:

- backup / restore
- workflow-heavy record management
- full project administration
- global scene understanding
- full 3D reconstruction
- automatic final judgment

Those may exist around the engine, but they do not define the success of this slice.

## Minimum Input Contract

The minimum engine should accept:

1. one drawing-grounded local segment definition
2. two or more structural anchors for that segment
3. one to three checkpoints defined relative to the anchors
4. one field image for the same local segment
5. observed anchor candidates in the field image

### Drawing Segment Contract

The segment definition should identify a bounded comparison region such as:

- wall segment beside a door frame
- span between two wall corners
- lower window sub-segment
- vertical strip beside a shaft

The segment must be local, not whole-room.

### Anchor Contract

Each anchor should be represented as a stable structural reference, for example:

- wall corner
- door-frame edge
- window-frame edge
- slab boundary point
- opening line endpoint

At least two anchors are required so that relative position can be normalized along a stable frame.

### Checkpoint Contract

Each checkpoint should be defined in structural relation coordinates, not camera pixels.

Example forms:

- ratio along anchor A to anchor B
- relative offset from a door width
- relative height from floor or slab edge
- distance expressed as a ratio of an anchor span

## Minimum Processing Pipeline

### 1. Anchor Selection

The engine must choose which visible structural references form the active local frame for comparison.

The rule is:

> choose the most stable available structure in the current local segment, not a globally fixed object class.

Success at this step means the engine can declare:

- which anchors are active
- why they are usable in this segment
- what local frame they define

### 2. Normalized Coordinate Construction

The engine must convert drawing checkpoints into normalized structural coordinates relative to the active anchors.

This means a checkpoint is represented as:

- a ratio on an anchor span
- a vertical ratio
- or another relative coordinate derived from structural reference geometry

Success at this step means the checkpoint meaning survives:

- image scale changes
- zoom changes
- moderate viewpoint differences

### 3. Local Alignment

The engine must align the drawing-defined local frame with the observed field segment.

The alignment does not need whole-space mapping.
It only needs to support projection inside the selected local segment.

Success at this step means the engine can:

- map normalized checkpoint positions into the field image
- define an expected neighborhood for each checkpoint
- preserve the local structural frame used for that projection

### 4. Candidate Generation

The engine must calculate at least the following result types:

- `missing`
- `position_diff`

`extra` should be included if feasible in the same slice.

Candidate definitions:

- `missing`: the expected checkpoint neighborhood is empty or lacks the expected element
- `position_diff`: the expected element exists but lies outside an allowed relative position tolerance
- `extra`: an observed element exists in the local comparison segment without a baseline checkpoint correspondence

The engine output is candidate generation, not final judgment.

## Minimum Output Contract

The engine should emit:

1. candidate type
2. checkpoint or local segment reference
3. active anchor set
4. normalized coordinate basis
5. projected expected location
6. evidence crop or evidence image reference
7. confidence or review-needed hint

Human confirmation remains outside the engine core, but the output must be legible enough for human review.

## Minimum Demonstration Scenario

The first working scenario should be intentionally narrow.

Recommended scenario:

1. one door-adjacent wall segment
2. two visible structural anchors
3. one expected checkpoint
4. one field image
5. one generated candidate

Example progression:

1. choose two stable anchors from a door frame or wall corners
2. define one checkpoint by span ratio and height ratio
3. align the local frame to the field image
4. project the expected checkpoint neighborhood
5. emit either `missing` or `position_diff`

If this works reliably, the engine has a patentable core demonstration.

## Minimum Success Criteria

The minimum slice is successful if it can do all of the following:

1. declare an active structural anchor set for one local segment
2. express at least one checkpoint in normalized structural coordinates
3. project that checkpoint into one field image through local alignment
4. generate at least one stable candidate result
5. show evidence that a human can review

## What Can Wait

These items should not block the minimum engine slice:

- polished UI
- full record lifecycle
- backup package handling
- report export formats
- multi-user workflow
- cloud sync
- full drawing management
- whole-unit scene modeling

## Patent Readiness Trigger

The comparison-engine patent draft should be rewritten when the repository can show:

1. a bounded local segment contract
2. a structural anchor contract
3. a normalized checkpoint coordinate contract
4. a local alignment contract
5. reproducible candidate generation output

At that point, the main patent can move from "local record preservation system" to "drawing-grounded comparison engine," and persistence / backup / restore can be demoted to supporting claims or supporting embodiments.
