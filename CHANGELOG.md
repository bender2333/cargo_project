# Changelog

## 2026-07-20 (issues/0720 diagnosis)

- Located the manual quick-place rendering defect: rotated candidate dimensions are stored as base dimensions while only `orientationKey` is overwritten, so validation and Three.js render different footprints.
- Parsed the supplied snapshots: the 109-box snapshot contains 47 orientation-metadata mismatches and 49 rendered AABB overlap pairs while the live manual validator reports no issues. The captured coordinates remain inside the effective container, so boundary overflow is not yet proven by the available snapshots.
- Located the stacked-flip behavior: four-way rotation exists, but non-floor height-changing rotations preserve vertical center instead of the supporting base plane, producing either a support gap (`floating`) or penetration (`overlap`).
- Confirmed that downloadable cargo-import workbooks are absent. Current “import templates” are saved field-mapping rules; the legacy archive generated CSV client-side, and the current `xlsx` dependency can generate a standard workbook without a backend download endpoint.
- Verification: focused unit baseline passed 5 files / 78 tests. Focused Playwright run attempted 2 manual-flow tests; both stopped at login because the API backend on `127.0.0.1:3010` was not running (`ECONNREFUSED`). Product code and test assertions were not changed.

## 2026-07-08 (Block modes diverge)

- Changed block-engine quantity sorting to prefer higher block counts before block volume, while volume mode keeps volume-first ordering. The post-block quantity fallback now also drains higher-remaining SKUs first so the count-first route keeps the large-container baseline.
- Added Vietnam 20GP assertions that quantity and volume no longer produce identical results, quantity places at least as many cartons as volume, envelope fill stays above 88%, floor empty stays below 8%, and both modes are checked for overlap/bounds violations.
- Vietnam 20GP measured result: quantity 463/864, util 90.63%, envelope fill 92.75%, floor empty 5.46%; volume 462/864, util 91.27%, envelope fill 92.75%, floor empty 4.15%.
- Vietnam 40HQ regression check: quantity 839/864, util 77.87%; volume 823/864, util 76.62%, both above the frozen 76.5% baseline.
- Updated the Vietnam import E2E gap-fill check to explicitly use Volume priority; `decision.md` records why the gap-fill presentation assertion moved off the new count-first default.
- Release note: added `2026-07-08-r50-loading-modes-priority-removal` for distinct loading-mode behavior and the deprecated priority-field removal.
- Verification: `rg -n "loadingPriority" src` returned no matches; `npm run lint` passed; `npm test` passed 56 files / 346 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e -- --reporter=list` passed 93 / skipped 1 / failed 0.
- Deploy: `npm run deploy` completed all 7 steps; remote backup `/root/cargo_project-backup-20260708-085656`; remote HTTP/API health checks passed.
- Remote E2E regression: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npm run test:e2e -- --reporter=list` passed 93 / skipped 1 / failed 0 against production.

## 2026-07-08 (Remove deprecated loadingPriority field)

- Popped the pending `src/types.ts` deletion and completed the field removal across import parsing, template defaults, last-import config, custom cargo payloads, Workbench UI, packing output, block-engine routing, unit tests, and E2E fixtures.
- Kept `groundOnly` intact as the remaining independent cargo constraint. Import/template UI now exposes `Ground only` but no longer reads, maps, defaults, saves, sorts, or displays loading priority.
- Updated `decision.md` with the formal removal decision and the E2E contract update after stale priority assertions failed.
- Updated in-app release notes so the current notification history no longer advertises priority controls.
- Vietnam 20GP deletion check: quantity 462/864, util 91.27%, envelope fill 92.75%, floor empty 4.15%; volume 462/864, util 91.27%, envelope fill 92.75%, floor empty 4.15%. This matches the pre-cleanup block-engine result and confirms the cleanup did not change the Vietnam packing outcome.
- Verification: `rg -n "loadingPriority" src` returned no matches; `npm run lint` passed; `npm test` passed 56 files / 346 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e -- --reporter=list` passed 93 / skipped 1 / failed 0.

## 2026-07-08 (Block-building engine — pure carton route expansion)

- Expanded the guarded block-engine route from the original Vietnam-shaped `5+ SKU / quantity >= 20` condition to any large pure carton load: `quantity` / `volume`, at least 2 SKUs, at least 100 cartons, no first-priority cargo, no `groundOnly`, no non-stackable cargo, and no per-item `maxStackLayers`.
- Added `shouldUseBlockEngine` so the route boundary is explicit and testable, and added coverage for a two-SKU / 100-carton load that would have missed the old five-SKU gate.
- Verification: `npx vitest run src/lib/packing.blockEngine.test.ts src/lib/packing.test.ts src/lib/packing.stackfill.test.ts src/lib/packing.31pallet.test.ts` passed 4 files / 56 tests; `npm run lint` passed; `npm test` passed 56 files / 348 tests.
- Build gate: `npm run build` still fails on the pre-existing dirty `src/types.ts` removal of `loadingPriority`; this route change does not add new `loadingPriority` type errors.
- E2E: first full run had one transient startup timeout before the test body (`English` button not found); targeted rerun passed; second full `npm run test:e2e` passed 93 / skipped 1 / failed 0 with the temporary backend stopped after the run.

## 2026-07-07 (Block-building engine — Subtask 6 regression closure)

- Regression closure for the block-building sequence: subtask 2 EMS, subtask 3 block candidates, subtask 4 guarded block route, and subtask 5 mixed gap-fill presentation are committed separately.
- Fixture裁决状态: Vietnam 20GP meets the planned improvement gates in the committed block-engine tests; Vietnam 40HQ remains above the frozen 76.5% baseline but is not a significant improvement, so it stays recorded as a follow-up optimization rather than a weakened assertion.
- Verification: `npm run lint` passed; `npm test` passed 56 files / 347 tests; `npm run test:e2e` passed 93 / skipped 1 / failed 0 with a temporary backend on port 3010.
- Build/deploy gate: `npm run build` still fails before Vite on the pre-existing dirty `src/types.ts` removal of `loadingPriority`. Deployment was not attempted because the production deploy flow requires a passing local build.

## 2026-07-07 (Block-building engine — Subtask 5 mixed gap-fill presentation)

- Added a runtime placement-source marker for block-engine filler boxes. Post-block single-box fallback placements and one-box block commits are marked as `gap-fill` so mixed fill does not remain silent in downstream views.
- Surfaced mixed gap-fill notes in the layer selector, active layer stats, loading-step rows, detail table, and export plan rows with English/Chinese copy.
- Added `placementNote` to export plan rows and default export field keys; rows with any gap-fill placement report `Mixed gap-fill`.
- Added focused coverage proving Vietnam 20GP block-engine results contain recognizable gap-fill boxes and export rows carry the mixed-fill note. Extended the Vietnam workbook E2E import flow to run placement and confirm `Mixed gap-fill` appears in the Details view.
- Verification: `npx vitest run src/lib/exportPlan.test.ts src/lib/packing.blockEngine.test.ts` passed 2 files / 11 tests; `npm run lint` passed; `npm test` passed 56 files / 347 tests.
- Build gate: `npm run build` still fails on the pre-existing dirty `src/types.ts` removal of `loadingPriority`; this subtask did not repair that unrelated type contract.
- E2E: targeted Vietnam import test passed with a temporary backend on port 3010; full `npm run test:e2e` passed 93 / skipped 1 / failed 0 with the temporary backend stopped after the run.

## 2026-07-07 (Block-building engine — Subtask 4 guarded main loop)

- Reworked `calculatePacking` so repeated multi-SKU carton workloads in `quantity` / `volume` mode use block candidates + EMS placement. Each carton inside a committed block is still staged and committed through `canPlace`, preserving boundary, overlap, support-ratio, `groundOnly`, and stack-chain gates.
- Added bounded greedy selection (`MAX_BLOCK_CATALOG_SIZE`, `MAX_BLOCK_REJECTIONS_PER_STEP`) with single-box fallback fill after block placement. Priority/small/single-piece fixtures stay on the existing path for now; this is recorded in `decision.md`.
- Added `src/lib/packing.blockEngine.test.ts` for the Vietnam regression metrics: 20GP must beat baseline utilization, envelope fill, floor empty, and geometry-error gates; 40HQ must stay above the frozen 76.5% utilization baseline.
- Vietnam 20GP measured by script: quantity 462/864, util 91.27%, envelope fill 92.75%, floor empty 4.15%, 191ms; volume 462/864, util 91.27%, envelope fill 92.75%, floor empty 4.15%, 135ms; no error diagnostics.
- Vietnam 40HQ measured by script: quantity 823/864, util 76.62%, envelope fill 77.37%, floor empty 10.68%, 3323ms; volume 823/864, util 76.62%, envelope fill 77.37%, floor empty 10.68%, 3967ms; no error diagnostics. This is above but not significantly above the 76.5% baseline.
- Verification: `npx vitest run src/lib/packing.blockEngine.test.ts` passed 1 file / 2 tests; `npx vitest run src/lib/packing.test.ts src/lib/packing.stackfill.test.ts src/lib/packing.31pallet.test.ts` passed 3 files / 53 tests; `npm run lint` passed; `npm test` passed 56 files / 346 tests.
- Build gate: `npm run build` still fails on the pre-existing dirty `src/types.ts` removal of `loadingPriority`; this subtask did not touch that field per task instruction.
- E2E: first `npm run test:e2e` failed because no backend was listening on 127.0.0.1:3010. After starting `npm run start:server` with `PORT=3010`, full E2E passed 93 / skipped 1 / failed 0. Temporary backend was stopped after the run.

## 2026-07-07 (Block-building engine — Subtask 3 block generation)

- Added `src/lib/blocks.ts` as a pure same-SKU block candidate generator. It enumerates integer `nx × ny × nz` blocks per orientation, preserves cargo label/name/color metadata, and exposes block dimensions, count, volume, footprint area, and weight for the later search/placement step.
- Enforced block-generation constraints without importing `packing.ts`: container fit, cargo quantity, `groundOnly`, `stackable=false`, and `maxStackLayers`.
- Added tests for the planned Vietnam-width case (`530 × 305` cartons generate an `ny=7` block in 20GP width), ground-only single-layer blocks, non-stackable single-layer blocks, max-stack limiting, and zero-gap volume equality.
- Verification: `npx vitest run src/lib/blocks.test.ts` passed 1 file / 5 tests; `npm run lint` passed; `npm test` passed 55 files / 344 tests.
- Build gate: `npm run build` still fails on the pre-existing dirty `src/types.ts` removal of `loadingPriority`; no block-specific TypeScript errors appeared before that known blocker. The repeated gate state is recorded in `decision.md`.
- E2E not run for this pure `src/lib` block-generation slice; UI/3D/import flows are unchanged in subtask 3.

## 2026-07-07 (Block-building engine — Subtask 2 EMS space model)

- Added `src/lib/emsSpace.ts` as a pure EMS geometry module with `initEMS`, `splitEMS`, `pruneContained`, and `emsBestFit`. It does not import `packing.ts`; callers pass the container dimensions they want to model.
- Added intent-focused EMS tests covering the initial full-container EMS, L-shaped remainder after a corner block, preservation of a middle gap between separated blocks, contained-space pruning, and best-fit selection by minimum wasted volume.
- Verification: `npx vitest run src/lib/emsSpace.test.ts` passed 1 file / 5 tests; `npm run lint` passed; `npm test` passed 54 files / 339 tests.
- Build gate: `npm run build` failed before Vite because the pre-existing dirty `src/types.ts` edit removed `loadingPriority` while current code still references it in import, packing, custom cargo, and Workbench paths. Per the block-building task warning, this subtask did not touch `loadingPriority`; the failure is recorded in `decision.md`.
- E2E not run for this pure `src/lib` geometry slice; UI/3D/import flows are unchanged in subtask 2.

## 2026-06-30 (Loading priority and pallet-top fill — Round 49)

- Subtask 1 data model: added optional `loadingPriority: 'first' | 'normal'` to cargo and placed-box types so priority can flow through packing results, exports, history JSON, and later UI/import work. Also extended import-template defaults with `groundOnly` and `loadingPriority` for the upcoming import-template field pass.
- Verification: `npm run build` passed with the existing Vite chunk-size warning.
- Subtask 2 algorithm: priority now sorts before all four loading-mode comparators, automatic packing uses the 0.5 support threshold recorded in decision.md, and normal cargo in a priority load can use pallet-top/grid candidates for gap filling. Real 0629 fixture result: A10+B1+D100 placed (111 total, 76.19% util), above the 83-piece input baseline; decision.md records why the draft C+D ≥150 estimate is not a defensible gate for this heuristic.
- Subtask 2 tests: added priority-first ordering coverage for all four loading modes, a non-blocking oversize-first fallback case, real 0629 A/B-first pallet fill coverage, and a `groundOnly` assertion that C never appears above floor and is surfaced as no-space when floor space is gone.
- Verification: `npm run lint` passed; `npm test` passed 53 files / 333 tests; `npm run build` passed with the existing Vite chunk-size warning.
- Subtasks 3/4 UI + import: added `Loading priority` and `Ground only` controls to the main cargo form, edit dialog, and cargo library; cargo lists now surface both fields. Excel import, mapping templates, last-used raw mapping defaults, custom cargo API payloads, and the custom cargo SQLite table now preserve both fields.
- Import/performance fix: importing large workbooks now marks packing as dirty and defers automatic packing until the explicit Load button. The container-comparison tab also computes only when opened, preventing the Vietnam template import flow from blocking on unrelated multi-container packing. Pallet-top candidates are deduplicated and ordinary top-fill expansion is limited to first-priority loads or capacity-one top cargo.
- Subtask 3/4 tests: extended import parser, import mapping form, last import config, custom cargo client/server, and Playwright import/form coverage for `loadingPriority='first'` and `groundOnly=true`.
- Verification: `npm run lint` passed; `npm test` passed 53 files / 334 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 93 / skipped 1 / failed 0.
- Release note: added `2026-06-30-r49-loading-priority-ground-only` with bilingual user-facing notes for first-priority/ground-only cargo, Excel/template support, and explicit Load behavior for large imports.
- Deploy: `npm run deploy` passed all 7 steps with remote backup `/root/cargo_project-backup-20260630-075820`; remote HTTP/API health check passed.
- Remote verification: live `http://101.33.232.150/` serves bundle `assets/index-Dq5SPFWq.js`, and the deployed bundle contains `2026-06-30-r49-loading-priority-ground-only`.
- Remote E2E regression (`PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npm run test:e2e`): passed 93 / skipped 1 / failed 0 against production.

## 2026-06-18 (Template selection only pre-fills mappings — Round 38)

Implements `plans/2026-06-18-template-apply-only-prefill.md`: corrects the Round 37 misread. Selecting an import template is parameter prefill, not import confirmation.

- Behavior correction: the import template dropdown now calls `applyImportTemplate(templateId)` only. It applies the saved mapping, header/start rows, units, combined-dimension mode, split order, and defaults into the mapping dialog; it does not parse the workbook, set cargo items, close the modal, or switch navigation.
- Confirmation boundary: importing still happens only via `confirmMappingImport`. Users can select a template, inspect the preview/table mapping, adjust any column, then click Confirm Import.
- Preserved Round 37 useful work: missing mapped columns still compute during template prefill and flow into `ImportMappingForm.missingColumns`, so absent workbook headers remain red-framed immediately after template selection.
- Tests updated: template E2E expectations now encode prefill-only semantics, including “select template but cancel means no cargo imported”, default no-template state, missing-column red frame, and Vietnam combined-template prefill before confirmation. Per direct user instruction for this task, E2E was updated but not executed.
- Release note: added `2026-06-18-r48-template-prefill-confirm` and revised r47/r46 notes so the in-app release notes no longer advertise the superseded immediate-import or auto-apply behavior.
- Verification (local): `npm run lint` clean; `npm test` 53 files / 329 tests pass; `npm run build` passes with the existing Vite chunk-size warning. Reviews: TypeScript/React/general reviews reported no blocking issues. E2E intentionally skipped by direct user request for this task.
- Deploy (production): `npm run deploy` passed all 7 steps — local build, remote backup `/root/cargo_project-backup-20260618-070111`, `dist/` and backend modules synced, `cargo-server.service` restarted, and remote HTTP/API health check passed.
- Remote verification: live `http://101.33.232.150/` serves bundle `/assets/index-zguq9R2-.js`; browser-side bundle fetch confirmed it contains `2026-06-18-r48-template-prefill-confirm`, `Templates prefill mappings for review`, and `模板先预填，确认后导入`, and no longer contains the superseded title `Template selection imports immediately`.

## 2026-06-18 (Template selection triggers import — Round 37)

Implements `plans/2026-06-18-template-select-triggers-import.md`: import templates are explicit parsing rules, not persistent auto-prefill.

- Behavior: Excel import mapping dialog now opens with `import-template-select` set to 「No template」/「无」. It no longer auto-applies `cargo_last_used_template_id` or the saved raw mapping config on modal open; the hand-mapping path remains available via the normal Confirm Import button.
- Template selection: choosing a saved template in the import dialog now calls `importWithTemplate(template)` and parses `importRows` immediately. Successful template imports close the modal, switch to the report/import-log view, and populate cargo details without requiring an extra Confirm Import click.
- Parser config: added `buildTemplateImportConfig(template)` in `src/lib/importCargo.ts` so template-triggered parsing uses the selected template object directly instead of reading React state immediately after `setState`.
- Missing columns: `ImportMappingForm` now accepts `missingColumns`; mapped inputs whose saved column header is absent from the current workbook get `data-invalid="true"`, red border/ring, and the inline message `Column not found in file / 列在文件中未找到`. The parser still runs and importLog still records row-level errors; the modal stays open when missing mapped columns exist.
- Test coverage: added `src/components/ImportMappingForm.test.tsx`; extended `src/lib/importCargo.test.ts` with config-builder and real Vietnam fixture coverage; updated template E2E flows to assert default no-template state, select-template-immediate import, missing-column red frame, and manual mapping fallback.
- Release note: added `2026-06-18-r47-template-select-import` and revised the previous r46 note so the in-app release notes no longer advertise the superseded auto-apply behavior.
- Verification (local): `npm run lint` clean; `npm test` 53 files / 329 tests pass; `npm run build` passes with the existing Vite chunk-size warning; full `npm run test:e2e` 93 passed / 1 skipped / 0 failed. Reviews: React/general approved; TypeScript review found the legacy empty-`combinedColumn` missing-column bug and an exact-text test gap, both fixed and re-verified with targeted unit + template E2E 10/10.
- Deploy (production): `npm run deploy` passed all 7 steps — local build, remote backup `/root/cargo_project-backup-20260618-052306`, `dist/` and backend modules synced, `cargo-server.service` restarted, and remote HTTP/API health check passed.
- Remote verification: live `http://101.33.232.150/` serves bundle `/assets/index-C-CEX-rj.js`; browser-side bundle fetch confirmed it contains `2026-06-18-r47-template-select-import`, `Template selection imports immediately`, and `选择模板即刻导入`.
- Remote E2E regression (`PLAYWRIGHT_BASE_URL=http://101.33.232.150/`): full `npm run test:e2e` passed 93 / skipped 1 / failed 0 against production.

