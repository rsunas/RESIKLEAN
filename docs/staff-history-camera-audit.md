# Staff History, historical units and camera audit

The History layout and data findings below are superseded by
[the final-spec audit](staff-history-final-audit.md), dated 2026-11-07.
Camera findings remain applicable. See the newer report for the corrected
timeline of the earliest submissions versus the locked-dimensions flow.

Date: 2026-11-06. Database checks were read-only. No records were corrected,
backfilled or deleted, and no deployment was performed.

## History layout

The list is a ScrollView with mapped records, not a virtualized list. It has no
fixed item-height/getItemLayout configuration. The old four text chips could
shrink and wrap internally; the chip row did not explicitly start-align its
children. HeroUI Card inherits Surface's `overflow: hidden`. Those combined
styles made taller/wrapped chips vulnerable to clipping. Tonnage explicitly
used `adjustsFontSizeToFit` and a shrinking right-hand column.

Record cards now use a content-sized View, with the same padding/radius for all
records. Two non-growing, non-shrinking chip wrappers contain dimensions and
slope, and wrap as whole chips with a 6px gap. The right-hand amount/date block
does not shrink. Amounts use 18px/tabular numbers, two decimal places and compact
notation at 100,000 or above; full values remain in accessibility text/details.
Missing areas say `No area assigned`. The area can occupy two lines. Large text
allows the amount/date block to move below the name rather than squeeze it.

Fetching, record ordering, queue logic, detail navigation and total calculations
are unchanged. Compact formatting is not a data correction.

## Historical unit evidence

- Commit `34924c1` (2026-08-20, 17:12 Manila) populated/locked Staff dimensions
  from the registry and labelled them centimetres. The largest bad entry is
  earlier that afternoon, so this alone cannot establish its input flow.
- The old TruckLoad calculation divided L × W × H by 1,000,000 (cm³ to m³).
- Commit `be2dd2f` (2026-10-08) changed the schema documentation to metres and
  removed that division. Existing centimetre records remained in the database.
- The present admin form labels dimensions in metres and sends numeric inputs
  unchanged; it does not multiply them by 100. Previously there were no upper
  bounds to stop historical centimetre-shaped inputs.
- Registry truck `6a82aa7676817d8974a0c2cc` (`ABC-1234`) still has
  **450 × 200 × 180**, created and last updated 2026-08-17T06:30:14.201Z.
- Recomputing the affected nine-entry account with the current metre formula
  gives **4,762,821,344,421.353 t**, reproducing the displayed
  **4,762,821,344,421.35 t**. This is a unit/data problem, not string concatenation.

### Out-of-range submissions (seven)

Dates below refer to the existing `arrivedAt` day in Asia/Manila. Proposed
dimensions are **not applied**. They need confirmation against the actual truck.

| TruckLoad ID | Date | Truck | Stored L × W × H | Proposed disposition |
| --- | --- | --- | --- | --- |
| `6a83cb7d8351fe0a5cf849f5` | Aug 18 | ABC-123 | 400 × 200 × 150 | Confirm 4 × 2 × 1.5 m |
| `6a86ab20d2aa7e37b93d7406` | Aug 20 | ABC-1234 | 45000 × 20000 × 18000 | Recommend deleting this malformed test entry only if confirmed disposable; otherwise obtain actual dimensions before correcting |
| `6a86ae32d2aa7e37b93d7439` | Aug 20 | NCT-001 | 200 × 300 × 400 | Confirm 2 × 3 × 4 m; current registry has those metre values |
| `6a86d76296e86d434a557eeb` | Aug 20 | ABC-1234 | 450 × 200 × 180 | Confirm 4.5 × 2 × 1.8 m |
| `6a89122898b7c61047cae127` | Aug 22 | NCT-002 | 500 × 200 × 150 | Confirm 5 × 2 × 1.5 m |
| `6a89b425033ffc3d37f0c856` | Aug 22 | ABC-1234 | 450 × 200 × 180 | Confirm 4.5 × 2 × 1.8 m; slope 0 → 4.7628 t |
| `6a903ad488a056a42c810a72` | Aug 27 | ABC-1234 | 450 × 200 × 180 | Confirm 4.5 × 2 × 1.8 m; slope 0.5 → 4.9098 t |

The Aug 22/Aug 27 rows already store `tonnesEstimate` 4.7628/4.9098, respectively,
which supports the centimetre interpretation. Current consumers recompute from
their dimensions as metres, producing 4,762,800/4,762,800.147 instead.

The 45000-row alone currently recomputes to 4,762,800,000,000 t. Available history
does not establish who entered it or why it was multiplied again. Do not apply
a universal divide-by-100 or divide-by-10000 migration.

### Additional derived-value inconsistencies

These four records have plausible metre dimensions but stored estimates from
the old centimetre calculation. Do **not** divide their dimensions by 100:

