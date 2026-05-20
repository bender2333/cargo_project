# FEATURE_SPEC.md

## New Requirement: Support AI-assisted Excel Import
## Date: 2026-05-19
## Scope: `/home/bender/projects/cargo_project/container-calc`

---

## Background
Current XLSX import in the container loading project only supports a narrow predefined schema, such as:
- `label`
- `name`
- `length` / `Length mm`
- `width` / `Width mm`
- `height` / `Height mm`
- `weight` / `Weight kg`
- `quantity`

A real business workbook provided for testing (`俄罗斯整托装柜尺寸.xlsx`) uses a different schema and language:
- `托盘`
- `整托重量kg`
- `长cm`
- `宽cm`
- `高cm`

Because of this mismatch, the current import path accepts the file upload interaction but fails business import compatibility: imported rows do not enter the cargo dataset used by the `Load` action.

---

## Requirement Name
**我们需要支持Excel的导入**

---

## Goal
Support real-world Excel imports even when:
- headers are in Chinese or other languages
- units differ from internal expectations (for example `cm` vs `mm`)
- column names are semantically equivalent but not identical to the internal schema

The system must use an LLM-assisted normalization step to map raw spreadsheet data into the internal cargo format before import.

---

## Functional Requirement 1: Upload and parse raw Excel
- The UI must continue to accept `.xlsx` / `.xls` files from the import control.
- The frontend or backend import pipeline must first extract raw sheet structure:
  - sheet names
  - header row candidates
  - row count
  - sample rows
- The raw extracted workbook data must be preserved long enough for an LLM normalization step.

### Acceptance Criteria
- User can select a workbook in Excel format.
- System can read at least the first worksheet and inspect headers/rows.
- If workbook cannot be parsed at all, the user sees a clear parse failure message.

---

## Functional Requirement 2: LLM-assisted schema mapping
The system must support an LLM stage that receives raw workbook metadata and row samples, then determines whether the sheet contains enough information to map into the internal cargo model.

### Internal target fields
The LLM-normalized output must produce, per item:
- `label`
- `name`
- `length`
- `width`
- `height`
- `weight`
- `quantity`
- optional `color`
- optional `canRotate`
- optional `stackable`

### LLM responsibilities
The LLM must:
1. identify semantically matching columns across languages
2. infer units when possible
3. normalize values into the internal expected units
4. detect whether sufficient required fields are present

### Example mappings
Possible mappings include:
- `托盘` → `label`
- `整托重量kg` → `weight`
- `长cm` → `length` (with unit conversion to internal unit if needed)
- `宽cm` → `width`
- `高cm` → `height`

---

## Functional Requirement 3: Required-field validation
The LLM import layer must automatically check whether the workbook contains enough required data.

### Case A: required data is insufficient
If required fields cannot be reliably inferred, the system must show a prompt or warning explaining what is missing.

#### Required behavior
- Tell the user which required dimensions/fields are missing or ambiguous.
- Do not silently import partial/broken cargo rows.
- Do not pretend import succeeded.

### Case B: required data is sufficient
If enough data is present, the system must normalize and import directly into the cargo dataset.

#### Required behavior
- Converted rows must appear in the cargo items list.
- Clicking `Load` must use these imported rows for layout calculation and 3D rendering.
- Results panel, layer data, and 3D scene must all reflect the imported dataset.

---

## Functional Requirement 4: Unit normalization
The import pipeline must support unit normalization.

### Minimum requirement
- If source workbook uses `cm`, convert to the project’s internal unit expected by packing logic.
- Weight units must remain consistent and explicit.

### Acceptance Criteria
- Imported values should not be treated as raw internal values if headers explicitly indicate other units.
- Conversion rules must be deterministic and visible in code.

---

## Functional Requirement 5: Import status transparency
The system must report import status clearly.

### Success state
- Number of imported rows
- Any inferred mappings used
- Any automatic conversions performed

### Warning state
- Rows skipped
- Missing fields
- Ambiguous columns
- Unsupported sheet structure

### Failure state
- Parsing failure
- No usable data found
- LLM mapping failure

---

## Functional Requirement 6: E2E business-file validation
A real workbook must be stored in the project as a reusable test fixture and used in automated browser testing.

### Required fixture
Store the provided workbook under a dedicated folder such as:
- `test-data/excel/俄罗斯整托装柜尺寸.xlsx`

### Required E2E coverage
Automated tests must verify all of the following using the real workbook:
1. upload the workbook
2. import succeeds or produces the expected structured warning
3. imported items are visible in the cargo list
4. clicking `Load` uses imported items in downstream results
5. results panel updates
6. 3D canvas remains visible and interactive
7. export round-trip produces an Excel file with expected normalized fields

---

## Non-Goals
This requirement does not yet require:
- support for arbitrarily complex merged-sheet workbook layouts across multiple tabs
- OCR of image-based spreadsheets
- user-authored manual column mapping UI unless LLM mapping is insufficient

---

## Implementation Notes
- Prefer a deterministic extraction layer first, then LLM semantic mapping.
- Keep LLM output structured (JSON schema / typed mapping result).
- Required fields should be validated before cargo state mutation.
- Business import success must be defined by downstream `Load` behavior, not just file upload acceptance.

---

## Suggested Deliverables
1. import design note describing extraction → LLM mapping → validation → normalization → cargo state update
2. reusable test fixture folder for real spreadsheets
3. automated Playwright test using the real workbook
4. user-facing warning messages for missing or ambiguous fields
5. unit tests for mapping/normalization logic