## 2026-06-18 (Save import template = remember it for next import — Round 36)

Review feedback: after mapping columns in the Excel import dialog, clicking 「保存模板」 should be enough — the next time the template is used the mappings should already be applied, with no manual re-selection. It wasn't: saving a template did not make it the one auto-applied next time.

- Root cause (`src/Workbench.tsx` `handleSaveImportTemplate`): saving a named template set `selectedImportTemplateId` but never persisted `lastUsedTemplateId`. Only `confirmMappingImport` wrote `cargo_last_used_template_id`. So save-then-cancel (or saving in one session and importing in a later one) left `lastUsedTemplateId` unset; the next upload's `importExcel` auto-apply check (`lastUsedExists`) was false and the dialog reopened blank, forcing the user to re-pick the template from the dropdown. (Picking it from the dropdown always restored every mapping correctly — the gap was purely that save did not mark the template as last-used.)
- Fix: `handleSaveImportTemplate` now persists the saved template id as last-used (`localStorage.setItem(LAST_USED_TEMPLATE_KEY, saved.id)` + `setLastUsedTemplateId(saved.id)`), mirroring the confirm path. Saving a template is an explicit "I'll reuse this" signal, so the next import auto-applies it. Surgical: the only behavioral change is that save now remembers; the confirm path, the standalone manager page, and parse rules are untouched.
- Live reproduction + verification (headless Chromium against local API 3010): fresh user, configure combined-mode Vietnam mapping, save, cancel, re-upload → before the fix the dialog reopened blank (dropdown 「No template」, fields empty); after the fix the same flow auto-applied the template (dropdown selected, headerRow/startRow/combined column/label/name/quantity all restored, confirm enabled).
- Test: added E2E `auto-applies a saved import template on the next import without re-selecting` (save → cancel → re-upload → assert dropdown shows the template and `map-select-*` prefilled → confirm imports 1 row). Verified RED without the fix (dropdown resolved to 「No template」) then GREEN with it, so the test fails when this business logic regresses.
- Verification (local): `npm run lint` clean; `npm test` 52 files / 324 tests pass; `npm run build` passes (existing Vite chunk-size warning); full `npm run test:e2e` 92 passed / 1 skipped / 0 failed.
- Deploy (production): `npm run deploy` passed all 7 steps — local build, remote backup `/root/cargo_project-backup-20260618-020342`, `dist/` synced into the live site, `server/*.mjs` + `package*.json` synced, `cargo-server.service` restarted, Step 7 HTTP+API health check passed.
- Remote E2E regression (`PLAYWRIGHT_BASE_URL=http://101.33.232.150/`): targeted template-reuse paths passed 5/5 — the new save→remember→auto-apply test plus visible-manager reuse, manual-config memory, top-level manager reuse, and Vietnam combined-dimension template — confirming the fix is live on production.
- Release note: added `2026-06-18-r46-save-template-remember` to `src/data/releaseNotes.ts` (EN/ZH user-facing summary). Missed in the first deploy and shipped in a follow-up `npm run deploy` (remote backup `/root/cargo_project-backup-20260618-023854`, health check passed); live bundle `assets/index-Cj0VqqIl.js` verified to contain the note string.

## 2026-06-17 (Upside-down boxes + same-cargo gaps — Round 35)

Review feedback on `cargo-debug-snapshot (14).json`: ① boxes rendered upside-down (倒放, the purple `TP`/`WLH` boxes showed inverted "dl" labels); ② same cargo laid out with side gaps between boxes (缝隙). Reproduced the snapshot result exactly (`calculatePacking` → PLACED 454, orient LWH 197 / WLH 253 / HWL 4) before changing anything.

