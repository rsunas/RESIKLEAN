# Staff History final-spec implementation and read-only audit

Audit date: **2026-11-07, Asia/Manila**. This replaces the earlier History layout
report. No database writes, corrections, deletions or deployments were performed.

## Layout delivered

- Existing logo header and page title preserved.
- Summary uses matching stat columns, a vertical divider, 30px bold base font
  for both values, 16px unit, 13px labels, no `adjustsFontSizeToFit`. Grouping and
  at most two decimals below 1,000,000; compact notation from 1,000,000.
- Record cards remove the truck badge/chips. The area is one ellipsized line;
  driver/date/time share the second line. The right side is a non-shrinking
  18px amount and chevron. Full area remains in submission details.
- Length/Width/Height/Slope are four equal columns below a thin divider. Cards
  have no fixed height or clipping overflow; padding/radius/structure are shared.
- Pending-sync text stays in the metadata line and accessibility label rather
  than adding an extra line that changes card height. Details retain full status.
- Native Text is used for the new exact base font sizes so AppText's additional
  1.1 multiplier does not turn 30px into 33px. OS accessibility font scaling is
  preserved. Summary numbers and measurement values can scroll horizontally
  within their columns if necessary rather than auto-shrink or cut off digits.
- Current tonnage calculations and underlying data are unchanged. Compact
  notation does not repair the data; accessibility text retains full amounts.

## All database records, sorted by current UI tonnage descending

Queried **all 13 TruckLoad documents**, not a page or a single staff account.
Also queried all 14 registry trucks. The script reads stored estimates in
descending order, calculates the same metre formula used by Staff History and
Profile, then sorts the full result by that displayed tonnage. Both quantities
are shown here because they disagree on historical records.

Dates use the actual stored `arrivedAt`, displayed below in **Asia/Manila**.
`—` means the field is absent; it is not a fabricated stored zero. Current UI
calculation uses zero slope and 0.294 density when those fields are absent.
Stored decimal values below are shown without binary floating-point noise.

| ID | Date/time (2026, Manila) | Stored dimensions L × W × H | Stored slope m³ | Stored estimate t | Current UI t | Finding |
| --- | --- | --- | --- | --- | --- | --- |
| `6a86ab20d2aa7e37b93d7406` | Aug 20, 3:22 PM | 45000 × 20000 × 18000 | — | 4,860,000 | **4,762,800,000,000** | Dimensions + estimate mismatch |
| `6a86ae32d2aa7e37b93d7439` | Aug 20, 3:35 PM | 200 × 300 × 400 | — | 7.2 | **7,056,000** | Dimensions + estimate mismatch |
| `6a903ad488a056a42c810a72` | Aug 27, 9:25 PM | 450 × 200 × 180 | 0.5 | 4.9098 | **4,762,800.147** | Dimensions + estimate mismatch |
| `6a86d76296e86d434a557eeb` | Aug 20, 6:30 PM | 450 × 200 × 180 | — | 4.86 | **4,762,800** | Dimensions + estimate mismatch |
| `6a89b425033ffc3d37f0c856` | Aug 22, 10:37 PM | 450 × 200 × 180 | 0 | 4.7628 | **4,762,800** | Dimensions + estimate mismatch |
| `6a89122898b7c61047cae127` | Aug 22, 11:06 AM | 500 × 200 × 150 | 0.5 | 4.557 | **4,410,000.147** | Dimensions + estimate mismatch |
| `6a83cb7d8351fe0a5cf849f5` | Aug 18, 11:03 AM | 400 × 200 × 150 | — | 3.6 | **3,528,000** | Dimensions + estimate mismatch |
| `6a8981327487cdee8fe96492` | Aug 22, 7:00 PM | 2 × 3 × 4 | 1 | 0.294007056 | 7.35 | Stored estimate mismatch only |
| `6a89b328033ffc3d37f0c825` | Aug 22, 10:33 PM | 2 × 3 × 4 | 1 | 0.294007056 | 7.35 | Stored estimate mismatch only |
| `6ac70fce788e0ca2e645f20d` | Oct 8, 11:36 AM | 5 × 2.36 × 0.9 | 1 | 0.29400312228 | 3.41628 | Stored estimate mismatch only |
| `6adad2a1fdd7102b6f760dbb` | Oct 23, 11:21 AM | 4.57 × 2.3 × 1 | 1 | 3.384234 | 3.384234 | Consistent |
| `6ac5d8a30660735ee9611bf7` | Oct 7, 1:29 PM | 4.57 × 2.3 × 1 | 0 | 0.000003090234 | 3.090234 | Stored estimate mismatch only |
| `6ad84014a9ade3c55060be9e` | Oct 21, 12:31 PM | 3 × 2 × 0.67 | 0.5 | 1.32888 | 1.32888 | Consistent |

