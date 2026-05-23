# UX Audit And Improvement List

Date: 2026-05-23

## Story 1: New User First Opens The Workbench

Flow reviewed:

1. User logs in or reaches the workbench.
2. Default language is Chinese.
3. User sees container parameters, cargo list, loading rules, visual workspace, and report panel.
4. User clicks Load and reviews 3D/2D, layers, details, diagnostics, and export.

Findings:

- P0: Automatic placement must not show stale boxes after container changes. Current round fixes this by clearing the visual result and asking the user to recalculate.
- P1: Manual keyboard and Z-axis controls were hidden knowledge. Current round adds explicit bilingual help.
- P1: Manual validation must explain physical failures in user language. Current round adds floating support validation and localized issue text.
- P2: "Continue manually" needs clearer source labeling. See `docs/manual-flow-redesign.md`.

## Story 2: Returning User Restores A Saved Plan

Flow reviewed:

1. User opens History.
2. User restores a saved plan.
3. Cargo, container, loading mode, labels, layers, and 3D visual state should be coherent.

Findings:

- P0: Eleventh round fixed the 3D blackout after history restore by scoping WebGL texture/material caches per scene.
- P1: Restored automatic plans are recalculated from stored container and cargo input. This is acceptable for automatic mode, but manual plans are not yet persisted as manual drafts.
- P2: History cards should eventually show whether a plan is automatic or manual once manual persistence is added.

## Story 3: Admin Investigates A User Problem

Flow reviewed:

1. Admin opens debug mode with `?debug=1` or `Ctrl+Shift+D`.
2. Admin checks user, mode, container, cargo, result, history, and recent browser errors.
3. Admin fetches recent server logs.

Findings:

- P0: Debug logs endpoint must remain admin-only and filter auth metadata. Eleventh round implemented this.
- P1: Debug panel should include manual validation counts and current free-view/manual interaction state in a future round.
- P2: Server logs are only a tail view. Filtering by user/path/time window would help support, but is not required for the current refactor.

## Next Review Inputs

- Add explicit manual draft source state: blank start versus copied from automatic result.
- Persist manual drafts in history after a schema migration.
- Add a manual-mode history restore flow and E2E coverage.
- Consider a small in-canvas status pill for `XY drag` versus `Z drag` during active pointer movement.