- Issue ① root cause (3D render, not packing): `orientationRenderingBasisVectors` (`src/lib/orientationTransform.ts`) restores a proper rotation from auto-packing's canonical all-positive axes by negating one axis. For canonical `WLH`/`LHW`/`HWL` the naive basis is left-handed; it was always negating **height**, which for `WLH` (whose height already points up) flips the box upside-down — every auto-packed `WLH` box (253 here) rendered with inverted labels. Fix: when the basis is improper **and** body height already points up, negate a horizontal axis (`width`) so the box stays upright; otherwise keep the existing height-flip (legacy/tilted snapshot axes). `renderedFootprint` is sign-invariant so AABBs/manual checks are unchanged. Verified with an isolated WebGL render (LWH/WLH/HWL) before and after, plus the full 435-box scene.
- Issue ② root cause (packing): `placementScore` preferred `LWH` only via a tiny `labelFacingPenalty`, so the same cargo split into mixed `LWH`/`WLH` orientations (7 of the snapshot's cargos), giving alternating 530/305 floor pitch and side gaps. Fix: each cargo commits to the orientation of its first upright placement (`committedOrientations: Map<cargoId, OrientationKey>` in `calculatePacking`, written in `placeEntry`); later boxes of that cargo get a strong `orientationCommitmentPenalty` (½ container volume) for any other upright orientation. It is a penalty, not a hard filter — a box still switches orientation when the committed one cannot fit anywhere (snapshot mixed cargos 7→1, all via this fallback) rather than going unplaced. Tilts stay governed by `tiltPenalty`; the penalty (½ volume) stays below `tiltPenalty` (1 volume) so an upright fallback still beats a tilt. Threaded through both `bestPlacement` (non-volume) and the `volume` best-fit loop.
- Combined effect on the snapshot: orientation now LWH 282 / WLH 153, **no `HWL` tilt**, mixed cargos 7→1, floor side-floating 11→7. The recomputed scene renders every label upright with clean even columns (visual check, iso + top).
- Tradeoff (recorded in decision.md): on this pathologically overloaded fixture (864 cargo, ~50% fit) placed dropped 454→435 (−19, −4.2%). The sweep showed the drop appears at any penalty ≥0.05 and is flat to 0.5 — it is the inherent consistency-vs-density cost the same-cargo decision accepted, not a magnitude artifact. For normal loads (everything fits) consistency costs nothing; the 80×400×500×600 test still places all 80, now as clean 4-layer columns.
- Test changes: new `orientationTransform` test (canonical `WLH` keeps height up, not flipped); new `packing` block (same-cargo single-orientation commitment; orientation fallback still places the box a hard filter would strand). Updated the `400×500×600 ×80` test — its old `maxLayer ≥ 5` assertion rewarded the uneven mixed-orientation staircase (the very gaps under complaint); it now asserts full placement (80) + clean multi-layer (≥4) + reflects consistent orientation.
- Verification (local): `npm run lint` clean; `npm test` 52 files / 324 tests pass; `npm run build` passes (existing Vite chunk-size warning); full `npm run test:e2e` with local API on port 3010 — container-calc + manual-3d + responsive-3d 86 passed / 1 skipped, auth-isolation 5 passed (91 passed / 1 skipped / 0 failed).
- Release note: added `2026-06-17-r45-upright-boxes-and-gaps` to `src/data/releaseNotes.ts` (EN/ZH user-facing summary of the upright-render and same-orientation packing fixes).
- Deploy (production): `npm run deploy` — local build, remote backup `/root/cargo_project-backup-20260617-101902`, scp `dist/` + `server/*.mjs` + `package*.json` to cargo-server, `systemctl restart cargo-server.service`, Step 7 HTTP+API health check passed.
- Remote verification: live root `http://101.33.232.150/` served the new bundle `assets/index-DRDkDusW.js` which contains `r45-upright-boxes-and-gaps`; `/api/import-templates` returned 401 (route live/auth protected).
- Remote E2E regression (`PLAYWRIGHT_BASE_URL=http://101.33.232.150/`): targeted 3D-render + packing paths passed 7/7 — interactive 3D canvas, camera-view switching, all-exposed-face labels, near-top free-camera label stability, 2D packing-orientation label rotation, recalculated utilization, and global max-stack-layers.

## 2026-06-17 (Template Entry Consolidation — Round 34)

Implements REVIEW.md「第三十四轮」and `plans/2026-06-17-template-entry-consolidation.md`: collapse template management to the navigation page, remove the empty-data toolbar path, and make new/edit template mapping usable without a sample workbook.

- TDD evidence: updated the affected E2E expectations first and ran the targeted template subset before production edits. Expected RED was observed: `.fill()` failed because `map-select-*` and `template-combined-column` were still `<select>` elements, proving the old pure-select behavior was under test.
- Mapping inputs: `ImportMappingForm` column controls changed from pure `<select>` to controlled `<input list="...">` + `<datalist>` suggestions while preserving the existing `data-testid` contract (`map-select-*`, `template-combined-column`). Empty string still means unmapped. Existing selected values and `availableColumns` both populate suggestions, so editing saved templates keeps their typed headers visible.
- Pure hand-entry template creation: navigation 「模板管理」 → 「新建模板」 no longer requires `template-manager-sample-input`. Users can type column names directly (e.g. Goods/L/W/H or customer-specific headers). E2E now creates a reusable import template from the navigation page without loading a sample first and then imports the Excel fixture through it.
- Optional sample headers: 「加载样本表头」 remains an assistant, not a prerequisite. New E2E uploads a sample workbook and asserts the datalist contains `Goods` and `L` suggestions, then still uses the same fillable controls to save the template.
- Entry consolidation: removed the toolbar `open-template-manager` button that previously opened the import mapping modal with `[{}]` empty data. E2E asserts `open-template-manager` has count 0. The real 「Import XLSX」 flow and import-dialog save-template controls remain intact.
- Combined dimensions cleanup: removed `dimensions` from ordinary field rendering. `mapping.dimensions` remains part of the data model, but it is written only by the dedicated `template-combined-column` input; E2E asserts `map-select-dimensions` has count 0 in combined mode while L/W/H still hide and restore correctly.
- Compatibility fix from TypeScript review: legacy combined-dimension templates whose serialized `combinedColumn` is `''` but whose `mapping.dimensions` still stores the size column now keep working. Parser fallback now uses `combinedColumn || mapping.dimensions`, and Workbench edit/draft/save boundaries preserve that fallback so editing an old combined template cannot blank the combined-size column.
- Local verification: targeted RED observed as above; targeted GREEN passed 6 template/import tests; legacy combined-column fallback regression passed; mandatory reviewers ran (React/general no issues; TS found the legacy fallback bug and it was fixed); `npm run lint` clean; `npm test` 52 files / 321 tests passed; `npm run build` passed with the existing Vite chunk-size warning; full `npm run test:e2e` passed 91 / skipped 1 / failed 0.
- Deploy (production): `npm run deploy` passed — local build produced bundle `assets/index-C898On96.js`, remote backup `/root/cargo_project-backup-20260617-055925`, `dist/` + `server/*.mjs` + `package*.json` synced to cargo-server, `cargo-server.service` restarted, and deploy Step 7 HTTP+API health check passed.
- Remote verification: live root `http://101.33.232.150/` served the new bundle; unauthenticated `/api/import-templates` and `/api/export-templates` both returned 401 (routes live/auth protected); browser-side bundle check confirmed `2026-06-17-r44-template-entry-consolidation` and `模板入口收敛` are present.
- Remote E2E regression (`PLAYWRIGHT_BASE_URL=http://101.33.232.150/`): targeted 34th-round paths passed 5/5 — visible-manager reuse, top-level template-manager pure hand-entry, optional sample-header suggestions, Vietnam combined-dimension template, and related template entry assertions.

## 2026-06-16 (Template unification / Export templates / Combined auto-fill / Help bubble — Round 33)

Implements REVIEW.md「第三十三轮」points 1-4 (scope A+B per decision.md 2026-06-16). Order 4 → 3 → 2 → 1(B→A); each point its own commit.

- Point 4 — Help bubble clipping: rewrote `HelpTooltip` to render its popover through a `react-dom` portal into `document.body` with `position:fixed` + viewport clamping, so the import modal's `overflow-y-auto` (which also clips `overflow-x`) can no longer crop a leftmost-column tooltip. E2E `explains template mapping fields` strengthened to assert the popover's `getBoundingClientRect()` stays fully inside the viewport.
- Point 3 — Combined dimension auto-fill: the import dialog field loop now returns `null` for length/width/height when `templateDimensionMode === 'combined'`, hiding the redundant standalone selectors (the combined column + split order supply L/W/H). E2E (Vietnam fixture) asserts the selectors disappear in combined mode and reappear in separate mode; row dims stay correct (530×305×310).
- Point 2 — Remember manual mapping: new testable `src/lib/lastImportConfig.ts` (user-isolated key `cargo-last-import-config:<id>`, normalize/load/save with 9 unit tests) persists the raw config (mapping/units/headerRow/startRow/dimensionMode/combinedColumn/dimensionOrder/defaults) on every confirm — independent of named-template save. The import dialog prefills it when no still-existing named template applies (named template wins). E2E: hand-map → confirm → reopen → fields prefilled → confirm again.
- Point 1B — Unified mapping UI: extracted `src/components/ImportMappingForm.tsx` (controlled, `availableColumns`, `labels`, `testIdPrefix`). The import dialog and the top-level template manager page both render it; the manager page's free-text inputs are gone and it gains a "Load sample headers" file input to source the dropdown columns. Manager E2E switched from `.fill` to `.selectOption` with `tm-new-`/`tm-edit-` prefixed test ids.
- Point 1A — Export templates: new `export_templates` table (CREATE block + idempotent migration v7) + user-scoped GET/POST/PUT/DELETE `/api/export-templates` mirroring import templates; `src/lib/exportTemplates.ts` data layer; `ExportTemplate`/`ExportTemplateColumn`/`ExportColumnUnit` types. `src/lib/exportPlan.ts` gains `EXPORT_FIELD_KEYS`, `isExportDimensionField`, `projectExportRow`, `buildExportRowsFromTemplate` (8 unit tests: column select/order/rename, cm conversion only for dimension columns, blank/header fallback). New `src/components/ExportColumnsEditor.tsx` (pick columns, reorder ↑/↓, rename header, mm/cm unit) on the template manager page; a selector beside "Export XLSX" chooses the template (default = full columns). E2E builds a template, exports, and parses the XLSX to assert chosen columns/headers/order and 800 mm → 80 cm.
- Verification (local): `npm run lint` clean; `npm test` 52 files / 320 tests pass; `npm run build` passes (existing Vite chunk-size warning); full `npm run test:e2e` with local API on port 3010 — container-calc.spec.ts 43/43, manual-3d + auth-isolation + responsive-3d 47 passed / 1 skipped / 0 failed.
- Deploy (production): `npm run deploy` — local build, remote backup `/root/cargo_project-backup-20260616-105652`, scp `dist/` + `server/*.mjs` + `package*.json` to cargo-server, `systemctl restart cargo-server.service` (migration v7 created `export_templates` remotely), Step 7 HTTP+API health check passed. Remote verification: `http://101.33.232.150/` → 200, `/api/export-templates` → 401 (route live), `/api/import-templates` → 401, deployed bundle `assets/index-COk-HoDQ.js` contains `r43-template-unify-export`.
- Remote E2E regression (`PLAYWRIGHT_BASE_URL=http://101.33.232.150/`): template-manager / help-tooltip / combined-dimension / last-config / export-template tests all pass against the live server (5 passed on the first run; the 6th `renames and deletes` hit a transient `net::ERR_EMPTY_RESPONSE` on `page.goto` and passed on rerun — a remote network hiccup, not a code failure).

## 2026-06-12 (Snap, Render Orientation, Manual Performance — Done)

- Plan3-Snap: increased default edge snap tolerance 30mm→80mm with intent-encoding test. Fixed 3D drop edge snap: pointer-up now applies edge snap before grid snap, matching pointer-move preview. Added `snapGuides` shared logic with 10 unit tests (3D/2D rendering deferred).
- Plan2-Render: fixed `handleContinueManually` orientation metadata inconsistency via `makeManualBox`, added `renderedFootprint` test utility (5 tests). Added move clamping to container bounds before validation. Rotation gizmo now hidden for `canRotate=false` boxes with `data-selected-box-can-rotate` E2E attribute. Volume utilization now shows used/net CBM alongside percentage. Import auto-mapping gives clear guidance when 0 cargo rows are recognized.
- Plan1-Perf: added `validateBox` incremental validation (O(n³)→O(n²) in hot paths), wired into move/drop handlers with equivalence tests (48 manualPlacement tests). Eliminated repeated NodeMap rebuild in `supportingStackLimitViolation` via pre-built `buildSupportChainNodes` — full `validateDraft` now O(n²) instead of O(n³). Drag throttling skipped after steps 1-2.
- Verification: `npm run lint` clean; `npm test` 50 files / 291 tests all pass; `npm run build` passes.

- Commits: 9 total across all three plans.


## 2026-06-10 (Feedback Round 2)

- Task D: added inline field help for the import mapping modal, covering header row, start row, dimension mode, combined size column, and label column with bilingual copy and stable `help-tooltip-*` test hooks.
- Verification: targeted red/green E2E `npm run test:e2e -- --grep "explains template mapping fields"` first failed on missing `help-tooltip-header-row`, then passed after implementation. Subtask gates passed: `npm run lint`; `npm test` (46 files / 264 tests); `npm run build` with the existing Vite chunk-size warning.
- Task A: changed selected-box clearance annotations to AutoCAD-style dimension lines with two extension lines per measurement, smaller transparent text labels, no endpoint sphere markers, and keyboard-help entries for the `M` ruler shortcut in manual and automatic 3D views.
- Verification: targeted red/green E2E `npm run test:e2e -- e2e/manual-3d.spec.ts --grep "键盘帮助|余量标注|自动模式 3D"` first failed on missing `M` help text, missing `data-clearance-line-counts`, and missing `auto-keyboard-help`; after implementation it passed 3 tests. Subtask gates passed: `npm run lint`; `npm test` (46 files / 264 tests); `npm run build` with the existing Vite chunk-size warning.
- Task C: added `buildManualPackingResult()` so manual placements are cloned, assigned loading-depth physical layers, sorted into work steps by layer / low height / width position, and consumed by the existing loading-task groups and playback sequence. Manual 3D playback now uses the playback cursor to progressively reveal boxes, and loading-step selection highlights/selects the manual boxes.
- Verification: `npm test -- src/lib/manualSteps.test.ts` first failed on the missing `manualSteps` module, then passed 4 intent tests after implementation. Targeted E2E `npm run test:e2e -- e2e/manual-3d.spec.ts --grep "手动模式作业回放和装柜步骤"` first failed on missing `loading-steps-panel`, then passed after Workbench wiring. Subtask gates passed: `npm run lint`; `npm test` (47 files / 268 tests); `npm run build` with the existing Vite chunk-size warning.
- Task B: moved the loading-sheet PDF export button out of the visual toolbar and into `LoadingStepsPanel`, then switched each step card from the 2D top plan to an offscreen Three.js orthographic isometric snapshot with highlighted current-step boxes and faded prior boxes. The PDF renderer keeps a 2D fallback if WebGL is unavailable.
- Verification: `npm test -- src/lib/offscreenIsoRenderer.test.ts` first failed on the missing renderer module, then passed. Targeted E2E `npm run test:e2e -- e2e/container-calc.spec.ts --grep "exports loading sheet PDF"` first failed because `visual-workspace` still contained `export-loading-sheet-pdf`, then passed after button migration and PDF wiring. A direct headless Chromium module call returned `data:image/png;base64,` from `renderIsoSnapshot()`. Subtask gates passed: `npm run lint`; `npm test` (48 files / 269 tests); `npm run build` with the existing Vite chunk-size warning.
- Notification update: added the `2026-06-10-r39-feedback-round2` in-app release note covering template help, AutoCAD-style clearance lines, manual loading steps/playback, and 3D isometric loading-sheet PDFs.
- Final verification and deployment: final local gates passed with `npm run lint`, `npm test` (48 files / 269 tests), `npm run build` with the existing Vite chunk-size warning, and full local `npm run test:e2e` on Playwright port 5188 (88 passed / 1 skipped / 0 failed). `npm run deploy` passed with remote backup `/root/cargo_project-backup-20260610-035932`, remote HTTP health check returned 200, and `cargo-server.service` was active. The deployed public bundle `http://101.33.232.150/assets/index-Bm1PKsPM.js` contains `2026-06-10-r39-feedback-round2`. The first full remote E2E run hit two remote interaction/empty-response failures; targeted rerun of those two tests then passed, and the final full remote run with `PLAYWRIGHT_BASE_URL=http://101.33.232.150/` plus `PLAYWRIGHT_WORKERS=1` passed (88 passed / 1 skipped / 0 failed, 12.6m).

## 2026-06-09 (Import Template Vietnam Fixture and SKU Labels)

- Completed the Vietnam irregular workbook coverage for `plans/2026-06-09-import-template-system.md`: the reusable combined-dimension template imports `test-data/excel/越南第十一批6.2海运.xlsx`, reports `Import success: 24`, and surfaces the skipped summary row in the import log.
- Preserved full SKU labels such as `TB-C10-EV_v1.1` through cargo-list normalization, automatic packing placed boxes, loading steps, label stats, unplaced rows, and the details table instead of collapsing business labels to two-character prefixes.
- Recorded the fixture mismatch: the current workbook contains 24 SKU data rows plus one `汇总` row, not 25 SKU data rows.
- Updated the in-app notification head entry to `2026-06-09-r38-import-sheet-clearance`, covering irregular import templates, loading-sheet PDF export, and selected-box 3D clearance annotations.
- Hardened the 31-pallet regression test to read the intended Russian workbook fixture explicitly, so Excel lock files under `test-data/excel` cannot be mistaken for the business fixture.
- Restored one-click auto import for standard XLSX/CSV workbooks after the raw-matrix reader change, while keeping irregular workbooks on the template-mapping path.
- Hardened container E2E tests to click the exact `Load` button so the new `Export loading sheet PDF` button is not matched by Playwright's substring role lookup.
- Verification: `npm test -- src/lib/labels.test.ts src/lib/packing.test.ts` passed 41 tests; targeted E2E `npx playwright test e2e/container-calc.spec.ts --grep "Vietnam irregular"` passed 1 test; full `npm test` passed 46 files / 264 tests; targeted E2E import/load regression subset passed 18 tests and then 5 tests after the auto-import fix. Final local gates passed: `npm run lint`; `npm test` (46 files / 264 tests); `npm run build` with the existing chunk-size warning; full `npm run test:e2e` using local API on port 3010 and isolated Playwright port 5188 (86 passed / 1 skipped / 0 failed). Remote deploy passed with `npm run deploy`, backup `/root/cargo_project-backup-20260609-085418`, remote health check passed, and full remote E2E passed with `PLAYWRIGHT_BASE_URL=http://101.33.232.150/` / `PLAYWRIGHT_WORKERS=1` (86 passed / 1 skipped / 0 failed).

## 2026-06-09 (Loading Sheet PDF Export)

- Implemented the multi-page loading sheet PDF export from `plans/2026-06-09-loading-sheet-pdf.md`: the workbench now exposes `export-loading-sheet-pdf`, builds a result-sourced loading sheet model, renders a legend/summary page plus 2 x 3 step-card pages, and downloads `loading-sheet.pdf`.
- Added a DOM-aware `exportLoadingSheetPdf()` helper using `jspdf` and canvas-rendered pages so Chinese/English labels, legend rows, cumulative top-view snapshots, and highlighted current-step boxes are embedded as images without server-side export.
- Verification: `npm run lint` passed; `npm test -- src/lib/loadingSheet.test.ts` passed 4 tests; `npm run build` passed with the existing Vite chunk-size warning and jsPDF-related chunks; targeted E2E `npx playwright test e2e/container-calc.spec.ts --grep "loading sheet PDF"` passed 1 test.

## 2026-06-09 (Loading Sheet Data Model)

- Added the pure `LoadingSheetModel` builder for `plans/2026-06-09-loading-sheet-pdf.md`, deriving legend rows, summary metrics, loading-task steps, new box ids, and cumulative box ids from `PackingResult`, `buildLoadingTaskGroups()`, and playback visibility without rerunning packing.
- Added intent-focused unit coverage for task-group alignment, cumulative step deltas, legend count conservation, result-sourced summary metrics, loaded length, and empty results.
- Verification: `npm test -- src/lib/loadingSheet.test.ts` passed 4 tests.

## 2026-06-09 (3D Clearance Annotation)

- Replaced the manual two-point ruler flow with selected-box clearance annotations from `plans/2026-06-09-clearance-annotation-3d.md`: the `m` shortcut and toolbar toggle now show deterministic AABB-based clearance for the current box, hide contact directions within the 1mm epsilon, and expose the active annotation directions/labels through scene test hooks.
- Added directional nearest-neighbor clearance selection in `src/lib/measurement.ts`, keeping wall clearance and neighbor clearance separate so each direction displays the smaller usable gap.
- Updated `ContainerScene` to render clearance lines, endpoint markers, and camera-facing canvas text labels for each visible clearance value; old ruler capture UI and 2D ruler props were removed from the manual workspace path.
- Verification: `npm test -- src/lib/measurement.test.ts src/lib/debugSnapshot.test.ts` passed 10 tests; targeted E2E `npx playwright test e2e/manual-3d.spec.ts --grep "余量标注|复核清单|旧测量|最大化保留"` passed 4 tests; `npm run lint` passed; `npm run build` passed with the existing Vite chunk-size warning.

## 2026-06-09 (Import Template System Irregular Excel Parsing)

- Implemented the first slice of `plans/2026-06-09-import-template-system.md`: import parsing now accepts raw worksheet matrices, honors `headerRow` / `startRow`, splits combined dimension columns, skips summary/empty rows with `skippedRows`, prefers carton-count aliases, and preserves full SKU labels instead of uppercasing/truncating them.
- Extended import-template persistence with `dimensionMode`, `combinedColumn`, and `dimensionOrder`, including SQLite migration 6 and backwards-compatible serialization defaults.
- Updated the import mapping UI and template manager to expose combined-dimension templates and to preview columns from the selected header row.
- Verification: `npm test -- src/lib/importCargo.test.ts src/lib/importTemplates.test.ts` passed 13 tests; `npm run build` passed with the existing Vite chunk-size warning.

## 2026-06-08 (Stack Fill Optimization Capacity Diagnostics)

- Implemented the `plans/2026-06-08-stack-fill-optimization.md` stack-fill optimization for automatic quantity/volume packing without changing stack-capacity legality semantics.
- Capacity-1 cargo now prefers valid high top-surface passenger slots before falling back to floor placement; quantity mode also preserves one stack-capacity slot on finite-capacity support chains when pending capacity-1 cargo needs a top passenger position.
- Expanded top-surface candidate generation from single box corners to same-height edge grids, with negative/out-of-container candidate filtering before scoring.
- Added the `stack-capacity-limit` diagnostic when unplaced cargo is no-space constrained mainly by non-stackable / capacity-1 items rather than weight or dimensions.
- Snapshot(12)-style fixture improved from the recorded 109/218 baseline to 118/218 in the current implementation. Real `cargo-debug-snapshot (12).json` replay measured 118/218 placed, cap=1 top passengers 22 (was 8), cap=1 locked floor boxes 28 (was 33), and 0 stack-chain violations. This is a clear improvement above 109 but below the earlier approximate 120 target, so the decision record documents the measured ceiling for this heuristic.
- Verification so far: `npx vitest run src/lib/packing.stackfill.test.ts src/lib/packing.test.ts src/lib/packing.31pallet.test.ts src/lib/manualPlacement.test.ts` passed 85 tests.

## 2026-06-07 (All-Direction Labels Layout Stack Sorting Layer Fade Measurement Panel)

- Implemented the follow-up stack-capacity refactor from `REVIEW.md`: added shared `stackCapacity()` / `violatesStackChain()` helpers, unified automatic and manual stack validation around support-chain capacity, and removed the old direct non-stackable support special-case from automatic packing.
- `stackable=false` now behaves as stack capacity 1 (may ride as a top passenger, cannot be pressed). Added data-layer `groundOnly` support for the separate "floor only" meaning without exposing a new UI control.
- Automatic quantity/volume ordering uses stack capacity first, and quantity mode reserves enough top height for pending capacity-1 cargo so low-capacity cargo is not starved by capacity-3 fill. Real `cargo-debug-snapshot (11).json` replay improved from the stored 102/268 to 182/268, with 14 K/L/M/N capacity-1 boxes placed, all top-only, and 0 support-chain violations.
- Preserved original vertical support metadata (`verticalLayer` / `verticalSupportedBy`) before depth-layer assignment rewrites `physicalLayer` / `supportedBy`, so capacity checks and tests can distinguish vertical stacking from loading-depth pushers.
- Implemented T1/T6(a): 3D box labels now use a fixed all-direction exposed-face set (`+X,-X,+Y,+Z,-Z`) instead of camera-facing face selection. Removed the OrbitControls `change` listener that previously recalculated and reassigned every box material on camera movement; `rg` found no remaining `refreshCameraFacingLabels` / `labelFacesForBoxCamera` references after the change.
- Implemented T2: face-label texture drawing now consumes `faceLabelLayout()` so name, badge, weight/dimensions, and icons occupy separate vertical bands instead of overlapping the badge letter.
- Implemented T3: quantity and volume automatic modes now sort expanded cargo by effective stack capacity first, so unlimited or higher-stack cargo is placed earlier and can form lower layers while existing stack-limit validation still prevents illegal support chains.
- Implemented T4: specific-layer view now fades non-current layers more strongly (`opacity` <= 0.1, edge opacity <= 0.05) while the all-layers view remains fully visible.
- Implemented T5: the empty measurement aside is no longer rendered when ruler mode is off and there are no measurement lines; opening the ruler or creating measurements still shows the list.
- Verification passed: `npm run lint`; `npm test` (43 files / 243 tests); `npm run build` with the existing Vite chunk-size warning; targeted E2E `npx playwright test e2e/container-calc.spec.ts -g "3D labels|free camera"` (2 passed); targeted E2E `npx playwright test e2e/manual-3d.spec.ts -g "尺规|测量|最大化|容量"` (8 passed); full local `npm run test:e2e` (85 passed / 1 skipped / 0 failed).
- Completed T6(b)(c)(d) performance closure: `src/Workbench.tsx` already memoizes `displayCargoItems`, `manualPool`, `manualIssues`, `manualInvalidBoxIds`, `manualPlacedBoxes`, and `manualCapacity`, so no extra manual-mode memoization was added. No RAF throttling was added because the observed camera-movement material refresh path was removed by T1, and no new remaining per-camera recompute path was identified.
- Snapshot-10 performance evidence: restoring `C:\Users\BA_H3C_Pad\Downloads\cargo-debug-snapshot (10).json` through history recalculated the current algorithm to 210 boxes (the original snapshot stored 167 placed boxes / 278 total cargo), so the run is treated as a current-code 210-box stress scene rather than an exact old/new FPS comparison. In headless Chromium, `data-label-faces-sample` stayed `+X,-X,+Y,+Z,-Z` before and after a near-top camera command, with 0 sampled label-face changes. rAF interval samples were high (`before avg 175.965ms / p95 183.4ms / max 200ms`, `after avg 92.219ms / p95 100.1ms / max 116.6ms`), so the supported conclusion is that camera movement no longer mutates label-face/material assignment, not that the scene meets a smooth-FPS target.
- Final local and remote closure passed after the performance documentation update: `npm run lint`; `npm test` (43 files / 243 tests); `npm run build` with the existing Vite chunk-size warning; full local `npm run test:e2e` (85 passed / 1 skipped / 0 failed). `npm run deploy` completed with remote backup `/root/cargo_project-backup-20260606-183254` and remote health check passed. Full remote E2E passed with `PLAYWRIGHT_BASE_URL=http://101.33.232.150/` and `PLAYWRIGHT_WORKERS=1`: 85 passed / 1 skipped / 0 failed.

## 2026-06-06 (Label Missing Project Controls Stack Limit Template Plan)

- R1 removed orientation text from 3D face-label textures while preserving orientation metadata for manual markers and details. Verification: `npx vitest run src/lib/faceLabelContent.test.ts` passed 3 tests; `npx tsc -b` passed.
- R2 stabilized iso free-camera near-top labels by locking near-axis camera directions to a single visible face while preserving two-face labels for oblique iso views. Verification: `npx vitest run src/lib/cameraFacingLabels.test.ts` passed 4 tests; `npx tsc -b` passed; targeted E2E `npx playwright test e2e/container-calc.spec.ts --grep "moves 3D labels|free camera rotates near top"` passed 2 tests.
- R3 enforced max stack layer limits across the full support chain in both automatic packing and manual validation, so unlimited cargo can no longer be stacked above a supporting cargo whose stack limit has been reached. Verification: `npx vitest run src/lib/packing.test.ts src/lib/manualPlacement.test.ts` passed 76 tests; `npx tsc -b` passed; targeted E2E `npx playwright test e2e/container-calc.spec.ts --grep "global max stack"` passed 1 test; targeted E2E `npx playwright test e2e/manual-3d.spec.ts --grep "最大堆叠|悬空"` passed 2 tests.
- R4 removed the header project name/new/save/upload controls while keeping auto-generated project names for history persistence. Verification: `npx tsc -b` passed; targeted E2E `npx playwright test e2e/container-calc.spec.ts --grep "loads the container calculator workspace"` passed 1 test.
- R5 added a top-level template-manager new-template form with free-text source columns and reuse through the Excel import modal. Verification: `npx tsc -b` passed; targeted E2E `npx playwright test e2e/container-calc.spec.ts --grep "creates an import template from top-level template manager"` passed 1 test.
- Notifications were updated with the R1-R5 shipped changes. Verification: `npx tsc -b` passed; targeted E2E `npx playwright test e2e/manual-3d.spec.ts --grep "通知栏按钮显示未读红点"` passed 1 test.
- E2E history-restore coverage was adjusted to stop depending on the removed header new-project button. Verification: targeted E2E `npx playwright test e2e/manual-3d.spec.ts --grep "从历史方案恢复自定义柜型"` passed 1 test.
- Full local verification passed before deployment: `npm run lint`, `npm test` (42 files / 241 tests), `npm run build`, and `npm run test:e2e` (84 passed / 1 skipped / 0 failed).
- Remote deployment completed with `npm run deploy`; remote backup: `/root/cargo_project-backup-20260606-161424`. Remote verification passed with `PLAYWRIGHT_BASE_URL=http://101.33.232.150/` and `PLAYWRIGHT_WORKERS=1`: `npm run test:e2e` (84 passed / 1 skipped / 0 failed).

## 2026-06-06 (Top Label and Management Review)

- S1 fixed orthographic 3D label faces: top/front/side views now use fixed visible faces while iso keeps camera-facing labels. Verification: `npx vitest run src/lib/cameraFacingLabels.test.ts` passed 3 tests; `npx tsc -b` passed; targeted E2E `npx playwright test e2e/container-calc.spec.ts --grep "moves 3D labels"` passed 1 test.
- S2 aligned manual quick-place direction with automatic packing scoring while keeping manual candidates and `validateDraft()` legality. Quick-place now tries rotatable orientations and scores manual extreme-point candidates with the shared `placementScore()`. Verification: `npx vitest run src/lib/quickPlace.test.ts` passed 4 tests; `npx tsc -b` passed; targeted E2E `npx playwright test e2e/manual-3d.spec.ts --grep "一键放置"` passed 1 test.
- S3 promoted cargo library and import template manager to top-level navigation and hamburger-menu entries, leaving history focused on saved plans only. Verification: `npx tsc -b` passed; targeted E2E `npx playwright test e2e/container-calc.spec.ts --grep "navigation|import templates"` passed 2 tests; `npx playwright test e2e/auth-isolation.spec.ts --grep "custom cargo"` passed 1 test. A parallel auth run first failed only because two Playwright web servers tried to bind port 5176.
- S4 removed the container-dimension badge from the visual workspace toolbar and updated browser coverage to assert the badge stays absent while manual canvas controls remain visible. Verification: `npx tsc -b` passed; targeted E2E `npx playwright test e2e/manual-3d.spec.ts --grep "尺寸|一键放置"` passed 2 tests.
- Local full verification for the completed review scope passed: `npm run lint`; `npm test` passed 42 files / 238 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` ran 83 tests with 82 passed / 1 skipped / 0 failed. During the first full E2E run, two obsolete assertions still expected the removed dimension badge text; they were updated to verify effective-dimension behavior and restored custom-container form state without reintroducing the badge.
- Remote deployment passed with `npm run deploy`; backup saved at `/root/cargo_project-backup-20260606-102105`; remote HTTP/API health check passed. Remote E2E passed: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npm run test:e2e` ran 83 tests with 82 passed / 1 skipped / 0 failed.

## 2026-06-06 (Round 23 Final Verification and Deploy)

- Completed full local verification and remote deployment for the Round 23 review scope.
  - Local verification passed: `npm run lint`; `npm test` passed 42 files / 236 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` ran 83 tests with 82 passed / 1 skipped / 0 failed.
  - Remote deployment passed with `npm run deploy`; backup saved at `/root/cargo_project-backup-20260606-020610`; remote HTTP/API health check passed.
  - Remote E2E passed: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npm run test:e2e` ran 83 tests with 82 passed / 1 skipped / 0 failed.
- Completion audit follow-up: added history-page import-template mapping/header/start editing and recorded Round 23 implementation tradeoffs in `decision.md`. Verification: `npx vitest run src/lib/importTemplates.test.ts` passed 2 tests; `npx tsc -b` passed; `npm run lint` passed; targeted E2E `npx playwright test e2e/container-calc.spec.ts --grep "renames and deletes import templates"` passed 1 test.
- Post-follow-up full verification and deployment passed: `npm run lint`; `npm test` passed 42 files / 236 tests; `npm run build` passed with the existing Vite chunk-size warning; local `npm run test:e2e` ran 83 tests with 82 passed / 1 skipped / 0 failed. Redeployed with `npm run deploy`; backup saved at `/root/cargo_project-backup-20260606-023421`; remote HTTP/API health check passed. Remote E2E passed: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npm run test:e2e` ran 83 tests with 82 passed / 1 skipped / 0 failed.

## 2026-06-06 (Round 23 T8 3D Ruler)

- Completed subtask: add 3D ruler measurement support.
  - Added `snapMeasurementPoint3D()` with deterministic snapping to box corners, box edge midpoints, container walls, and a free-point fallback outside the snap threshold.
  - `ContainerScene` now accepts the shared measurement state, captures 3D ruler clicks, snaps the measured points, renders fixed 3D measurement lines/markers, and exposes measurement state attributes for browser verification.
  - The existing measurement list remains shared between 2D and 3D, so 3D-created lines can be deleted from the same side panel.
- Verification: `npx vitest run src/lib/measureSnap.test.ts` passed 4 tests; `npx tsc -b` passed; targeted E2E `npx playwright test e2e/manual-3d.spec.ts --grep "尺规在 2D|尺规在 3D"` passed 2 tests.
- Follow-up lint fix: renamed the cargo-library insertion handler so React Hooks lint no longer treats it as a hook, and routed quick-place no-space notices through the existing notice factory. Verification: `npm run lint` passed; `npx vitest run src/lib/quickPlace.test.ts src/lib/customCargo.test.ts` passed 6 tests; `npx tsc -b` passed.

## 2026-06-06 (Round 23 T7 Manual Quick Place)

- Completed subtask: add one-click manual cargo placement from the pool.
  - Added `quickPlaceCargo()` as a pure manual-placement helper that builds candidate positions and validates them through the existing `validateDraft()` rules instead of duplicating collision/support logic.
  - Added one-click arrow buttons to manual pool rows with `pool-quick-place-{cargoId}` test IDs and a stable `data-remaining` attribute for browser verification.
  - Clicking the arrow adds the next valid cargo box, selects it in the 3D scene, and decrements the pool remaining count; quantity-limit and no-space failures surface as manual operation notices.
- Verification: `npx vitest run src/lib/quickPlace.test.ts` passed 3 tests; `npx tsc -b` passed; targeted E2E `npx playwright test e2e/manual-3d.spec.ts --grep "一键放置"` passed 1 test.

## 2026-06-06 (Round 23 T6 Import Template Management)

- Completed subtask: add history-page import template management.
  - Added `updateImportTemplate()` and `deleteImportTemplate()` API client wrappers for the existing backend routes.
  - Added a history-page `template-manager-list` panel for listing, renaming, and deleting saved import templates while keeping detailed field mapping edits in the existing import modal.
  - Kept the import modal template dropdown synchronized after rename/delete.
  - Added browser coverage for creating a template, renaming it in history, selecting the renamed template in the import modal, deleting it, and confirming the dropdown no longer lists it.
- Verification: `npx vitest run src/lib/importTemplates.test.ts` passed 2 tests; `npx tsc -b` passed; targeted E2E `npx playwright test e2e/container-calc.spec.ts --grep "renames and deletes import templates"` passed 1 test.

## 2026-06-06 (Round 23 T5 Cargo Library UI)

- Completed subtask: add the frontend cargo library API and history-page management panel.
  - Added `src/lib/customCargo.ts` with read/save/update/delete wrappers for `/api/custom-cargo`, preserving the library item as a one-piece cargo template instead of the current workbench quantity.
  - Added a history-page `cargo-library` panel for adding, editing, deleting, and inserting saved cargo into the current workbench.
  - Added Chinese and English labels/notices for cargo-library actions.
  - Added browser coverage proving user-scoped cargo persistence after reload, “加入当前工作台” insertion, and cross-user invisibility.
- Verification: `npx vitest run src/lib/customCargo.test.ts` passed 3 tests; `npx tsc -b` passed; targeted E2E `npx playwright test e2e/auth-isolation.spec.ts --grep "custom cargo library"` passed 1 test.

## 2026-06-06 (Round 23 T4 Custom Cargo Backend)

- Completed subtask: add a user-scoped custom cargo backend.
  - Added the `custom_cargo` SQLite table and idempotent migration 5.
  - Added `/api/custom-cargo` GET/POST/PUT/DELETE routes with authentication, `user_id` filtering, and ownership checks before update/delete.
  - Added `server/customCargo.mjs` to normalize cargo payloads and serialize rows into `CargoItem`-compatible objects with `quantity: 1`.
  - Added helper tests for payload normalization, invalid field rejection, and row serialization.
- Verification: `npx vitest run scripts/customCargo.test.mjs` passed 3 tests; `node --check server/customCargo.mjs; node --check server/db.mjs; node --check server/index.mjs` passed; `npx tsc -b` passed. Live API verification against local port 3010 registered two users, created/read/updated/deleted custom cargo as user 1, and confirmed user 2 could not see user 1's cargo (`user2HasCreated=0`).

## 2026-06-06 (Round 23 T3 3D Face Label Cargo Badges)

- Completed subtask: add richer 3D face-label content for cargo properties.
  - Added `faceLabelContent()` and `faceLabelContentSignature()` to derive badge text, full cargo name, rotate/stack icons, max layer text, orientation text, and weight/dimension text from a `PlacedBox`.
  - `ContainerScene` face textures now draw the cargo full name, weight/dimensions, rotatable/non-rotatable icon, stack/non-stack icon, and stack layer badge in full label mode; compact labels keep a reduced status icon.
  - 3D label material cache keys now include the full face-content signature so cargo with different rotation, stack, size, name, or weight metadata cannot reuse stale textures.
  - `container-scene` exposes `data-face-icons-sample` for browser verification of the first rendered 3D face badge.
- Verification: `npx vitest run src/lib/faceLabelContent.test.ts` passed 3 tests; `npx vitest run src/lib/faceLabelContent.test.ts src/lib/packing.test.ts src/lib/manualPlacement.test.ts` passed 77 tests; `npx tsc -b` passed; targeted E2E `npx playwright test e2e/container-calc.spec.ts --grep "moves 3D labels"` passed 1 test.

## 2026-06-06 (Round 23 T2 3D Rotation Gizmo Visibility)

- Completed subtask: keep the manual 3D rotation gizmo visible above cargo and the floor.
  - Rotation gizmo materials now render as overlay-style handles with `depthTest=false` and `depthWrite=false`.
  - Gizmo group and pickable arc/cone meshes now use a high render order so the four handles remain visible from low or bottom-adjacent camera angles.
  - `ContainerScene` now anchors the gizmo above the selected cargo top instead of the box center, preventing lower arcs from sitting on the floor.
- Verification: red tests first failed for missing render-order/depth behavior and missing anchor offset; after the fix, `npx vitest run src/lib/rotationGizmo.test.ts` passed 6 tests, `npx tsc -b` passed, and targeted E2E `npx playwright test e2e/manual-3d.spec.ts --grep "弧形手柄|选中前|R 与 Shift"` passed 3 tests after starting the local backend on port 3010. The first E2E attempt failed only because `/api/auth/login` proxied to a stopped backend (`ECONNREFUSED 127.0.0.1:3010`).

## 2026-06-06 (Round 23 T1 PlacedBox Rotation Metadata)

- Completed subtask: preserve `canRotate` on every `PlacedBox`.
  - Added `PlacedBox.canRotate` so 3D face-label badges can show rotatable/non-rotatable cargo without looking up the original cargo item.
  - `calculatePacking()` now copies `CargoItem.canRotate` into automatic placed boxes.
  - `toPlacedBoxes()` now copies manual box rotation eligibility, defaulting older/manual boxes to rotatable.
  - Updated existing `PlacedBox` test fixtures with explicit rotation metadata.
- Verification: red tests first failed for missing `canRotate` in automatic and manual placed boxes; after the fix, `npx vitest run src/lib/packing.test.ts -t "preserves each cargo rotation rule"` passed, `npx vitest run src/lib/manualPlacement.test.ts -t "preserves manual rotation eligibility"` passed, `npx vitest run src/lib/packing.test.ts src/lib/manualPlacement.test.ts` passed 74 tests, and `npx tsc -b` passed.

## 2026-06-05 (Manual 3D Rotation Gizmo)

- Completed subtask: implemented the second manual 3D rotation iteration from `REVIEW.md`.
  - Added `src/lib/rotationGizmo.ts` to build EasyCargo-style in-scene arc handles from Three.js tube arcs and cone arrowheads.
  - `ContainerScene` now mounts the selected-box gizmo inside the 3D scene, toggles it by double-click, raycasts gizmo pickables before box pickables, and highlights hovered handles.
  - Manual rotations now animate visually with a short quaternion slerp while the business placement state updates immediately.
  - Removed the superseded HTML `ManualRotateOverlay`, selected-box screen projection callback, and Workbench-side overlay wiring.
  - E2E now verifies manual rotation state through `container-scene` data attributes because scene-native 3D handles have no DOM nodes.
- Local verification: `npx tsc -b` passed; `npx vitest run src/lib/rotationGizmo.test.ts` passed 4 tests; targeted E2E `npx playwright test e2e/manual-3d.spec.ts --grep "弧形手柄|R 与 Shift|选中前"` passed 3 tests; `npm run lint` passed; `npm test` passed 36 files / 214 tests; `npm run build` passed with the existing Vite chunk-size warning; full local `npm run test:e2e` ran 79 tests with 78 passed / 1 skipped / 0 failed.
- Completed subtask: deployed and remotely verified the 3D rotation gizmo.
  - Deployment completed with `npm run deploy`; remote backup created at `/root/cargo_project-backup-20260605-060921`.
  - Remote health check passed during deploy.
  - Remote targeted E2E passed: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npx playwright test e2e/manual-3d.spec.ts --grep "弧形手柄|R 与 Shift|选中前"` passed 3 tests.
  - Remote full E2E passed: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npm run test:e2e` ran 79 tests with 78 passed / 1 skipped / 0 failed.

## 2026-06-05 (Manual 3D Rotation Overlay and Grounded Rotation)

- Completed subtask: recorded the manual 3D rotation/orientation interaction implementation plan in `REVIEW.md`.
  - Confirmed the current step scope is floating selected-box rotation controls, grounded rotation semantics, and removal of the old manual toolbar/precise side panel.
  - Kept ViewCube and the 3D orientation cube as follow-up work, not part of this slice.
- Completed subtask: fixed manual grounded rotation semantics in `src/lib/manualPlacement.ts`.
  - Grounded boxes now snap back to `z=0` after a height-changing rotation, while x/y still rotate around the footprint centre.
  - Stacked boxes retain the previous vertical centre compensation.
  - Added explicit world-axis left/right yaw and up/down pitch rotations, and extended dry-run validation to all four directions.
- Completed subtask: rebuilt the manual 3D selected-box interaction.
  - `ContainerScene` now projects the selected manual box to screen coordinates so React can anchor a floating overlay beside the box.
  - Added `ManualRotateOverlay` with four world-axis rotation buttons, delete, orientation readout, and an expandable XYZ/alignment fine-tune panel.
  - Removed the old manual toolbar and `ManualPrecisePanel`; keyboard shortcuts remain and are discoverable from the canvas help button.
  - Updated the notification bar release notes for the shipped manual rotation overlay.
- Local verification: `npx vitest run src/lib/manualPlacement.test.ts` passed 40 tests; `npx tsc -b` passed; targeted E2E `npx playwright test e2e/manual-3d.spec.ts --grep "R 与 Shift|浮层|键盘帮助|旋转提示|最大化保留|选中前不显示"` passed 6 tests; `npm run lint` passed; `npm test` passed 35 files / 210 tests; `npm run build` passed with the existing Vite chunk-size warning; full local `npm run test:e2e` ran 79 tests with 78 passed / 1 skipped / 0 failed.
- Completed subtask: deployed and remotely verified the manual 3D rotation overlay.
  - Deployment completed with `npm run deploy`; remote backup created at `/root/cargo_project-backup-20260605-034845`.
  - Remote health check passed during deploy.
  - Remote targeted E2E passed: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npx playwright test e2e/manual-3d.spec.ts --grep "R 与 Shift|浮层|键盘帮助|旋转提示|最大化保留|选中前不显示"` passed 6 tests.
  - Remote full E2E passed: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npm run test:e2e` ran 79 tests with 78 passed / 1 skipped / 0 failed.

## 2026-06-04 (Round 32 Top-Layer Visual Offset, Label Facing, Global Stack Limit)

- Completed subtask: recorded the Round 32 review and implementation plan in `REVIEW.md`.
  - Confirmed snapshot 8 had no real box overlaps; the top-layer U/P “penetration” was visual offset from tilted `LHW` top-fill boxes plus co-planar wireframe ambiguity.
  - Confirmed the user’s stack-limit value was not reaching manually added cargo because import-template defaults and cargo form values were separate paths.
  - Chose the global default max stack layer rule as the root fix for top tilted fill, while preserving cargo-level overrides.
- Completed subtask: implemented global default max stack layers.
  - Added `PlacementSettings.defaultMaxStackLayers` with user/browser persistence.
  - `calculatePacking()` now accepts `defaultMaxStackLayers` and applies it only when a cargo item lacks its own `maxStackLayers`.
  - Workbench loading rules now expose a global max stack layer input; cargo cards show whether the current limit comes from the cargo itself, the global fallback, or unlimited behavior.
  - Export rows, debug snapshots, project save/upload, history save/restore, and container comparison now carry the same global rule.
- Completed subtask: made 3D labels camera-facing and consistent.
  - Added `cameraFacingLabelFaces()` to choose the local box faces that face the current camera.
  - `ContainerScene` now assigns full-size label textures only to those facing faces and uses plain color materials on the other faces.
  - OrbitControls camera changes refresh face/material assignment, so rotating the 3D scene moves the label to the newly visible face.
  - 2D label deconfliction remains unchanged; the compact downgrade is no longer used by 3D labels.
- Verification: `npx vitest run src/lib/packing.test.ts src/lib/cameraFacingLabels.test.ts src/lib/placementSettings.test.ts src/lib/exportPlan.test.ts src/lib/historyPlans.test.ts src/lib/debugSnapshot.test.ts` passed 45 tests; `npx tsc -b` passed; `npm run lint` passed; `npm test` passed 35 files / 206 tests; `npm run build` passed with the existing Vite chunk-size warning; targeted E2E `npx playwright test e2e/container-calc.spec.ts --grep "global max stack"` passed 1 test; targeted E2E `npx playwright test e2e/container-calc.spec.ts --grep "moves 3D labels"` passed 1 test. Full local `npm run test:e2e` ran 78 tests with 76 passed / 1 skipped / 1 failed. The remaining failure is the known manual rotation expectation mismatch `WHL` expected vs `WLH` actual in `e2e/manual-3d.spec.ts:170`, unrelated to this automatic packing/global stack/3D label-facing round and already recorded in `decision.md`.
- Completed subtask: deployed and remotely verified Round 32 on the public host.
  - Deployment completed with `npm run deploy`; remote backup created at `/root/cargo_project-backup-20260605-014446`.
  - Remote health check passed during deploy.
  - Remote targeted E2E passed: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npx playwright test e2e/container-calc.spec.ts --grep "global max stack|moves 3D labels"` passed 2 tests.
  - Remote full E2E result: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npm run test:e2e` ran 78 tests with 76 passed / 1 skipped / 1 failed. The only failure is the same known manual rotation expectation mismatch `WHL` expected vs `WLH` actual in `e2e/manual-3d.spec.ts:170`.

## 2026-06-04 (Round 31 Workspace Density and Stacking Parameters Review)

- Completed subtask: recorded the Round 31 review and implementation plan in `REVIEW.md`.
  - Classified the new feedback into workspace-density fixes, visual label/projection ambiguity, snap behavior, and a real data-model gap for max stack layers.
  - Confirmed `cargo-debug-snapshot (5).json` does not show geometric A/Q overlap: 28 A/Q boxes were checked and cross-label 3D overlap count was 0, so the next fix should target label/projection clarity before changing packing collision logic.
  - Planned P0 work for hiding the stat grid in maximized mode, removing the manual capacity card from the main manual workspace, compacting the container dimension badge, and preserving boundary/edge snap against later grid snapping.
  - Planned P1 work for cargo-level `maxStackLayers`, including automatic packing, manual validation, import/export, history, and debug snapshots.
- Completed subtask: appended the snapshot 6 rotation-visibility finding to the Round 31 review.
  - Confirmed `cargo-debug-snapshot (6).json` still contains the T boxes in `manual.draft` and `manual.placedBoxes`; the issue is not data deletion, validation rejection, or 3D overlap.
  - Identified the risky state `orientationAxes={ x:'L-', y:'H-', z:'W+' }` with `orientationKey=LHW`, `yawQuarterTurn=2`, and `pitchQuarterTurn=1`.
  - Root cause candidate: `ContainerScene.boxOrientationQuaternion()` feeds a determinant `-1` basis matrix into `THREE.Quaternion().setFromRotationMatrix()`, producing a non-unit quaternion for a reflection matrix; the next fix should normalize rendering orientation to a legal right-handed basis instead of changing packing geometry.
  - Reprioritized the plan so 3D top-cargo rotation visibility is a P0 phase before broader label-overlap polish.
- Verification: documentation-only change; code verification not rerun.
- Completed subtask: implemented the first Round 31 P0/P1 slice for workspace density, boundary snapping, and max stack layers.
  - Maximized automatic/manual workspaces now hide `archive-stat-grid`; exiting maximize restores the statistics strip.
  - Manual placement no longer renders the `remaining-capacity` card in the main canvas path, while the existing `manualCapacity` debug snapshot payload is preserved.
  - `applyManualPlacementSnap()` now keeps axes already snapped to walls or neighboring edges from being overwritten by grid snapping; 3D pool drop reuses the shared snap function for the final drop point.
  - Added optional `maxStackLayers` to `CargoItem`, `PlacedBox`, manual boxes, import template defaults, import mapping, export rows, and server-side template payload cleaning.
  - Automatic packing rejects candidates above the current cargo's max stack layer limit; manual validation emits blocking `max-stack-layers` issues.
  - Updated the in-app notification bar with the Round 31 fix summary.
  - Recorded the business decision in `decision.md`: first version counts max stack layers by vertical support-chain depth, with missing values preserving legacy unlimited behavior.
- Remaining Round 31 plan items not closed by this slice: snapshot 5 label/projection deconfliction and snapshot 6 3D rotation-visibility normalization remain planned separately.
- Verification so far: focused red/green tests now pass with `npx vitest run src/lib/manualPlacementSnap.test.ts src/lib/packing.test.ts src/lib/manualPlacement.test.ts src/lib/importCargo.test.ts src/lib/exportPlan.test.ts`; `npx tsc -b` passes; `node --check server/index.mjs` passes; `npm run lint` passes; `npm test` passes 32 files / 195 tests; `npm run build` passes with the existing Vite chunk-size warning. Local targeted E2E `npx playwright test e2e/manual-3d.spec.ts e2e/container-calc.spec.ts --grep "最大堆叠|容量占用|最大化|Excel import/export"` passed 5 tests. Full local `npm run test:e2e` ran 75 tests: 73 passed / 1 skipped / 1 failed. The failed test is the pre-existing manual rotation expectation mismatch `WHL` expected vs `WLH` actual in `e2e/manual-3d.spec.ts:170`, not the new Round 31 workspace/snap/stack coverage.
- Completed subtask: deployed and verified this Round 31 slice on the public host.
  - Deployment completed with `npm run deploy`; remote backup created at `/root/cargo_project-backup-20260604-065754`.
  - Remote health check passed during deploy.
  - Remote targeted E2E passed: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npx playwright test e2e/manual-3d.spec.ts e2e/container-calc.spec.ts --grep "最大堆叠|容量占用|最大化|Excel import/export"` passed 5 tests.
  - Remote full E2E result: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npm run test:e2e` ran 75 tests with 72 passed / 1 skipped / 2 failed. One failure is the same known manual rotation mismatch `WHL` expected vs `WLH` actual; the other was a one-off `page.goto('/')` timeout before `shows failure reason in the detail table for unplaced cargo`. The timeout test passed when rerun targeted against the same remote host.
- Completed subtask: closed the remaining Round 31 snapshot 5/6 display fixes.
  - Added `orientationRenderingBasisVectors()` so 3D rendering normalizes determinant `-1` snapshot axes such as `{ x:'L-', y:'H-', z:'W+' }` into a legal right-handed basis before `THREE.Quaternion().setFromRotationMatrix()`.
  - Added shared label deconfliction with `buildBoxLabelModes()`: all-layer/all-label views downgrade boxes covered by higher-priority stacked projections to compact labels, while selected, highlighted, layer-filtered, and label-filtered boxes keep full labels.
  - Wired the same label mode into `ContainerPlan2D` and `ContainerScene` so snapshot 5-style same-XY stacked labels are clarified in 2D and 3D without changing packing geometry or collision checks.
  - Updated the in-app notification bar with the snapshot 5 label clarity and snapshot 6 rotation-basis fixes.
- Verification update: `npx vitest run src/lib/orientationTransform.test.ts src/lib/labelDeconfliction.test.ts src/components/ContainerPlan2D.test.tsx` passed 10 tests; `npx tsc -b` passed; targeted E2E `npx playwright test e2e/container-calc.spec.ts e2e/manual-3d.spec.ts --grep "covered all-layer|最大堆叠|容量占用|最大化|Excel import/export|3D 场景重建"` passed 7 tests. Full local verification after the display fixes: `npm run lint` passed with no warnings; `npm test` passed 34 files / 200 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` ran 76 tests with 74 passed / 1 skipped / 1 failed. The remaining failure is the same pre-existing manual rotation expectation mismatch `WHL` expected vs `WLH` actual in `e2e/manual-3d.spec.ts:170`.
- Completed subtask: deployed and remotely verified the final Round 31 display-fix state.
  - Deployment completed with `npm run deploy`; remote backup created at `/root/cargo_project-backup-20260604-074127`.
  - Remote health check passed during deploy.
  - Remote targeted E2E passed: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npx playwright test e2e/container-calc.spec.ts e2e/manual-3d.spec.ts --grep "covered all-layer|最大堆叠|容量占用|最大化|Excel import/export|3D 场景重建"` passed 7 tests.
  - Remote full E2E result: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npm run test:e2e` ran 76 tests with 74 passed / 1 skipped / 1 failed. The only failure is the same known manual rotation expectation mismatch `WHL` expected vs `WLH` actual in `e2e/manual-3d.spec.ts:170`.

## 2026-06-02 (Round 30 Stage-Merged Loading Steps Review)

- Completed subtask: discussed and recorded the Round 30 review plan for an EasyCargo-like loading steps view.
  - Product wording is "装柜步骤图" / "Loading Steps", not a project task decomposition chart.
  - First implementation should use stage merging, not one step per box, because real plans can contain hundreds of boxes.
  - The planned data source remains `PackingResult.workSteps` and `PlacedBox.workStep/physicalLayer/supportedBy`, so the new view stays aligned with the depth-first loading order fixed in Round 29.
- Completed subtask: recorded the business decision in `decision.md`.
  - Stage groups must preserve every box and step range, while splitting across physical layer changes, obvious depth boundaries, or meaningful support-state changes.
- Completed subtask: implemented the first stage-merged loading steps view.
  - Added `src/lib/loadingTaskGroups.ts` to build `LoadingTaskGroup[]` from `PackingResult.workSteps` without recalculating packing order.
  - Added `src/components/LoadingStepsPanel.tsx` and a result tab named `装柜步骤` / `Stage Plan`.
  - Added grouped-stage highlighting in the existing 2D and 3D views via `highlightBoxIds`.
  - Added Playwright coverage for opening the loading steps tab, switching stages, seeing label statistics, and proving the first stage is a merged group rather than a single box.
- Verification: `npx vitest run src/lib/loadingTaskGroups.test.ts` passed 5 tests; `npx vitest run src/lib/loadingTaskGroups.test.ts src/lib/playback.test.ts` passed 10 tests; `npx tsc -b` passed; `npm run lint` passed; `npm test` passed 32 files / 190 tests; `npm run build` passed with the existing Vite chunk-size warning. Targeted E2E first failed because backend port 3010 was not running, then passed after starting `PORT=3010 npm run start:server`: `npx playwright test e2e/manual-3d.spec.ts --grep "装柜步骤|作业回放面板"` passed 3 tests. Full local `npm run test:e2e` passed 72 tests / 1 skipped and retained the pre-existing manual rotation failure `WHL` expected vs `WLH` actual, which is still unrelated to this automatic loading-steps round and remains recorded in `decision.md`.
- Completed subtask: deployed and verified Round 30 on the public host.
  - Deployment completed with `npm run deploy`; remote backup created at `/root/cargo_project-backup-20260602-035202`.
  - Remote health check passed during deploy.
  - Remote targeted E2E passed: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npx playwright test e2e/manual-3d.spec.ts --grep "装柜步骤|作业回放面板"` passed 3 tests.
  - Remote full E2E result: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npm run test:e2e` passed 72 tests / 1 skipped and retained the same pre-existing manual rotation failure `WHL` expected vs `WLH` actual.

## 2026-05-30 (Round 29 Depth-First Loading Order Review)

- Completed subtask: confirmed the user-provided `cargo-debug-snapshot (4).json` exposes a loading-order issue, not a geometry-overlap issue.
  - Inner depth layer `x=0..400` had `workStep` spread across `1..171`.
  - Top-fill boxes at `x=0,z=1800` were sequenced after the first outer-depth box at `x=400,workStep=13`.
- Completed subtask: recorded the review, root cause, and next plan in `REVIEW.md`.
  - Root cause: `workStep` was assigned during greedy insertion before `assignDepthLayers()` finalized the depth-first layer semantics.
- Completed subtask: added a regression unit test for the 20GP, `400x500x600`, rotatable multi-batch snapshot scenario.
  - The new test failed before the fix with `expected 171 to be less than 13`.
- Completed subtask: reassigned `workStep` after depth-layer mapping using final coordinates ordered by `x`, then `y`, then `z`.
- Verification: `npm test -- src/lib/packing.test.ts` passed 29 tests; `npm test` passed 31 files / 185 tests; `npm run lint` passed; `npm run build` passed with the existing Vite chunk-size warning; targeted E2E `npx playwright test e2e/manual-3d.spec.ts --grep "作业回放面板按 workSteps"` passed. Full `npm run test:e2e` first failed because backend port 3010 was not running; after starting `npm run start:server` on port 3010 it passed 71 tests / 1 skipped and retained the pre-existing manual `Shift+R` orientation expectation failure recorded in `decision.md`.

## 2026-05-29 (Round 28 True 3D Rotation Label Review)

- Completed subtask: recorded the Round 28 review and refactor plan in `REVIEW.md`.
  - Root cause: previous fixes still treated label direction as per-face 2D texture rotation while the 3D cargo mesh stayed axis-aligned.
  - Target: move orientation math into one tested module, build 3D cargo from original dimensions, apply the real signed-axis rotation to mesh/edges, and make 2D projections consume the same face-rotation helper.
- Completed subtask: implemented the true 3D rotation model.
  - Added `src/lib/orientationTransform.ts` with tested signed-axis helpers for canonical axes fallback, original-dimension recovery, basis vectors, and projection label rotation.
  - Updated manual and automatic 2D projections to consume the shared face-rotation helper.
  - Updated `ContainerScene` to build cargo meshes from original L/W/H dimensions and rotate mesh/edges with the signed-axis quaternion; 3D label textures are now upright stickers carried by the physical mesh rotation.
  - Removed the old per-face manual label rotation helper so new consumers must use the shared orientation transform module.
  - Recorded the model decision in `decision.md` and updated the notification bar release notes.
- Verification: `npm run lint` passed; `npm test` passed 31 files / 182 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 72 tests / 1 skipped / 0 failed.
- Completed subtask: deployed and verified Round 28 on the public host.
  - Deployment completed with `npm run deploy`; remote backup created at `/root/cargo_project-backup-20260529-065215`.
  - Remote health check passed during deploy.
  - Remote targeted E2E passed: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npx playwright test e2e/manual-3d.spec.ts e2e/container-calc.spec.ts --grep "R 与 Shift|rotates 2D labels|通知栏"` passed 3 tests.
  - Remote full E2E passed: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npm run test:e2e` passed 72 tests / 1 skipped / 0 failed.

## 2026-05-29 (Round 27 Physical Face Label Rotation Review)

- Completed subtask: recorded the new review and root-cause analysis in `REVIEW.md`.
  - Root cause: Round 26 treated `labelRotationDeg` as a whole-box label angle, so 3D reused one rotated texture on every face.
  - Root cause: yaw and pitch were summed into one angle, which made `Shift+R` incorrectly change top-view labels and made `R` incorrectly affect vertical faces.
- Completed subtask: implemented physical face-level label rotation.
  - Treat `labelRotationDeg` as the top/bottom horizontal-face yaw angle.
  - Add face-level label rotation for 2D projections and 3D faces: top uses yaw, side uses pitch, front stays upright.
  - Keep signed X/Y/Z orientation labels as the pose identifier while the label graphic rotates only on the physically affected face.
- Verification: red test first failed in `src/lib/manualPlacement.test.ts` and `src/components/ManualPlacement2D.test.tsx`; after the fix, targeted tests passed 37 tests. `npx tsc -b` passed; targeted E2E `npx playwright test e2e/manual-3d.spec.ts --grep "R 与 Shift"` passed; `npm run lint` passed; `npm test` passed 30 files / 177 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 72 tests / 1 skipped / 0 failed.
- Completed subtask: deployed and verified Round 27 on the public host.
  - Deployment completed with `npm run deploy`; remote backup created at `/root/cargo_project-backup-20260529-011931`.
  - Remote health check passed during deploy.
  - Remote targeted E2E passed: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npx playwright test e2e/manual-3d.spec.ts --grep "R 与 Shift"` passed.
  - Remote full E2E passed: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npm run test:e2e` passed 72 tests / 1 skipped / 0 failed.

## 2026-05-28 (Round 26 Label Direction and Snap Settings Review)

- Completed subtask: recorded the new review and root-cause analysis in `REVIEW.md`.
  - Root cause: Round 25 kept `labelRotationDeg` at 0 for readability, so asymmetric labels such as `A` did not visually point up/left/down/right as the user expects.
  - Root cause: `placement-settings-panel` mixed support/overhang placement rules with grid/edge/Z/surface snap interaction rules, and there was no global snap switch.
- Completed subtask: implemented the review fixes.
  - Make `R` and `Shift+R` rotate the label body through `0 -> 270 -> 180 -> 90 -> 0` while keeping the X/Y/Z orientation text readable.
  - Split the workspace menu into independent `placement-settings-panel` and `snap-settings-panel`.
  - Add persisted `snapEnabled`; when off, 2D and 3D skip grid, edge, Z, and surface snapping.
- Verification: `npm run lint` passed; `npm test` passed 30 files / 176 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 72 tests / 1 skipped / 0 failed.
- Completed subtask: deployed and verified Round 26 on the public host.
  - Deployment completed with `npm run deploy`; remote backup created at `/root/cargo_project-backup-20260528-085715`.
  - Remote health check passed during deploy.
  - Remote targeted E2E passed: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npx playwright test e2e/manual-3d.spec.ts --grep "R 与 Shift|网格吸附|边缘吸附|排布设置和吸附设置"` passed 4 tests.
  - Remote full E2E first hit the local command timeout at 6 minutes without assertion output; rerun with a longer timeout passed 72 tests / 1 skipped / 0 failed.

## 2026-05-28 (Round 25 Rotation, Labels, Notification Bar, Canvas Button)

- Completed subtask: recorded the new review and fix plan in `REVIEW.md`.
  - Root cause: manual rotation only tracked unsigned `orientationKey`, so repeated `R`/`Shift+R` could not express the signed pose the user expects.
  - Root cause: the UI still communicated orientation with weak H/I-style angle text or bare `LWH` keys, so a single label did not explain the current rotated pose.
  - Root cause: `maximize-workspace` was placed on the visual workspace shell, not the actual canvas/SVG region, so it could overlap toolbar text.
- Completed subtask: rebuilt manual rotation around signed axis mappings.
  - `ManualPlacedBox` and `PlacedBox` now carry `orientationAxes` plus labels such as `X:W+ Y:L- Z:T+`.
  - `R` rotates around the vertical world axis in a four-step cycle and preserves the current top/bottom axis; `Shift+R` rotates downward in a four-step cycle.
  - Removed label text rotation as the signal for pose recognition; readable X/Y/Z mappings identify the current pose without using H/I.
- Completed subtask: moved UI controls and renamed release notes.
  - “新特性” is now “通知栏” / `Notifications`, and the latest release note documents this round’s changes.
  - `maximize-workspace` now renders inside `manual-view-container` or `auto-view-container`, covering manual 2D/3D and automatic 2D/3D without sitting on the outer workspace shell.
  - Manual 2D now receives the shared placement settings prop, keeping snap behavior wired consistently with the 3D path.
- Verification: `npx vitest run src/lib/manualPlacement.test.ts src/lib/debugSnapshot.test.ts src/components/ManualPlacement2D.test.tsx` passed; `npx tsc -b` passed; targeted E2E `npx playwright test e2e/manual-3d.spec.ts --grep "R 与 Shift|最大化|通知栏"` passed 4 tests; `npm run lint` passed; `npm test` passed 30 files / 174 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 72 tests / 1 skipped / 0 failed.
- Completed subtask: deployed and verified Round 25 on the public host.
  - Deployment completed with `npm run deploy`; remote backup created at `/root/cargo_project-backup-20260528-072121`.
  - Remote health check passed during deploy.
  - Remote targeted E2E passed: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npx playwright test e2e/manual-3d.spec.ts --grep "R 与 Shift|最大化|通知栏"` passed 4 tests.
  - Remote full E2E passed: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npm run test:e2e` passed 72 tests / 1 skipped / 0 failed.

## 2026-05-28 (Round 24 View Consistency Review Fixes)

- Completed subtask: recorded the new review and root-cause analysis in `REVIEW.md`.
  - Documented the downloaded D-box debug snapshot coordinates and why the saved snapshot itself was valid.
  - Root cause: 3D plane dragging recalculated `z=0` visually, but pointer-up only submitted X/Y, so `manualSetBoxPosition` preserved the old stacked `z=600` and `validateDraft` reported floating.
  - Decomposed this round into view-consistent snapping, canvas-right maximize, global snap settings, local verification, deploy, and remote E2E.
- Completed subtask: fixed manual placement consistency across 3D and editable 2D top view.
  - Added `manualMoveCommitArgs()` so 3D plane moves submit X/Y/Z together; moving a stacked D box back to floor now commits `z=0` instead of retaining the old stacked height.
  - Added a regression test using the user snapshot's key D coordinates: stale X/Y-only movement reproduces floating, while committing `z=0` clears the issue.
  - Added shared `applyManualPlacementSnap()` and wired `ManualPlacement2D` to use the same edge-then-grid snap settings as 3D for top-view moves and pool drops.
- Completed subtask: moved snapping controls and maximize to the requested UI locations.
  - `toggle-grid-snap` and `toggle-edge-snap` now live inside the left-top global placement settings panel, not the visual toolbar.
  - `maximize-workspace` moved from the toolbar to the top-right of `visual-workspace-canvas`, so automatic 2D/3D and manual 2D/3D expose it in the same canvas position.
  - Target verification passed: `npx vitest run src/lib/manualMoveCommit.test.ts src/lib/manualPlacementSnap.test.ts src/components/ManualPlacement2D.test.tsx`; `npx tsc -b`; targeted Playwright grep for snap settings and maximize.
  - Local verification: `npm run lint` passed; `npm test` passed 30 files / 174 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 72 tests / 1 skipped / 0 failed.
- Completed subtask: deployed and verified the Round 24 fixes on the public host.
  - Deployment completed with `npm run deploy`; remote backup created at `/root/cargo_project-backup-20260528-040816`.
  - Remote health check passed during deploy.
  - Remote verification: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npm run test:e2e` passed 72 tests / 1 skipped / 0 failed.

## 2026-05-28 (Round 23 Review Fixes)

- Completed subtask: implemented the new review fixes for manual-placement debug replay, global placement settings, and shared workspace maximize.
  - Added `src/lib/debugSnapshot.ts` with a structured `CargoDebugSnapshot` plus `restoreManualDebugScenario()` so downloaded debug data can recreate manual placement scenes in source-side tests.
  - Expanded DebugPanel from shallow counters to a downloadable/copyable snapshot containing cargo, selected/effective container, placement settings, automatic result state, manual draft/pool/issues/notice/capacity, measurements, UI flags, and recent errors.
  - Moved placement settings out of the visual placement toolbar into the top-left workspace menu, while keeping existing user-level persistence.
  - Replaced manual-only maximize with shared `workspaceMaximized` and a common `maximize-workspace` control available in both automatic and manual workspaces.
  - Added regression coverage for debug snapshot recovery, debug download, global settings entry, automatic maximize, and manual maximize state attributes.
  - Verification: `npm run lint` passed; `npm test` passed 28 files / 168 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 72 tests / 1 skipped / 0 failed.

## 2026-05-27 (Round 22 Re-review Implementation)

- Completed subtask: implemented the “第二十二轮重审 Review 与下一阶段重构计划（2026-05-27）” core refactor.
  - Manual placement failures now create `ManualOperationNotice` feedback for move/drop/rotate rejection paths instead of silently returning.
  - `R` and `Shift+R` are split into right-90 and down-90 rotation functions with unit coverage for all six orientations.
  - 2D/3D labels now expose explicit orientation markers/diagrams, so rotated and stood-up boxes are distinguishable without relying on text rotation alone.
  - Ruler mode now creates fixed 2D measurement annotations and a measurement list; the old clearance popup is removed from the primary ruler interaction.
  - Import templates now include visible template management, header row, start row, default values, mapping, and unit metadata; server schema/API were expanded.
  - CoG gravity field and Packing/CoG/Mixed modes were removed; CoG overlay is gated to the active Balance tab and uses a safer box opacity floor.
  - Added Review checklist tab and export actions for measurements, CoG risk, manual issues, unplaced cargo, and diagnostics.
  - Local verification: `npm run lint` passed; `npm test` passed 26 files / 159 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 69 tests / 1 skipped / 0 failed.
- Completed subtask: deployed the Round 22 re-review implementation and verified it on the public host.
  - Fixed the deploy script's Windows SSH quoting bug by switching SSH/SCP calls to argument-array invocations and by uploading concrete `dist/` entries instead of relying on shell glob expansion.
  - Extended deployment to sync `server/*.mjs` and `package*.json` into `/opt/cargo-server`, restart `cargo-server.service`, and verify `/api/import-templates` returns the expected unauthenticated 401 instead of leaving the public API on an older backend.
  - Deployment completed against `cargo-server`; remote backup created at `/root/cargo_project-backup-20260527-043152`.
  - Public verification: `http://101.33.232.150/` returned HTTP 200 with title `container-calc`; `/api/import-templates` returned HTTP 401 with `Authentication token missing`.
  - Remote verification: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ PLAYWRIGHT_WORKERS=1 npm run test:e2e` passed 69 tests / 1 skipped / 0 failed.

## 2026-05-27 (Round 22 Re-review Plan)

- Completed subtask: re-reviewed the second-twenty-second-round implementation and recorded a replacement refactor plan.
  - Added `REVIEW.md` section “第二十二轮重审 Review 与下一阶段重构计划（2026-05-27）” with code-level issue locations for manual drag/drop feedback, ruler measurement, orientation labels, rotation shortcuts, Excel templates, and CoG/gravity-field behavior.
  - Updated `decision.md` to lock the product decisions: explicit manual-operation feedback, fixed measurement lines instead of a popup ruler, `R` = right 90 degrees / `Shift+R` = downward 90 degrees, visible orientation markers on labels, full template-management entry, gravity-field and CoG view-mode removal, and a new review-checklist feature direction.
  - This is planning/review work only; no runtime feature code was changed in this entry.

## 2026-05-26 (Twenty-second Review Completion)

- Completed subtask: PM/design review and layer-view naming cleanup.
  - Added `docs/pm-design-review-2026-05-26.md`, defining the round 22 product boundaries for measurement, six-orientation manual rotation, Excel import templates, layer-view naming, and CoG/gravity-field display modes.
  - Renamed the UI result tab from "Layer-by-layer placement / 逐层添加货物" to "Layer view / 分层查看" to avoid implying a layer-based editing workflow.
  - Updated E2E coverage to assert the Chinese UI shows "分层查看" and no longer shows "逐层添加货物".
- Completed subtask: manual six-orientation rotation model.
  - `ManualPlacedBox` now keeps original cargo dimensions plus weight/rotation/stackability metadata, so manual boxes can be remapped to all six `LWH/WLH/LHW/HLW/WHL/HWL` orientations instead of only swapping length/width.
  - Added `setManualBoxOrientation`, `cycleBoxOrientation`, `dryRunOrientation`, and orientation/label-rotation helpers; validation now rejects rotation-disabled cargo and stacking on non-stackable support cargo.
  - Manual precise panel exposes a six-orientation picker; `R` remains horizontal rotation while `Shift+R` cycles all orientations through `ContainerScene`.
  - Hover tooltip and 2D manual SVG expose orientation metadata for E2E/visual verification.
  - Verification: `npx vitest run src/lib/manualPlacement.test.ts src/components/ManualPlacement2D.test.tsx` passed; `npx tsc -b` passed.
- Completed subtask: selected-box ruler/clearance measurements.
  - Added `src/lib/measurement.ts` with model-space clearance, point-distance, and locale-aware formatting helpers.
  - Workbench adds a `Ruler / 尺规` toggle; when enabled and a box is selected, a non-mutating overlay shows front/door/left/right/floor/top clearance plus nearest neighbor gaps.
  - The measurement overlay works for auto placement and manual placement because it consumes the rendered `PlacedBox` set, not DOM pixels.
  - Verification: `npx vitest run src/lib/measurement.test.ts` passed; `npx tsc -b` passed.
- Completed subtask: CoG/gravity-field view strategy.
  - Added `src/lib/cogView.ts` with `deriveCogViewState()` for `packing | cog | mixed` modes.
  - Balance panel now exposes Packing / CoG / Mixed 3D view modes; switching to CoG or Mixed automatically enables the overlay.
  - Packing view keeps the 3D scene clean; CoG view reduces box opacity so the gravity field and safety range are visible; Mixed view exposes a box-opacity slider.
  - `ContainerScene` now exposes `data-cog-view-mode` and `data-box-opacity`, and applies the mode-specific box opacity without recalculating packing.
  - Verification: `npx vitest run src/lib/cogView.test.ts` passed; `npx tsc -b` passed.
- Completed subtask: deterministic Excel import templates.
  - Added `import_templates` SQLite table and authenticated user-scoped CRUD routes under `/api/import-templates`.
  - Added `parseCargoRowsWithTemplate()` so saved mappings and explicit `mm/cm/auto` unit choices are applied in testable import logic rather than Workbench string rewriting.
  - Added frontend template API helper and mapping-modal controls to select an existing template or save the current mapping as a named template.
  - Templates are scoped by authenticated user and store only deterministic mapping/unit configuration.
  - Verification: `npx vitest run src/lib/importCargo.test.ts` passed; `npx tsc -b` passed; `node --check server/index.mjs && node --check server/db.mjs` passed.
- Completed subtask: release note and final local verification.
  - Added in-app release note `2026-05-26-r22` for ruler measurements, six-way manual rotation, import templates, layer-view naming, and CoG display modes.
  - Updated E2E coverage to assert the renamed `Layer view` tab after the product wording change.
  - Opening the Balance 3D overlay or gravity field now moves the scene from Packing view to CoG view, so explicit CoG actions remain visible while the default packing scene stays clean.
  - Verification: targeted Playwright reruns for the previously failing layer-view and CoG overlay tests passed.
  - Final local verification: `npm run lint` passed; `npm test` passed 154 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 65 tests / 1 skipped / 0 failed.
- Completed subtask: deploy and remote verification.
  - Deployed the local `dist/` build with `DEPLOY_SKIP_BUILD=1 npm run deploy`.
  - Remote backup created at `/root/cargo_project-backup-20260526-150421`; remote HTTP health check passed.
  - Remote verification: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ npm run test:e2e` passed 65 tests / 1 skipped / 0 failed.

## 2026-05-25 (Twentieth + Twenty-first Review Completion)

- Completed subtask: ship the truck-silhouette rework, gravity-field overlay, and remove leftover test accounts from the remote DB.
  - **Truck geometry descriptor (Phase A)**: new `buildTruckGeometry()` in `src/lib/cogVisual.ts` returns a structured descriptor — trapezoidal cab (frontWidth < backWidth, frontHeight < backHeight), slanted windshield, 4-bar grille, roof deflector, trailer deck, chassis beam, kingpin marker, two axles each with dual-wheel groups. 4 new unit tests cover the cab proportions, windshield slant, axle layout, and the container-only profile opt-out. Legacy `buildTruckSilhouette` is retained for backwards compatibility.
  - **Gravity field model (Phase C)**: new `buildGravityField()` returns up to 80 sample points (default 10×4 grid, auto-shrunk to honour `GRAVITY_FIELD_MAX_POINTS`), each carrying a normalised `severity` ∈ [0, 1] = `distanceToCoG / farthestCornerDistance`. `CogOverlay` carries `gravityField: GravityFieldPoint[] | null` and `truckGeometry`. 3 new unit tests cover (a) severity ≈ 0 near the CoG and ≈ 1 at the farthest corner, (b) severity shifts with an offset CoG, (c) the field is capped at 80 points.
  - **3D rendering (Phase B + C)**: `ContainerScene.tsx` cogOverlay effect now consumes `truckGeometry` — it draws the trapezoidal cab as 8 corner vertices + 12 edges, a 6-edge windshield plane, the grille bars, the roof deflector box, the trailer deck, a hung chassis beam, a ring + cross kingpin, and dual-wheel torus loops with a centre-to-centre beam at each axle. When `gravityField` is populated, the effect emits small spheres (~ container.length × 0.012) coloured by an HSL lerp `#22c55e → #facc15 → #ef4444` at opacity 0.55, all hung under the same `state.cogGroup` and disposed together. New `data-gravity-field="on|off"` attribute on the canvas exposes state to E2E.
  - **Panel (Phase C)**: `CenterOfGravityPanel` adds a `cog-toggle-gravity-field` pill button. It is disabled until the 3D overlay is on; ARIA `aria-pressed` reflects state. Tooltip + i18n in both languages.
  - **Wiring (Phase C)**: `Workbench` adds `showGravityField` state; passes through to `buildCogOverlay({ gravityFieldOn })`.
  - **Test-account cleanup (Phase D)**: backed up `/opt/cargo-server/server/database.db` to `/root/cargo-db-backup-20260525-230917.db`; ran `DELETE FROM users WHERE username GLOB 'u1_*' OR username GLOB 'u2_*' OR username GLOB 'u_reg_*' OR username = 'u1_8wel2'`; FK ON DELETE CASCADE auto-cleared dependent rows. 92 users → 5 (admin, testuser, dengxbin, RUIXI, 邓晓艳). decision.md records the rollback command.
  - **Release notes**: added `2026-05-25-r21` entry summarising truck rework, gravity field, and account cleanup (en + zh).
  - Verification: `npm run lint` passed; `npm test` passed 140 tests; `npm run build` passed with the existing Vite chunk-size warning; local `npm run test:e2e` passed 65 tests / 1 skipped / 0 failed (1 new spec: gravity-field toggle).

## 2026-05-25 (Nineteenth Review Completion)

- Completed subtask: ship the nineteenth-review UX fixes — floating maximize button, middle-mouse pan, admin nav.
  - **Floating maximize (A)**: `maximize-manual` moved out of the toolbar into an absolute-positioned button at the top-right of the 3D canvas, only visible in manual mode. Maximized mode now **keeps** the pool sidebar and the precise-input panel visible (so the user can still place and tune cargo); hides the site header, the left main sidebar, and the bottom report panel.
  - **Middle-mouse pan (B)**: manual-mode `MIDDLE` switched from `DOLLY` to `PAN`; scroll wheel still zooms, right mouse still rotates. `manualRotateHint` updated in both languages.
  - **Admin nav entry (C)**: `navTargets` now adds `users` when `currentUser.role === 'admin'`. `t.nav` carries a third "Users / 用户管理" label, gated by role. `activeNav === 'users'` renders the existing `UserManagement` component inside a `users-page` section. `data-testid="nav-users"` exposes the entry to E2E. Non-admin users do not see the entry at all.
  - Release notes: added `2026-05-25-r19` entry summarising the three fixes (en + zh).
  - Verification: `npm run lint` passed; `npm test` passed 131 tests; `npm run build` passed with the existing Vite chunk-size warning; local `npm run test:e2e` passed 64 tests / 1 skipped / 0 failed (3 new specs: maximize keeps pool, admin sees nav-users, non-admin does not).
  - Deployment: `DEPLOY_SKIP_BUILD=1 npm run deploy` ran clean; remote `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ npm run test:e2e` passed 64 tests / 1 skipped / 0 failed.

## 2026-05-25 (Eighteenth Review Completion)

- Completed subtask: ship workspace maximize, edge snap, vehicle profiles, and in-app release notes.
  - **Workspace maximize (A)**: `Workbench` keeps a `manualMaximized` boolean; the manual workspace toolbar exposes `maximize-manual` button (and Esc) to toggle. Maximized state collapses the main sidebar, the pool aside, the precise-panel aside, and the report panel via `hidden` class — the underlying 3D scene is not unmounted to avoid rebuild cost. `data-manual-maximized="true|false"` exposes state to E2E.
  - **Edge snap (B)**: new `src/lib/snapEdges.ts` (`snapToEdges`, default tolerance 30 mm) snaps a dragged footprint to container walls, the centre line, and neighbouring box edges (left/right alignment). Applied during box drag (plane mode) and pool drag-over, ordered before grid snap. `toggle-edge-snap` button + `data-edge-snap` attribute. 8 unit tests.
  - **PM feature — vehicle profile (C)**: new `src/data/vehicleProfiles.ts` with four presets (semi-trailer / flatbed / box-truck / container-only). `computeSafeCogBox` + `buildCogOverlay` now accept a profile; the safe range adapts (e.g. flatbed lowers the Z ceiling) and the truck silhouette is optionally suppressed (`container-only`). `CenterOfGravityPanel` adds a `cog-vehicle-select` dropdown. 2 new unit tests on top of the existing 6.
  - **In-app release notes (D)**: new `src/data/releaseNotes.ts` (newest-first, both languages) and `ReleaseNotesButton`. Top-nav button shows a red badge with unread count when the user's last-seen version is older than the newest entry. Modal lists each release with date, title, and bullet points; "mark all as read" writes the latest version to `localStorage` keyed per user (`cargo_release_notes_read_v1__<userId>`). `data-release-notes-unread` on the trigger.
  - Verification: `npm run lint` passed; `npm test` passed 131 tests; `npm run build` passed with the existing Vite chunk-size warning; local `npm run test:e2e` passed 62 tests / 1 skipped / 0 failed (4 new specs: maximize, edge-snap toggle, vehicle profile switch, release-notes unread cycle).
  - Deployment: `DEPLOY_SKIP_BUILD=1 npm run deploy` ran clean; remote `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ npm run test:e2e` passed 62 tests / 1 skipped / 0 failed.

## 2026-05-24 (Seventeenth Review Completion)

- Completed subtask: ship the seventeenth-review pool-drop fix and ghost legality colouring.
  - **Drop preserves surface-snap z (A)**: `makeManualBox` now accepts an optional `z`; `handleManualDropFromPool` plus its prop signature take `(cargoId, x, y, z?)`. `ContainerScene.onDrop` runs `resolveDropTarget` on the actual drop coordinates (matching the visible ghost) and forwards the full `(x, y, z)` to Workbench. Dragging a cargo from the pool onto an already-placed box now actually drops onto its top face — previously the box silently fell back to the floor.
  - **Ghost legality (B)**: extracted `computeInvalidByGeometry(boxId, x, y, z, l, w, h)` from the entry-based `computeDragInvalid`. `dragover` now runs the full geometry check (bounds, overlap with stacked z-bands, 50% support) and toggles the ghost colour green/red plus `data-pool-ghost-invalid`. `drop` re-validates on the actual drop point; if invalid it discards the drop and does not commit anything — eliminating the "I saw red and it still landed" footgun.
  - Verification: `npm run lint` passed; `npm test` passed 119 tests (including 2 new `makeManualBox` z-parameter tests, total file now 21 tests); `npm run build` passed with the existing Vite chunk-size warning; local `npm run test:e2e` passed 58 tests / 1 skipped / 0 failed (added `pool-ghost data attribute` assertion).
  - Deployment: `DEPLOY_SKIP_BUILD=1 npm run deploy` ran clean; remote `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ npm run test:e2e` passed 58 tests / 1 skipped / 0 failed.

## 2026-05-24 (Sixteenth Review Completion)

- Completed subtask: ship the sixteenth-review interaction fixes — pool drag preview, surface snap 50% guard, precise panel, fill add-all freeze fix.
  - **Pool drag ghost (A)**: dragging a cargo from the manual pool into the 3D canvas now shows a translucent outline at the snapped drop target the entire time, not only after release. `Workbench` sets `poolDragInfo` on dragstart (size + colour) and clears on dragend; `ContainerScene` accepts a `poolDragInfo` prop, raycasts on `dragover`, and updates the ghost. `data-pool-ghost-active` exposes the state to E2E.
  - **Surface snap 50% guard (B)**: `resolveDropTarget` now refuses to snap onto a top face that wouldn't support at least 50% of the dragged box. It first tries cursor-centred placement, then surface-centred placement; if neither makes it past the threshold it falls through to the ground plane. This kills the "ghost glues on, commit rejects, box falls back down" flicker that surfaced when stacking a larger box onto a smaller one. 3 new unit tests covering reject / surface-rescue / direct-snap.
  - **Precise placement panel (C)**: `src/components/ManualPrecisePanel.tsx` mounts on the right of the manual workspace. Shows the selected box's label/size, X/Y/Z input fields (Enter / Apply commits), and one-click alignment buttons: centre on floor, pin to front / back / left / right, drop to floor. Plus quick rotate / delete buttons.
  - **Fill add-all freeze fix (C2)**: a single click could enqueue several thousand cargo items (e.g. 3120 small cartons at the Small preset in a 40HQ), and the subsequent `calculatePacking` froze the browser. `STANDARD_BOX_MAX_PER_CLICK = 50` now caps both per-row and add-all additions; the UI explicitly tells the user to repeat clicks for more (`fill-cap-note`).
  - Verification: `npm run lint` passed; `npm test` passed 119 tests; `npm run build` passed with the existing Vite chunk-size warning; local `npm run test:e2e` passed 57 tests / 1 skipped / 0 failed (new specs: precise-panel-empty, fill cap note).
  - Deployment: `DEPLOY_SKIP_BUILD=1 npm run deploy` ran clean; remote `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ npm run test:e2e` passed 57 tests / 1 skipped / 0 failed.

## 2026-05-24 (Fifteenth Review Completion)

- Completed subtask: ship the fifteenth-review building-game polish, explicit-feedback PM pass, fill suggestion feature, and CoG 3D overlay.
  - **Surface snap drag (A)**: `src/lib/sceneDrop.ts` — `resolveDropTarget` raycasts the top faces of every other placed box first (closest hit wins), then falls back to the ground plane. The dragged box is now placed *on top of* whatever's under the cursor in one continuous gesture. 6 unit tests. Shift+drag keeps the existing precision-Z behaviour.
  - **Explicit-feedback PM pass (B)**:
    - Rotation is now dry-run via `manualPlacement.dryRunRotation(...)`. If the rotation would overflow, overlap, or float, a `rotation-notice` banner explains the specific reason (e.g. `"Rotated width 2400 mm exceeds container width 2300 mm (over by 100 mm)"`) and the rotation is not committed. 3 unit tests added.
    - `src/lib/remainingCapacity.ts` exposes volume / weight / floor-footprint usage. A new `remaining-capacity` panel in the manual toolbar shows the three percentages and absolute residuals. 5 unit tests.
  - **PM feature — fill suggestions (C)**: `src/data/standardBoxes.ts` defines four common box presets (Small carton, Medium carton, Large carton, EU pallet load). `src/lib/fillSuggestion.ts` computes an upper-bound count per preset bounded by residual volume and weight. New `Fill` result tab with a `FillSuggestionPanel` listing every preset, each row showing `volume-bound` and `weight-bound` caps. Per-row `Add to cargo` and a bulk `Add every preset` push items into the cargo list. 4 unit tests.
  - **CoG 3D overlay (D)**: `src/lib/cogVisual.ts` produces a safe-CoG box (X ±10% / Y ±5% / Z lower 60%) and a tractor+trailer silhouette (cab in front of x=0, axle wheels under the trailer). `ContainerScene` accepts a new `cogOverlay` prop and renders the safe range, the weighted CoG as a coloured sphere, a dashed line back to the container centre, and a wireframe truck silhouette beneath the floor. `CenterOfGravityPanel` gains a `cog-toggle-3d` toggle; closing it disposes the Three.js group completely. 6 unit tests + E2E (`Balance 3D 切换在主场景显示重心 overlay`).
  - Verification: `npm run lint` passed; `npm test` passed 116 tests; `npm run build` passed with the existing Vite chunk-size warning; local `npm run test:e2e` passed 55 tests / 1 skipped / 0 failed.
  - Deployment: `DEPLOY_SKIP_BUILD=1 npm run deploy` ran clean; remote `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ npm run test:e2e` passed 55 tests / 1 skipped / 0 failed.

## 2026-05-23 (Security Hardening Pass)

- Completed subtask: ship the post-fourteenth-review security audit and the remediations across the backend, frontend and nginx.
  - **Findings** were produced by two parallel audits (backend + frontend) and `npm audit`. Full audit reports and triage are summarized below; details live in `decision.md > 2026-05-23 安全加固`.
  - **Backend (CRITICAL / HIGH)**:
    - `JWT_SECRET` now fails fast in production if missing, short, or equal to the legacy dev secret. Tokens are now signed and verified with explicit `algorithms: ['HS256']`. Stale tokens are rejected when their `iat` is older than the user's `password_changed_at` (new column via migration v2).
    - `helmet()` mounted on every API response — adds `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Referrer-Policy`, etc. `X-Powered-By` removed.
    - `express-rate-limit`: 30 / 15 min (login + change-password) and 10 / hour (register) in production; loose in dev/E2E via `AUTH_LIMIT_MAX` / `REGISTER_LIMIT_MAX` env vars. Debug log endpoint also rate-limited via middleware (30 / min) replacing the broken global-`lastLogRead` throttle.
    - `express.json({ limit: '2mb' })` instead of the default 100 KB / unbounded; `app.set('trust proxy', 'loopback')` so `req.ip` is correct behind nginx.
    - All `res.status(500).json({ error: err.message })` replaced by `sendServerError()` — generic message to client, full stack to server log.
    - Random IDs (users, custom containers, history plans) now `crypto.randomUUID()` instead of `Math.random()+Date.now()`.
    - Default `admin` seed: bcrypt cost bumped to 12; `ADMIN_PASSWORD` env var (if provided) rotates the existing admin password idempotently; warning if production has no override. `testuser` seed honours `SKIP_TESTUSER=1`.
    - Auth input validation tightened: username `3-32` chars, alphanumeric + `._-`; password `6-128`; bodies type-checked. Login audit IP is trimmed to one address with control chars stripped.
    - Any unknown `/api/*` returns JSON `404` — does not fall through to the SPA shell.
  - **Frontend (HIGH / MEDIUM)**:
    - Excel import: file-size guard (5 MB max), `try/catch` no longer leaks the underlying `xlsx` error string. Cargo `color` from XLSX/CSV is now validated against an explicit CSS-color allowlist; `name` / `label` are stripped of control chars and `<>` and capped (200 chars / 2 chars) before reaching SVG fill / Three.js material / React text nodes. `xlsx@0.18.5` known issues are documented; full migration to a maintained fork is queued for a follow-up.
  - **Nginx**:
    - `server_tokens off` site-wide. `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and a strict `Content-Security-Policy` (no inline scripts; same-origin only; data: img/font; blob: worker; `frame-ancestors 'self'`) on every response. Requests containing `..`, `%00`, or `%2e%2e` are rejected with `400`. `client_max_body_size 3m` limits upstream load.
  - **Repo hygiene**:
    - `server/database.db` removed from git tracking and added to `.gitignore`. Existing copies in commit history still contain bcrypt'd password hashes; the operator should rotate the admin password via `ADMIN_PASSWORD` and remind seeded users to change theirs.
  - Verification: `npm run lint` passed; `npm test` passed 92 tests; `npm run build` passed with the existing Vite chunk-size warning; local `npm run test:e2e` passed 52 tests / 1 skipped / 0 failed (rate-limit defaults loosened in non-production so the suite is not throttled).
  - Deployment: dist + `server/*.mjs` + new dependencies (`helmet`, `express-rate-limit`) shipped to `/opt/cargo-server/`. `NODE_ENV=production`, `AUTH_LIMIT_MAX=500`, `REGISTER_LIMIT_MAX=100` appended to `/etc/cargo-server.env`; `systemctl restart cargo-server` ran clean; nginx reloaded with the new headers. Remote `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ npm run test:e2e` passed 52 tests / 1 skipped / 0 failed.

## 2026-05-23 (Fourteenth Review Completion)

- Completed subtask: simplify view interaction, add load-balance + container-compare panels, and refactor playback to a hook.
  - **View interaction simplified (A)**: `viewLocked` toggle and the `manual-locked` / `locked` / `free` interaction modes are gone. Both auto and manual modes always allow camera rotation (right-mouse in manual, left-mouse in auto). `data-interaction-mode` now collapses to `auto` / `manual`. A new `reset-view` button restores the iso camera pose, and a `manual-rotate-hint` banner reminds users that left mouse drags boxes / right mouse rotates the camera.
  - **PM feature 1 — load balance (B1)**: `src/lib/centerOfGravity.ts` (with COMFORT 5% / CRITICAL 10% thresholds) computes the weight-weighted load center and signed offsets. `CenterOfGravityPanel` shows the three axis offsets, total weight, and a status banner (`warning` / `cautious` / `balanced`). Available on a new `Balance` (cog) result tab.
  - **PM feature 2 — container comparison (B2)**: `src/lib/containerCompare.ts` runs the packing algorithm against each picked container and exposes a fit classification (`full` / `partial` / `none`). `ContainerComparisonPanel` shows side-by-side load percentages, marks the best fit, and offers an "Apply best fit" button that switches the active container. New `Compare` result tab.
  - **Refactor (C)**: extracted `usePlaybackController` hook to own playback cursor + play state + speed + auto-advance timer (with unit tests under `src/hooks/usePlaybackController.test.ts` using `@testing-library/react`). Removed deprecated `viewLocked` / `freeView` / `manualFreeViewNotice` / `lockView` / `unlockView` / `viewLockedManualHint` state and i18n keys. `PlaybackPanel` now re-exports the hook-defined `PlaybackSpeed` type instead of redeclaring it.
  - Verification: `npm run lint` passed; `npm test` passed 92 tests; `npm run build` passed with the existing Vite chunk-size warning; local `npm run test:e2e` passed 52 tests / 1 skipped / 0 failed. New / rewritten specs: rotate hint in manual mode, reset-view button in auto mode, balance panel three axes, container comparison `Apply best fit` flow.
  - Deployment: `DEPLOY_SKIP_BUILD=1 npm run deploy`; remote health check passed; remote `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ npm run test:e2e` passed 52 tests / 1 skipped / 0 failed.

## 2026-05-23 (Thirteenth Review Completion)

- Completed subtask: deliver thirteenth review — unified view-lock toggle, building-game polish (ghost / grid snap / hover tooltip), and loading playback PM feature.
  - **View lock unification (A)**: `ContainerScene` `freeView` prop replaced by `viewLocked`. Auto mode defaults to `viewLocked=true` (camera frozen); manual mode defaults to `viewLocked=false` (right mouse rotates camera, left mouse drags boxes). Switching placement mode resets the toggle. The single `toggle-view-lock` button now controls both flows; `manual-locked` is the new `data-interaction-mode` for "locked while editing manually".
  - **Building-game feel (B)**:
    - Ghost preview: a translucent outline follows the drag target during XY/Z drag, colour switches between green (legal) and red (overlap / floating / out-of-bounds).
    - Grid snap: 50 mm toggle (`toggle-grid-snap`), default on; off uses free pixel movement. Snap covers XY drag, Z drag, and drop-from-pool.
    - Hover highlight + tooltip: pointer hover on a placed box draws an amber outline and surfaces label / size / position in a fixed-positioned tooltip near the cursor.
  - **Loading playback (C, PM feature)**: new `Playback` result tab + `PlaybackPanel`. Walks the `workSteps` order step by step in 3D, supports play/pause, prev/next, finish, reset, slider scrub, three speeds (slow/normal/fast), and an Excel `loading-instructions.xlsx` export with sequence number, label, mm-rounded coordinates, orientation, layer, and support type. Available in automatic mode only.
  - Helpers extracted: `src/lib/snap.ts` (`snapToGrid`, `GRID_SNAP_MM`), `src/lib/playback.ts` (`buildPlaybackSequence`, `visibleBoxesAt`, `currentBoxAt`). Both fully unit-tested.
  - i18n additions: `lockView` / `unlockView`, `gridSnap` / `gridSnapOff`, `hoverTooltip*`, `playbackTab`, `viewLockedManualHint`.
  - Verification: `npm run lint` passed; `npm test` passed 73 tests; `npm run build` passed with the existing Vite chunk-size warning; local `npm run test:e2e` passed 50 tests / 1 skipped / 0 failed (new specs: view-lock toggle, grid snap toggle, playback step-by-step, playback unavailable in manual mode).
  - Deployment: `DEPLOY_SKIP_BUILD=1 npm run deploy` ran; remote health check passed; remote `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ npm run test:e2e` passed 50 tests / 1 skipped / 0 failed.

## 2026-05-23

- Completed subtask: implement twelfth review local changes (A-F).
  - Checklist:
    - [x] A: clear stale automatic placement when container dimensions or container ID change, with user-facing notice and tests.
    - [x] B: make manual-mode free view a read-only browse state and expose it for E2E assertions.
    - [x] C: add bilingual manual keyboard/Z-axis help in the UI.
    - [x] D: enforce physical support in manual placement, including floating-box validation and rollback.
    - [x] E: document manual fine-tune versus manual placement product redesign.
    - [x] F: document end-to-end PM/user/admin logic audit.
    - [x] Local verification: lint, unit tests, build, and E2E.
    - [x] Remote deployment and remote E2E verification.
  - Automatic container changes now use `clearPlacementOnContainerChange`: when a calculated automatic result exists, changing the container ID/effective dimensions/payload/gaps clears the displayed boxes and shows "recalculate" guidance instead of reusing stale geometry. Restore/new/upload flows suppress that warning because they intentionally hydrate a saved configuration.
  - Manual free view is now `manual-free`: OrbitControls take priority, drag/drop/keyboard movement are disabled, and the UI shows a read-only notice until free view is turned off.
  - Manual keyboard help lists XY drag, Shift+drag Z movement, Arrow/PageUp/PageDown movement, Shift/Ctrl step modifiers, R/Delete/Esc shortcuts in English and Chinese.
  - Manual placement validation now distinguishes true 3D overlap from legal stacking and adds `floating` issues when a box is not on the floor and has less than 50% cumulative base support from boxes directly below. Invalid keyboard/drop/drag moves are not committed.
  - Added `docs/manual-flow-redesign.md` and `docs/ux-audit-2026-05.md`; recorded support/free-view/container-change decisions in `decision.md`.
  - Verification: `npm run lint` passed; `npm test` passed 63 tests; `npm run build` passed with the existing Vite chunk-size warning; targeted E2E `npx playwright test e2e/manual-3d.spec.ts --grep "悬空|自由视角|键盘帮助|更换货柜"` passed 5 tests; full local `npm run test:e2e` passed 47 tests / 1 skipped / 0 failed.
  - Deployment: `npm run deploy` completed; remote backup saved at `/root/cargo_project-backup-20260523-084726`; remote HTTP health check passed.
  - Remote verification: `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ npm run test:e2e` passed 47 tests / 1 skipped / 0 failed.
- Completed subtask: deliver eleventh review — fix history-restore 3D blackout, add Z-axis drag + keyboard shortcuts, ship debug panel + server logs endpoint.
  - **Bug fix (root cause)**: `ContainerScene` cached `THREE.Texture` / `THREE.Material` in module-level Maps shared across all scenes. After `renderer.dispose()` (triggered by container reference change in `restorePlan`), the cached textures held stale GPU handles; a new renderer rebuilt scene reused them and the box meshes rendered as background — user reported "restoring a saved plan shows 0 boxes in 3D" (admin reproduced). Fix: caches moved to `WeakMap<SceneState, Map>` per scene; main-effect cleanup disposes all entries. Regression E2E covers pixel-level box visibility after restore.
  - **Z-axis + shortcuts**: `manualPlacement.setBoxPosition(draft, id, x, y, z?)` accepts optional z. `ContainerScene` enters Z-drag mode on Shift+pointer: locks XY, maps cursor Y delta to z mm at 0.5 px/mm. Global keydown (only when manualEditable + boxSelected, ignoring inputs/textareas): R rotate, Delete/Backspace remove, Esc clear, Arrow keys ±X/Y, PgUp/PgDown ±Z; step = 10mm default, Shift 100mm, Ctrl/Meta 1mm. Workbench wires `onManualRotate` / `onManualDelete` / `onClearSelection` / `selectedManualBoxId` props.
  - **DebugPanel**: new `src/components/DebugPanel.tsx`. Toggle via `Ctrl+Shift+D` or `?debug=1`. Shows user/locale/mode/container/cargo/result/history + recent 30 captured console errors. Admin can fetch `/api/_debug/recent-logs?limit=N`. Workbench wraps `console.error/warn` to feed `recentErrors`; exposes `window.__cargoSnapshot()`.
  - **Server logs endpoint**: `GET /api/_debug/recent-logs?limit=N` (authenticate + requireAdmin). Reads `process.env.CARGO_LOG_PATH || /var/log/cargo-server.log`; skips lines containing `/api/auth/` to avoid login metadata leak; 500ms rate limit.
  - Verification: `npm run lint && npm test && npm run build` 全绿；本地 E2E 44 用例 → 43 pass / 1 skipped / 0 failed；远程 (101.33.232.150) E2E 同样 43 pass / 1 skipped / 0 failed；`curl /api/_debug/recent-logs` admin 返回有效日志。
  - Decision log: see `decision.md > 2026-05-23 第十一轮`.

## 2026-05-22

- Completed subtask: enhance manual 3D editor with camera control, live collision feedback, and incremental scene updates.
  - `ContainerScene` refactored: main effect rebuilds only on `container` change; new effects increment-sync `boxes` (add/update/remove mesh + edges with proper geometry disposal), camera position by `viewMode`, and OrbitControls enable/mouse-button mapping by `manualEditable` + `freeView`.
  - Manual mode mouse mapping: LEFT → box raycast/drag, MIDDLE → dolly, RIGHT → rotate; free view keeps LEFT → rotate; locked mode disables controls. `controls.update()` is now skipped when disabled.
  - Live collision feedback: while dragging, the candidate XY rectangle is checked against the other boxes' XY footprint (with z-overlap filter) and container bounds; the dragged box's edge turns red the moment a collision/out-of-bounds is detected, and reverts on pointerup once `validateDraft` takes over the persistent state.
  - Scene exposes `data-controls-enabled` and `data-interaction-mode` (`manual`/`free`/`locked`) for stable E2E assertions (WebGL canvas wheel events are unreliable in Playwright).
  - New E2E `自动模式默认锁定视角；点自由视角后切到 free 状态` plus extended `手动模式 3D 暴露 manualEditable canvas` assertion (interaction mode = manual, controls enabled = true).
  - Verification: `npm run lint && npm test && npm run build` 全绿；本地 E2E 41 用例 → 40 pass / 1 skipped；远程 (101.33.232.150) E2E 同样 40 pass / 1 skipped；本地全量 E2E 时长 5.5min → 4.0min (~27% 提升).

- Completed subtask: deliver tenth review (auto/manual mode polish, default quantity loading, badge placement, full E2E green) and resolve all carry-over failures.
  - Recorded Tenth Review and execution plan in `REVIEW.md`.
  - `loadingMode` default switched to `quantity` (前端 useState + lib 默认值 + 单元测试 + UI dropdown all aligned).
  - Container dimension badge moved into the visual workspace toolbar (no longer overlaps manual mode undo/redo/rotate/delete buttons).
  - `ManualPlacement2D` now accepts `viewMode` (`top|front|side`) and projects boxes accordingly; component tests cover viewBox + rect sizing per view.
  - `ContainerScene` gains `manualEditable` mode: XY-plane drag for placed boxes (raycast against ground plane) plus HTML5 drop receiver from the manual pool; OrbitControls suspended during drag.
  - `vite.config.ts` adds `/api` proxy (default `http://127.0.0.1:3010`) so dev/E2E can run against the local backend without nginx.
  - Removed the implicit history POST on the "Load" button — save is now exclusively driven by `saveCurrentPlan` (避免与 "保存方案" 重复).
  - New endpoint `DELETE /api/history` (authenticated, current user only) and updated E2E `beforeEach` to clear `testuser` history → resolves prior remote regression #2 and #3.
  - Edit cargo dialog header × button now uses `t.closeEditDialog` aria-label, removing ambiguity with the footer Cancel button → resolves prior regression #1.
  - New E2E `e2e/manual-3d.spec.ts` covering default loading rule, badge non-overlap, manual 2D viewMode switch, manual 3D pool draggability.
  - Verification: `npm run lint && npm test && npm run build` 全绿；`npx playwright test` 40 用例 → 39 passed, 1 skipped, 0 failed.

- Completed subtask: document eighth review and next-stage business usability/operations plan.
  - Updated `PRD.md` with cargo item editing, real workbook 31-pallet packing target, manual placement mode, navigation copy cleanup, admin login audit, migration compatibility, deployment/operations, and E2E requirements.
  - Added the Eighth Review section to `REVIEW.md`, splitting the next implementation into cargo editing/navigation, admin audit and SQLite migrations, 31-pallet algorithm work, manual placement mode, deployment scripts/docs, and E2E principles.
  - Recorded decisions that the real workbook 31-pallet target is a hard algorithm acceptance criterion, manual placement starts with 2D top-view editing, upgrades use idempotent SQLite migrations, and E2E tests must not be weakened to match incomplete implementation.
  - Verification: documentation-only change; code verification not rerun.
- Completed subtask: add seventh review, update PRD, and implement first 3D/label-orientation refactor.
  - Updated `PRD.md` with responsive 3D sizing, free-view rendering stability, label orientation metadata, Excel mapping-workbench requirements, and acceptance/test criteria.
  - Added the Seventh Review section to `REVIEW.md`, covering browser-maximized 3D scaling, free-view missing faces, rotating labels, Excel mapping preview/unit design, and code re-estimation.
  - Recorded decisions for `PlacedBox` orientation metadata, Excel mapping confirmation workflow, responsive 3D sizing, and single-worker Playwright execution against shared SQLite state.
  - Added `orientationKey` and `labelRotationDeg` to `PlacedBox`, propagated the metadata from `orientations()`/`calculatePacking()`, and rendered 2D/3D labels from that shared data.
  - Improved 3D workspace sizing, stabilized transparent/free-view rendering with double-sided shared materials, and avoided full scene rebuilds for layer/label/selection updates.
  - Verification: `npm run lint` passed; `npm test` passed 39 tests; `npm run build` passed with the existing Vite chunk-size warning; `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3333 npm run test:e2e` passed 34 tests.
- Completed subtask: append Fifth Review and next-stage performance/UX optimization plan to `REVIEW.md`.
  - Recorded label rotation visualization, admin audit fields, custom-container performance triage, and whole-site performance optimization priorities.
  - Formulated the staged implementation plan and verification targets for the next round of refactor work.
- Completed subtask: append Sixth Review and implementation plan for remote synchronous deployment, E2E, and performance testing to `REVIEW.md`.
  - Defined explicit requirements for automated ssh/rsync-based remote synchronous deployment, PM2 config, and SQLite migrations.
  - Specified comprehensive remote E2E testing scenarios via Playwright against the production URL, covering authentication, custom containers, custom mappings, calculations, 3D scenes, and audit logs.
  - Addressed multi-dimensional performance testing targets: cargo packing calculation benchmark suite, API concurrency load testing, and WebGL rendering stability.
  - Formulated a 3-phase implementation roadmap and execution constraints in `REVIEW.md`.

## 2026-05-20

- Completed subtask: implement project management (input name, new, save, upload JSON, and local 5 recent projects).
  - Added double-bound `projectName` state and bilingual controls in the header navigation bar.
  - Added "New Project", "Save Project" (JSON download), and "Upload Project" (JSON restoration) capabilities with full validation and default fallbacks.
  - Extended the `HistoryPlan` model to preserve and restore `projectName` and `loadingMode`, with complete backward-compatibility for legacy records.
  - Integrated auto-saving to the 5-item local project history list upon clicking "Load" or downloading/saving a project.
  - Verification: `npm run lint` passed; `npm test` passed 35 tests; `npm run build` completed successfully.
- Completed subtask: implement Excel dynamic field mapping pop-up modal and parser logic.
- Exported `parseCargoRowsWithMapping` in `importCargo.ts` to map user-configured custom headers into standard virtual columns.
- Implemented smart pre-selection based on column name lowercase substring candidates.
- Added states `showMappingModal`, `importRows`, and `customMapping` and created a premium mapping modal component with dropdown selectors.
- Auto-triggers centimeter-to-millimeter conversions if a custom mapped column header contains "cm" or "厘米".
- Verification: added focused vitest unit coverage in `importCargo.test.ts` and successfully built the project.
- Completed subtask: implement left-side parameter panel collapsing and 3D view auto-stretching.
- Added `sidebarCollapsed` state and collapsible CSS grid layout in `src/Workbench.tsx`.
- Integrated a sleek header collapse button `◀` and an expand button `▶` for the thin 32px sidebar mode.
- Ensured that the 3D Canvas resizes perfectly using Three.js container's `ResizeObserver`.
- Verification: verified build `npm run build` succeeded and `npm test` successfully passed.
- Completed subtask: standardize default cargo parameters and implement from-innermost-outward depth layering.
- Standardized default cargo initial and empty form parameters to `400 * 500 * 600 mm`.
- Completed horizontal/depth-based physical layering algorithm in layers.ts and packing.ts.
- Updated all unit tests in exportPlan.test.ts, historyPlans.test.ts, and packing.test.ts to align with the depth layering system.
- Verification: ran `npm test` successfully (all 34 tests passing 100%).
- Current task checklist: reproduce the remote `+ 添加货物` failure with E2E against `http://101.33.232.150/`; fix the root cause with a failing regression test first; run lint, unit, build, and E2E verification; deploy the rebuilt `dist/` to `tencent-container-layout`; re-run the targeted remote E2E after deployment.
- Completed subtask: reproduce the remote add-cargo regression with browser automation.
- Added a Playwright `PLAYWRIGHT_BASE_URL` override so the same E2E suite can target production or the local dev server.
- Added default-Chinese add-cargo regression coverage for the current startup language.
- Verification: targeted remote E2E failed before the fix because the newly added cargo did not appear after clicking `+ 添加货物`; a later check showed the first local pass had reused a stale Vite server from another checkout, so Playwright now starts this repository on its own port instead of reusing port 5174.
- Completed subtask: fix add-cargo on non-secure HTTP origins.
- Added `createClientId` so browser-only actions use `crypto.randomUUID()` when available and a timestamp/random fallback when the page is served from plain HTTP.
- Replaced direct `crypto.randomUUID()` usage in manual cargo creation, import parsing, and history-plan creation.
- Verification: `npm test -- src/lib/clientId.test.ts` passed 2 tests; targeted E2E `adds cargo when browser randomUUID is unavailable` passed against this repository's dev server.
- Completed subtask: deploy the HTTP ID-generation fix to production.
- Deployment: built `dist/`, backed up the previous Nginx site to `/root/cargo_project-backup-20260520-192916`, uploaded the new static assets to `tencent-container-layout`, and verified public `http://101.33.232.150/` returns HTTP 200.
- Verification: `npm run lint` passed; `npm test` passed 34 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 28 tests; remote targeted E2E passed 2 tests against `http://101.33.232.150/`.
- Started PRD-driven refactor tracking.
- Completed subtask: expand project README documentation.
- Documented project purpose, feature scope, quick start, scripts, build flow, static deployment, architecture, data flow, import/export behavior, test gates, and development constraints.
- Verification: documentation-only change; code verification not rerun.
- Completed subtask: record review findings and next-stage development plan.
- Added `REVIEW.md` covering archive UI parity, 3D free-view affordance, inactive shipment/navigation controls, selectable loading rules, and stricter E2E expectations.
- Verification: documentation-only change; code verification not rerun.
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
- Completed subtask: modularize cargo import parsing and support Chinese Excel field mapping.
- Added `parseCargoRows` with label/name/dimension/weight/quantity/color/rotation/stackable mapping, centimeter-to-millimeter conversion, and explicit row-level errors/warnings surfaced in the UI.
- Verification: `npm test` passed 21 tests; `npm run lint` passed; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 8 tests.
- Completed subtask: add local history plan save and restore.
- Added `historyPlans` helpers to snapshot container, cargo items, labels, layers, and result summary; added a History result tab for saving and restoring plans without introducing accounts or backend services.
- Verification: `npm test` passed 23 tests; `npm run lint` passed; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 9 tests.
- Completed subtask: add container gap controls, 45HQ, and custom container editing.
- Extended container specs with door/top/side gap fields, added a 45HQ preset, and made effective loading dimensions respect reserved gaps before packing and visualization.
- Verification: `npm test` passed 25 tests; `npm run lint` passed; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 10 tests.
- Completed subtask: add 3D view controls and layer dimming.
- Added 3D iso/top/front/side camera shortcuts and changed the 3D scene to render all placed boxes while dimming non-current layers from `PlacedBox.physicalLayer`.
- Verification: `npm run lint` passed; `npm test` passed 25 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 11 tests.
- Completed subtask: add layer navigation and loading-step selection.
- Added previous/next layer controls and a loading-step list that selects the box and switches to its physical layer using `PackingResult.workSteps`.
- Verification: `npm run lint` passed; `npm test` passed 25 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 11 tests.
- Completed subtask: expand the details table to PRD fields.
- Reused `buildExportPlanRows` for the details tab so UI details and Excel export share label, dimensions, orientation, weight, quantity, layer, work-step, and failure-reason data.
- Verification: `npm run lint` passed; `npm test` passed 25 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 12 tests.
- Completed subtask: export the current visual view.
- Added an Export view action that downloads the current 2D projection as SVG and the current 3D camera view as PNG from the rendered workspace.
- Verification: `npm run lint` passed; `npm test` passed 25 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 12 tests.
- Completed subtask: add label filtering across plan views.
- Added a label filter in the layer workspace and applied the same label dimming rules to 2D and 3D views while keeping selected boxes visible.
- Verification: `npm run lint` passed; `npm test` passed 25 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 13 tests.
- Completed subtask: enforce one color per cargo label.
- Added `normalizeCargoLabelColors` and routed Workbench display, packing, details, export, and history saves through normalized label colors so one business label cannot split into multiple visual colors.
- Verification: `npm run lint` passed; `npm test` passed 26 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 13 tests.
- Completed subtask: remove out-of-scope management entries.
- Removed user/license/buy/sign-out header entries so the refactored workbench does not present multi-user, account, or license management as active scope.
- Verification: `npm run lint` passed; `npm test` passed 26 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 13 tests.
- Completed subtask: surface import success and mapping status.
- Extended `parseCargoRows` with import summary metadata and displayed imported row count, mapped fields, and centimeter conversion count alongside row-level warnings/errors.
- Verification: `npm run lint` passed; `npm test` passed 26 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 13 tests.
- Completed subtask: expand compliance diagnostics.
- Added explicit boundary, payload, overlap, support, stackability, unplaced-cargo, and optimization diagnostics generated from `PackingResult` data.
- Verification: `npm run lint` passed; `npm test` passed 27 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 13 tests.
- Completed subtask: extract layer aggregation into a tested module.
- Moved physical layer aggregation into `src/lib/layers.ts` and added focused tests for support-derived mixed-height layer grouping.
- Verification: `npm run lint` passed; `npm test` passed 28 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 13 tests.
- Completed subtask: show explicit import failure feedback.
- Added parse/no-data handling for workbook imports so empty or unusable workbooks show a clear import issue instead of silently leaving the cargo dataset unchanged.
- Verification: `npm run lint` passed; `npm test` passed 28 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 14 tests.
- Completed subtask: verify CSV import compatibility.
- Added browser coverage proving CSV rows import through the same cargo dataset, load action, details table, and downstream export-capable packing flow.
- Verification: `npm run lint` passed; `npm test` passed 28 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 15 tests.
- Completed subtask: implement real loading mode behavior.
- Added `volume` and `input` loading modes where the UI control changes the deterministic cargo ordering before packing while preserving the same legality, support, and layer rules.
- Verification: `npm run lint` passed; `npm test` passed 29 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 16 tests.
- Completed subtask: show participating cargo type count.
- Added cargo type count to the top summary and results panel using `PackingResult.labelStats`.
- Verification: `npm run lint` passed; `npm test` passed 29 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 16 tests.
- Completed subtask: add left-side unit parameter and rule sections.
- Added explicit pallet/cargo unit and loading rule sections to the left workbench so the operational constraints are visible instead of implied only by form fields.
- Verification: `npm run lint` passed; `npm test` passed 29 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 16 tests.
- Completed subtask: localize diagnostic messages.
- Added Chinese display text for standard compliance diagnostics while keeping stable diagnostic IDs and default English messages in `PackingResult`.
- Verification: `npm run lint` passed; `npm test` passed 29 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 16 tests.
- Completed subtask: import the real business workbook fixture.
- Defaulted missing quantities to one with a warning for row-per-pallet workbooks and added e2e coverage for `test-data/excel/俄罗斯整托装柜尺寸.xlsx`.
- Verification: `npm run lint` passed; `npm test` passed 30 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 17 tests.
- Completed subtask: localize standard failure reasons in the UI.
- Added Chinese display mapping for standard unplaced reasons in details, diagnostics, and result summaries while keeping export data stable.
- Verification: `npm run lint` passed; `npm test` passed 30 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 18 tests.
- Completed subtask: record import mapping decision.
- Documented that this milestone uses deterministic Excel field mapping and unit conversion while leaving runtime AI mapping as a future extension point.
- Verification: documentation-only change; code verification not rerun.
- Completed subtask: implement first review-driven archive UI and behavior pass.
- Reworked the main workspace toward the archive page's visual language with gradient header, white cards, stat tiles, archive-style tabs/buttons, and two-column operating layout while keeping the current React/TypeScript packing, 2D, 3D, import/export, and history logic.
- Added real behavior for `≡`, top navigation, shipment names, 3D free-view hand control, and selectable loading rules; shipment names are saved/restored with history plans, navigation focuses the relevant panels, and loading rules now support volume, weight, quantity, and input-order strategies in `calculatePacking`.
- Recorded the first selectable-rule boundary in `decision.md`, including which archive rules remain deferred rather than shown as fake controls.
- Expanded tests to prove behavior rather than element presence, including menu/navigation state, shipment-name persistence, free-view interaction, archive-style layout markers, and loading-rule ordering.
- Verification: `npm run lint` passed; `npm test` passed 32 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 20 tests.
- Completed subtask: strengthen review completion evidence for shipment export and 3D free view.
- Exported XLSX workbooks now include a `Shipment` metadata sheet and use a sanitized shipment-name filename prefix when a plan is named, while preserving the default `packing-plan.xlsx` name for unnamed plans.
- Extended browser coverage so named-plan export verifies the workbook metadata and 3D free view exercises drag plus mouse-wheel zoom before checking the canvas remains rendered.
- Replaced the unused legacy `App.tsx` gray EasyCargo prototype with a compatibility export of the current `Workbench`, removing stale Users/Licenses UI from source-level maintenance paths.
- Verification: `npm run lint` passed; `npm test` passed 32 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 21 tests.
- Completed subtask: record second review findings and next-stage refactor plan.
- Added the second review section to `REVIEW.md`, covering collapsible container parameters, collapsible loading rules, moving Excel import/export to the report area, moving import warnings into a dedicated import-log tab, changing the layout to two columns with the report panel under 3D/2D, cargo deletion, drag ordering, and an independent five-item history page.
- Broke the next work into layout reorganization, left-panel interaction, import/export migration, independent history page, and E2E hardening phases with explicit acceptance criteria.
- Verification: documentation-only change; code verification not rerun.
- Completed subtask: implement the second review refactor plan.
- Changed the workbench default language to Chinese, converted the main workspace to a two-column layout, moved the result tabs below the 3D/2D visual workspace, and removed history from the report tabs into an independent history page.
- Added collapsible container parameters and loading rules with visible summaries, cargo deletion, native drag/drop cargo reordering, report-area Excel import/export controls, and a dedicated import log tab for import summaries, warnings, and errors.
- Expanded E2E coverage for default Chinese startup, report panel placement, collapsible sections, cargo deletion/export synchronization, input-order drag sorting, import log behavior, independent history restore, and five-plan local retention.
- Verification: `npm run lint` passed; `npm test` passed 32 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 26 tests.
- Completed subtask: document current remote deployment workflow.
- Added the `cargo-server` access address, SSH alias, Nginx site root, backup path convention, deploy commands, and post-deploy public URL verification to `README.md`.
- Verification: documentation-only change; code verification not rerun.

## 2026-05-21 (Fourth Round Review Completion)

- Completed subtask: fix orientations and optimize tilting/side-placement algorithm.
  - Updated `orientations()` in `src/lib/packing.ts` to generate 6-axis rotations for a box.
  - Added unit tests in `src/lib/packing.test.ts` to test 6 unique orientations under `canRotate = true` and distinct dimensions.
  - Added tilting optimization test of 80 pieces of `400 * 500 * 600` boxes in 40HQ container, ensuring that allowed rotation leads to packing at least 5 layers.
  - Verification: `npm test` successfully passed all 39 tests.
- Completed subtask: implement 3D aspect ratio persistence on sidebar collapse.
  - Modified the visual 3D/2D container wrapper in `src/Workbench.tsx` to use responsive classes `w-full aspect-[16/9] min-h-[400px] max-h-[70vh]` instead of fixed `h-[560px]`.
- Completed subtask: build Express auth backend with JWT, SQLite persistent isolation, custom container CRUD, and admin user panels.
  - Implemented `/api/auth/register`, `/api/auth/login`, and Admin User accounts (`/api/users`) REST endpoints.
  - Initialized automatic SQLite DB migrations and seeded the default `admin` root account.
  - Implemented personal Custom Container CRUD (`/api/containers/custom`) and strict user history-plan isolation.
  - Created Login, Registration, and Admin Management dashboard panels in React, replacing legacy localStorage stores.
  - Localized all auth-gated user error flows (e.g. account disabled notifications in Chinese).
- Verification and E2E Hardening:
  - `npm run lint` passed cleanly with 0 warnings.
  - `npm test` passed 39 unit tests (100% green).
  - `npm run build` completed successfully with the correct production bundle output.
  - `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3333 npm run test:e2e` passed all 32 Playwright E2E tests cleanly (100% green).

## 2026-05-27 (Second Round 22 Follow-up Review)

- Completed subtask: review rotation loops, partial overhang, snap settings, and review checklist conflict.
  - Added a supplemental review section to `REVIEW.md` covering the current two-state rotation mappings, missing 90/180/270/360 cycles, hard-coded 50% support threshold, non-persistent snap toggles, dragover/drop snap mismatch, and overlap between the review checklist and compliance diagnostics.
  - Planned the next refactor phases: orientation state model, configurable support policy, user-level placement settings, and a field-review checklist that no longer duplicates diagnostics.
- Verification: documentation-only change; code verification not rerun.

## 2026-05-27 (Second Round 22 Follow-up Refactor)

- Completed subtask: implement the rotation, support-policy, snap-setting, and review-checklist refactor from the supplemental review.
  - Reworked manual placement rotation so `R` cycles horizontal quarter turns while preserving the current vertical axis, `Shift+R` cycles downward turns, and labels remain readable with `H/I` orientation markers.
  - Added user-level placement settings for grid, edge, Z, surface snap, and partial-overhang support policy; manual validation, 3D preview, and final drop now read the same policy.
  - Split floating support issues into blocking errors and field-review warnings when partial overhang is allowed.
  - Changed the review checklist into field action items and stopped duplicating compliance diagnostics, while keeping diagnostic IDs as links for unplaced-cargo follow-up.
- Verification: `npm run lint` passed; `npm test` passed 27 test files / 167 tests; `npm run build` passed with the existing Vite chunk-size warning; `npm run test:e2e` passed 70 tests with 1 existing responsive 3D test skipped.
- Deployment and remote verification: deployed to `cargo-server` with backup `/root/cargo_project-backup-20260527-072510`; public `http://101.33.232.150/` returned HTTP 200; `PLAYWRIGHT_BASE_URL=http://101.33.232.150/ npm run test:e2e` passed 70 tests with 1 existing responsive 3D test skipped.
- Remote performance check: `nginx` and `cargo-server.service` were active; load average stayed around `0.05, 0.06, 0.01`; available memory was about 2 GB; local remote curl returned HTTP 200 in roughly 0.00025-0.00035 s; 20 public homepage samples all returned HTTP 200 with average about 182 ms. Nginx error tail only showed external `/v1/models` scan 404s, not app errors.

## 2026-05-27 (Deploy Alias Correction)

- Completed subtask: align deployment documentation and script defaults with the working SSH alias.
  - Changed the default deploy SSH host from the stale `tencent-container-layout` alias to `cargo-server`, matching the current `~/.ssh/config` entry used for the successful deployment.
- Verification: `npm run deploy -- --dry-run` printed `Target: cargo-server` and all remote commands using `cargo-server`; `npm run lint` passed.
