# PM Design Review - Round 22

Date: 2026-05-26

## Scope

This review translates `REVIEW.md` round 22 into product and interaction boundaries before implementation. The goal is not to add more isolated controls; it is to make the workbench clearer for three jobs:

- Plan: import data, choose rules, calculate packing.
- Edit: manually place, rotate, align, and validate boxes.
- Review: inspect layers, measure clearance, replay work steps, and inspect center of gravity.

## PM Assessment

### Measurement ruler

Score: 8/10

The requirement is strong because it answers a real loading question: "Can this still move, and how much clearance remains?" A 10/10 implementation should avoid a CAD-style freeform measurement tool as the first version. The first version should be box-aware and operational:

- selected box clearance to container walls, ceiling, door side, and nearest neighboring boxes;
- optional point-to-point distance after that baseline works;
- mm-first display with compact labels that do not hide the cargo label.

Decision: implement box-aware clearance first, then add arbitrary two-point measurement if the first version is stable.

### Manual six-orientation rotation

Score: 9/10

This is a core correctness gap. Manual placement must use the same orientation model as automatic packing. A 10/10 implementation needs an explicit orientation picker because shortcuts alone are undiscoverable.

Decision: manual placement gets a visible orientation selector with the six canonical keys. `R` remains horizontal rotation; `Shift+R` cycles through all valid orientations. The renderer must consume `orientationKey` and `labelRotationDeg` from the draft/result, not infer them from dimensions.

### Excel template import

Score: 7/10

Template import is important, but it has a larger persistence and UX surface than the other review items. A good first version should make saved deterministic mappings reusable. It should not attempt to solve every spreadsheet layout pattern.

Decision: introduce user-scoped import templates with fixed row/header settings, unit strategy, and field mapping. Keep parsing deterministic and preview-driven. Defer complex merged-cell normalization unless a real fixture requires it.

### Layer view naming

Score: 10/10

"逐层添加" creates the wrong product promise. The feature is viewing/reviewing layers, not adding by layer.

Decision: use "分层查看 / Layer view" everywhere for review/filter UI. Any future layer-based editing belongs under manual placement.

### Gravity field vs packing view

Score: 8/10

The current conflict is not a rendering bug only; it is a view-mode problem. Users need to know whether they are inspecting packing geometry or load-balance risk.

Decision: add explicit CoG view modes:

- Packing view: normal boxes, gravity field hidden by default.
- CoG view: boxes subdued, gravity field and safe range emphasized.
- Mixed view: both visible with controlled opacity/intensity.

## Information Architecture

Result workspace tabs remain:

- 2D
- 3D
- 分层查看 / Layer view
- 明细表 / Details
- 合规与诊断 / Diagnostics
- 装载重心 / Balance
- 作业回放 / Playback
- 导入日志 / Import log

Tool ownership:

- Measurement belongs to the 2D/3D review toolbar.
- Orientation belongs to the manual placement toolbar and precise panel.
- Template import belongs to Excel import, not the cargo item editor.
- CoG view mode belongs to the Balance panel but affects the 3D scene.

## Interaction Rules

1. Measurement overlays must never mutate packing data.
2. Manual orientation changes must mutate the manual draft through one model path.
3. Layer view must only filter existing `PackingResult.layers` or manual-adapted placed boxes.
4. Template import must always show a preview before replacing `cargoItems`.
5. CoG mode changes must not trigger recalculation; they only change rendering state.

## Implementation Order

1. Rename "逐层添加" to "分层查看" and add regression coverage.
2. Implement measurement library and selected-box clearance overlay.
3. Implement six-orientation manual rotation and visible orientation picker.
4. Add deterministic import-template model/API/UI.
5. Add CoG view mode and gravity-field visibility strategy.

This order keeps the highest-risk UI overlays from blocking the core manual-placement correctness fix.
