# Changelog

## 2026-05-20

- Started PRD-driven refactor tracking.
- Completed subtask: move layer data into `PackingResult` and derive physical layers from support relationships instead of `z` height grouping.
- Added label stats, loading steps, diagnostics, support metadata, and layer aggregates to packing results.
- Updated the layer selector to use `physicalLayer` data from the calculation result.
- Verification: `npm test` passed 18 tests; `npm run lint` passed; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 5 tests after installing Chromium with `npx playwright install chromium`.
- Completed subtask: export the calculated packing plan instead of only exporting cargo input rows.
- Added `buildExportPlanRows` so exported spreadsheets include label, original dimensions, actual orientation, planned/placed/unplaced quantities, physical layer, work step, and failure reason from `PackingResult`.
- Verification: `npm test` passed 19 tests; `npm run lint` passed; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 5 tests.
- Completed subtask: surface label details and diagnostics in the result workspace.
- Added right-side result tabs for layer view, label detail table, and compliance diagnostics using `PackingResult.labelStats`, `PackingResult.unplaced`, and `PackingResult.diagnostics`.
- Verification: `npm test` passed 19 tests; `npm run lint` passed; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 6 tests.
- Completed subtask: add a 2D plan workspace view.
- Added a SVG-based 2D container view with top, front, and side projections, visible cargo labels, current-layer highlighting, and non-current-layer dimming from the same `PlacedBox.physicalLayer` data used by 3D and details.
- Verification: `npm test` passed 19 tests; `npm run lint` passed; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 7 tests.
