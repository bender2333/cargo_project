# Manual Flow Redesign

Date: 2026-05-23

## Problem

The current workbench has two manual entry points:

- Manual placement: starts from an empty manual draft.
- Continue manually: copies the automatic packing result into the manual draft.

Both entry points currently land in the same editor. The data model is useful, but the product language is ambiguous: "fine tune" suggests small changes to an existing automatic result, while the editor also allows delete, move, rotate, Z-axis changes, and adding more cargo.

## User Stories

### Operations user starts from automatic packing

Goal: calculate quickly, inspect the proposed plan, then adjust a few placements that do not match real loading practice.

Expected flow:

1. Run automatic packing.
2. Enter manual fine-tune with all automatic boxes already placed.
3. See that the source is the automatic plan.
4. Move or rotate selected boxes.
5. Return to automatic mode knowing the manual draft is separate from the automatic result.

### Planner starts from manual placement

Goal: build a loading plan from a blank container when the real operation has constraints the automatic algorithm does not model yet.

Expected flow:

1. Enter manual placement.
2. Drag cargo from the pool.
3. Use validation to avoid collisions, out-of-bounds cargo, and unsupported cargo.
4. Save or export the manual plan once manual-history persistence exists.

## Option A: One Manual Mode With Explicit Starting Point

Keep one editor and one data model. Rename the entry points:

- `Manual placement`: starts with an empty draft.
- `Fine-tune automatic result`: starts from the latest automatic result.

Inside the editor show a small mode source label:

- `Manual draft: blank start`
- `Manual draft: copied from automatic result`

Exiting manual mode does not overwrite automatic results. Automatic recalculation remains explicit through the Load button.

Pros:

- Minimal code churn.
- Keeps validation, undo/redo, 2D/3D, keyboard shortcuts, and future manual save/export on one path.
- Avoids two editors with subtly different bugs.

Cons:

- Requires clear copy to explain that fine-tune is still a manual draft after entry.

## Option B: Separate Fine-Tune And Manual Placement Subflows

Keep two named subflows:

- Fine-tune: starts with automatic boxes, restricts delete/add by default, emphasizes small movement.
- Manual placement: starts empty and exposes full add/delete operations.

Pros:

- Stronger match to user mental model.
- Fine-tune could be safer for operations users.

Cons:

- More state branches.
- More tests and edge cases.
- Product must decide which controls differ and how to convert between subflows.

## Recommendation

Use Option A for the next implementation round.

Reasoning:

- The current `ManualDraft` and history model already supports both starting points.
- The immediate user confusion is naming and state communication, not a need for different physics or different persistence.
- Validation and free-view behavior should stay identical regardless of how the draft was created.

## Migration Cost

Small:

- Rename button copy.
- Add a `manualDraftSource: 'blank' | 'automatic'` state.
- Show a compact source indicator in the manual toolbar.
- Reset source to `blank` when entering manual placement directly.
- Set source to `automatic` when using the automatic result as the initial draft.

Manual plan persistence should be handled separately because the backend history schema does not yet store manual mode.