Seven records exceed the proposed dimension bounds; four additional records
have inconsistent stored derived values. No other records were omitted.

The nine-record account in the screenshot is staff ID
`6a80562c8d3947226e212ecd`. Its recomputed total remains
**4,762,821,344,421.353 t**, displayed as **4,762,821,344,421.35 t** before compact
formatting. The single 45000-row accounts for 4,762,800,000,000 t. The Aug 22/27
pair alone explains only 9,525,600.147 t, as the user suspected.

## Cause: evidence versus uncertainty

1. Before commit `34924c1` (Aug 20, 17:12 Manila), Staff had editable metre
   inputs and a local-only submission handler. Its comment described a future
   conversion to centimetres for the API, but it did not POST those submissions.
2. `34924c1` connected the real API, locked the dimensions to registry values,
   labelled them cm and passed them unchanged. The largest two bad entries were
   recorded earlier that afternoon, so their exact client/input path cannot be
   established from this later commit. There is no client-version/audit trail in
   the queried records identifying their source.
3. Registry `ABC-1234`, ID `6a82aa7676817d8974a0c2cc`, still contains
   **450 × 200 × 180**, with createdAt and updatedAt both
   **2026-08-17T06:30:14.201Z**. That is direct evidence of cm-shaped registry data.
4. The old TruckLoad hook explicitly calculated `(L × W × H) / 1,000,000`.
   Commit `be2dd2f` (Oct 8) changed it to `L × W × H` for metres. No corresponding
   correction of the old records is present in the database. Current mobile
   History/Profile recompute from dimensions using that metre interpretation.
5. The Aug 22/27 450 × 200 × 180 records store volumes of 16.2 m³ and tonnage
   4.7628/4.9098, corroborating centimetres, not millimetres. Conversely the four
   plausible-metre rows in the table still store volumes divided by 1,000,000.
6. Today's admin form labels metres and sends `Number(form.length/width/height)`
   without multiplying. No current ×100/×1000 conversion bug was found there.
7. **45000 × 20000 × 18000 is not safely explained by ordinary cm or mm input.**
   Dividing by 100 yields 450 × 200 × 180 m; dividing by 1000 yields
   45 × 20 × 18 m, both unrealistic. Reaching 4.5 × 2 × 1.8 needs division by
   10000. A double conversion or malformed test input is plausible, not proven.

The main issue is mixed historical units without a data migration, plus at least
one further malformed input. It is not string concatenation. The earlier audit's
claim excluding an unlocked input flow was too strong; the timestamps do not
support excluding every older/external submission path.

## Proposed repair — awaiting explicit confirmation

Do not run a blanket unit conversion. Back up the exact affected documents first.