| TruckLoad ID | Dimensions; slope | Stored tonnesEstimate | Current metre calculation |
| --- | --- | --- | --- |
| `6a8981327487cdee8fe96492` | 2 × 3 × 4; 1 m³ | 0.294007056 | 7.35 t |
| `6a89b328033ffc3d37f0c825` | 2 × 3 × 4; 1 m³ | 0.294007056 | 7.35 t |
| `6ac5d8a30660735ee9611bf7` | 4.57 × 2.3 × 1; 0 m³ | 0.000003090234 | 3.090234 t |
| `6ac70fce788e0ca2e645f20d` | 5 × 2.36 × 0.9; 1 m³ | 0.29400312228 | 3.41628 t |

A separately approved repair should back up affected documents, confirm units
per record, correct the registry, and reconcile derived volume/tonnage fields
using the agreed density. Then compare History and Profile totals again. That
post-repair check is pending: no correction has been authorized yet.

## Approved guardrails

User approved inclusive metre ranges: length 1–12, width 1–3, height 0.3–4.
Implemented on admin create/update, new Staff submissions, both Mongoose
schemas, and the admin registration/edit form. Inputs are never auto-converted.
An idempotent retry of an already-saved submission still returns its original
record before new-entry validation.

Existing historical data can still be read. New submissions using the bad
ABC-1234 registration will be rejected until the registration is corrected.
The existing offline queue retains failed HTTP-400 submissions with their error;
these changes do not delete them or rewrite queued dimensions.

## Camera

User reports a crash after taking either the first or second photo. Phone model
and native crash logs are not yet available; no device was connected to ADB.
The exact native crash cause is therefore **not confirmed**.

Concrete risks addressed:

- The capture busy flag was set after an asynchronous permission request. A
  synchronous ref now locks the whole permission/camera/processing sequence.
- Removed the separate permission pre-warm request, avoiding competing requests.
- Native ImageManipulator context and rendered-image references now release in
  `finally`, on success and errors, instead of waiting for garbage collection.
- Local file size checks use filesystem metadata, not a JS Blob containing the
  photo. Existing 1600px/JPEG optimization and no-base64 camera settings remain.
- Snapshot save failure stops camera launch with a visible error; it is no
  longer silently ignored. Android recovery checks the Staff context and shares
  the capture lock. StrictMode replay does not consume recovery twice.
- Original camera cache files are not deleted during optimization, so recovery
  does not lose its source URI. These remain cache files, not gallery exports.

These are reliability fixes, not a guarantee against OS process termination or
device-specific camera bugs. On the affected phone, retest repeated side/back
captures and background return. If it closes again, collect Android crash logs
and provide the phone model/Android version before further native changes.

## Verification

- Backend: **102 tests passed** across seven suites, including 51 new range,
  browser/API parity and schema checks.
- Photo helper: **7 tests passed**, including two successive captures and native
  resource release after render/save/filesystem failures. These mock native APIs;
  they do not reproduce a device crash.
- Actual History JSX and styles rendered through React Native Web in headless
  Edge: 0, 1, 4 and 50 records, width 360px, text scales 1× and 2× (including
  AppText's existing 1.1 multiplier), long and missing area/driver values.
  All eight cases passed card/chip containment and equal chip-height checks.
  Chips measured 26px at normal text and 44px at 2×; no clipping/overflow detected.
  Native Android font metrics/touch interactions still need device verification.
- Dashboard production build passed (existing bundle-size warning).
- Mobile typecheck reports 20 errors in existing template files (`src/app/explore`,
  `animated-icon`, `app-tabs`, `collapsible`, `use-theme`); none in changed Staff,
  proof-photo or camera-recovery code.
- Mobile lint cannot run: ESLint is absent from this installation.
- Dashboard full lint fails on the existing conditional `useMemo` in
  `src/pages/Dashboard.jsx`, with other existing warnings.
- Targeted lint for the changed truck-registration component and browser
  dimension utility passes.

### Files changed for this task

- `mobile/app/staff.tsx`: History layout/formatting and camera sequencing/recovery.
- `mobile/src/lib/proof-photo.ts`: explicit native image cleanup.
- `mobile/src/lib/camera-recovery.ts`: report snapshot persistence failures.
- `backend/src/utils/truckDimensions.js`, `backend/src/models/Truck.js`,
  `backend/src/models/TruckLoad.js`: shared approved limits and schema validation.
- `backend/src/controllers/admin.controller.js`,
  `backend/src/controllers/staff.controller.js`: API input validation.
- `web-dashboard/src/utils/truckDimensions.js`,
  `web-dashboard/src/components/TruckManagementPanel.jsx`: form limits/messages.
- `backend/tests/truckDimensions.test.js`, `mobile/scripts/proof-photo.test.cjs`,
  `mobile/scripts/check-staff-history.cjs`: regression/fixture checks.

Other pre-existing worktree changes were preserved.

Reproduce local checks:

```powershell
cd D:\RESIKLEAN\backend
npm test -- --runInBand
cd D:\RESIKLEAN\mobile
node --test scripts/proof-photo.test.cjs
node scripts/check-staff-history.cjs
```

The History check creates temporary HTML/browser-profile artifacts, does not
load the app's API/auth/SQLite modules and does not access the database. It uses
the installed Windows Edge binary; `EDGE_PATH` can override that location.
