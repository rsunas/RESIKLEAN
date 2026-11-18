# Collection Overview metrics

This feature changes the admin web dashboard and backend only. Existing mobile uploads are used unchanged. No mock values or sample route names are used by production components.

## Endpoints

All endpoints are under `/api/admin/overview` and require the existing admin JWT authorization:

| Endpoint | Parameters |
| --- | --- |
| `coverage` | `range=today\|7d\|month`, optional `area` (exact barangay name) |
| `daily-completion` | `range=7d\|14d` |
| `complaints-by-status` | `range=all\|today\|7d\|month` (defaults to `all`), optional `area` |
| `stops-by-hour` | `range=today\|7d\|month`, optional `area` |
| `frequently-uncompleted` | Fixed last 30 days, across areas |

Responses use `{ success, data }` with `start`, `end`, `timezone`, and `lastSyncedAt`. Stop metrics also expose `incomplete` and a human-readable `note`. Refresh runs every minute while the dashboard is visible and when returning to the tab; failed refreshes show a retry state rather than silently displaying stale figures.

## Counting and history

- Completion evidence is the existing `RouteLog.status=collected`. The existing review flag does not change that status or the complaint workflow.
- Mongo groups logs by route ID, stop ID and the Manila calendar date of `collectedAt`, independent of collector, client ID, or retry. Hour buckets use the earliest recorded exit time (entry time for legacy logs without exits).
- A known route/day's stops form its scheduled denominator. Multiple trip sessions do not multiply that denominator. Current scheduled assignments supply today's itinerary; frozen trip snapshots supply historical names, barangays and stops.
- There is no historical schedule revision table. For past dates without snapshots, the current schedule is used only if the route has not changed since that day and already existed. Missing itineraries are explicitly reported as partial, with affected rates unavailable. Confirmed logs without a known itinerary are retained in completed totals and hourly charts; no invented stops are added to the denominator.
- Daily average is the arithmetic mean of available daily rates, excluding days with no scheduled stops. The comparison is the immediately preceding equal-length period. The period average/comparison is withheld if historical schedule information is incomplete.
- Remaining counts are known scheduled stops without a completion. The frequently uncompleted ranking counts these only after explicit `routeCompletedAt` or after the Manila collection day has ended. Stopping GPS recording alone does not close today's route. Late uploads can reduce missed counts.
- `lastSyncedAt` comes from actual record receipt/update timestamps, never the dashboard request time. No matching uploaded records returns `null`.
- Complaints default to all dates; the card has its own date filter (all dates, today, last 7 days, this month). A selected period filters by submission date and current status. The actual enum has five states: `scheduled` is grouped with `verified` to provide the requested four displayed categories. The UI explains this grouping. An empty result keeps a neutral empty pie visible with zero counts.
- Indexes support the completion date/status query, session start-date query and report submission-date query. Standard Mongoose index deployment applies; environments with `autoIndex` disabled must deploy those schema indexes through their normal database migration process.

## Validation

Backend: `npm test -- --runInBand overviewMetrics overviewEndpoints routeSnapshot routeCompletionState adminNotifications`

Web: `npm run lint`, `npm run build`, `node scripts/check-overview-metrics.mjs`.

The browser check uses isolated test fixtures (never production responses), verifies shared filters, keyboard chart access, responsive layout, dark colors and failure states, and writes screenshots to ignored `web-dashboard/dist/qa`.