| Record/registry | Proposed action |
| --- | --- |
| Truck `6a82aa7676817d8974a0c2cc` (ABC-1234) | Confirm actual load-space measurements, then change to 4.5 × 2 × 1.8 m |
| Load `6a83cb7d8351fe0a5cf849f5` | Confirm 4 × 2 × 1.5 m |
| Load `6a86ae32d2aa7e37b93d7439` | Confirm 2 × 3 × 4 m; NCT-001 registry already has these metre values |
| Loads `6a86d76296e86d434a557eeb`, `6a89b425033ffc3d37f0c856`, `6a903ad488a056a42c810a72` | Confirm 4.5 × 2 × 1.8 m; preserve recorded slopes |
| Load `6a89122898b7c61047cae127` | Confirm 5 × 2 × 1.5 m; preserve slope 0.5 |
| Load `6a86ab20d2aa7e37b93d7406` | Recommend deletion only if confirmed disposable test data; otherwise require verified actual dimensions rather than assume a conversion |
| Four plausible-metre rows marked estimate mismatch only | Preserve dimensions; reconcile stored volume/tonnage using confirmed density |

The Aug 22/27 corrections would produce **4.7628 t** and **4.9098 t**, matching
the existing stored estimates and the supplied design's 4.91 t example. Four
older records have no densityFactor; stored totals are consistent with 0.3,
whereas today's UI fallback is 0.294. Confirm whether historical density should
be preserved before reconciling their derived estimates. No missing slope or
density fields have been silently backfilled.

## Dimension guardrails — confirmation before further changes/deployment

Proposal: inclusive **length 1–12 m, width 1–3 m, height 0.3–4 m**, finite numbers
only, explicit metre labels, reject out-of-range values without guessing units.
These are entry-error guardrails, not legal vehicle dimensions.

The user approved these exact limits earlier, and the earlier backend/admin
implementation remains in the working tree (API create/update and Staff submit,
Mongoose schemas, HTML min/max and form validation). **This final-spec task made
no new validation changes and did not deploy them.** Confirm retaining these
limits under the renewed spec before further validation work/deployment.

History and Profile still sum the same unmodified `history[].tonnes`. Both
therefore retain the same enormous underlying nine-entry total. A post-repair
comparison is pending approval and actual data correction; it is not reported
as completed.

## QA and changed files

- `mobile/app/staff.tsx`: final History layout/formatting only. Input, Profile,
  fetching, ordering, queue/sync and details action are unchanged. The previous
  modal-backdrop fade fix is preserved.
- `mobile/scripts/check-staff-history.cjs`: updated actual-source rendering and
  regression checks for four equal columns, identical card heights, both stat
  fonts, amount fonts, containment, empty state and compact thresholds.
- `backend/scripts/audit-truckload-units.js`: read-only full audit, no models,
  hooks, index creation or writes. Includes both stored/UI tonnage and reasons.
- This report and a supersession/correction note in the earlier audit report.

Headless Edge/React Native Web checks use actual JSX/styles at **360px**, **1× and
2×** text scales, and **0, 1, 4, 50** records. Fixtures include long and missing
areas, long driver names, pending records, four supplied dimension examples and
the 45000-shaped outlier. All eight cases passed; card heights were uniformly
122px at 1× and 185px at 2× within each test. Summary values retained their 30px
base font and amounts their 18px base font. Numeric horizontal scrolling keeps
oversized values accessible; area/metadata remain one-line ellipsized text.

These browser checks are not native Android interaction/font-metric verification.
No connected phone was used. Mobile lint was attempted but cannot run because
the workspace does not have ESLint installed. `tsc --noEmit` finished with the
same 20 existing errors in template components (`explore`, `animated-icon`,
`app-tabs`, `collapsible`, `use-theme`), none in the changed Staff screen.
Supplemental Oxlint on the changed screen/test/audit script exited successfully
with three existing unused-state-setter warnings in Staff; no errors.

Reproduce (from mobile): `node scripts/check-staff-history.cjs`.
Read-only audit (from backend): `node scripts/audit-truckload-units.js`.
The optional `AUDIT_DNS_SERVERS` variable sets only the audit process's DNS
resolver when the environment's SRV lookup is unavailable.
