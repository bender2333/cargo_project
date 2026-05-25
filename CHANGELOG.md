# Changelog

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
