# Announcements

The admin dashboard's Announcements tab uses real routes as areas and the existing truck registry. No mobile code has been changed. The resident News tab still needs its separate integration before it displays these announcements.

## Running and verifying

Use the existing web and backend environment variables, MongoDB connection, Cloudinary credentials, JWT secret and optional Expo access token. No new external service is needed. Start the backend and dashboard normally.

The supplied artwork is committed as `web-dashboard/src/assets/announcement-bg.jpg`. To regenerate the softened version, run `npm run prepare:announcements` in `web-dashboard`. Fonts are bundled locally. The preview and image export use the same 1200 × 675 component; JPEG exports are 2400 × 1350 and limited to 1 MB.

Checks (all external services are mocked):

- Backend: `node --test tests/announcements.node-test.cjs`
- Browser: `node scripts/check-announcements.mjs` from `web-dashboard`. Uses the installed Edge browser; set `QA_BROWSER` to another Chromium executable if necessary. Screenshots and an exported JPEG go in ignored `dist/qa/`.
- Web: `npm run build` and `npm run lint`.

Shared enums and template logic live in `backend/src/shared/announcements.json` and `announcements.mjs`; the web build imports them directly. Build from a checkout containing both the backend and web-dashboard directories. The backend requires a current Node release supporting ESM JSON import attributes (Node 22.12+).

## API

All responses use `{ success, data }` or `{ success: false, error }`.

| Endpoint | Access | Purpose |
| --- | --- | --- |
| GET `/api/admin/announcements/options` | Admin | Active routes and trucks |
| GET `/api/admin/announcements?page=1&limit=10` | Admin | Paginated records, including drafts |
| GET `/api/admin/announcements/:id` | Admin | Full record |
| POST `/api/admin/announcements` | Admin | Create a draft or publish |
| PATCH `/api/admin/announcements/:id` | Admin | Edit, publish, or unpublish |
| DELETE `/api/admin/announcements/:id` | Admin | Remove record and Cloudinary image |
| GET `/api/announcements?page=1&limit=10` | Resident | Published announcements matching the resident's area, plus All areas |

Create/edit accepts multipart fields `type`, `reason`, `areaId` (`all` or route ID), `affectedTruckId` (empty for all trucks), `date` (`YYYY-MM-DD`), `time` (`HH:mm`), `impact`, `newDate`, `message`, `status`, and optional `image`. Images must be JPEG/PNG and no larger than 2 MB. Dates and times are interpreted in Asia/Manila and stored in UTC.

Create also requires a stable `requestKey` (the UI uses a UUID) to make retries idempotent. Edits require `version` from the returned `__v`; stale edits return 409. Publishing requires a nonempty message and an image. Changing published artwork fields requires a replacement image. Saving such changes as a draft invalidates the old image.

## Delivery and privacy

The public feed and `announcement:new` socket payload use an explicit allowlist. Truck details, creator, image public ID, notification metadata and request keys are excluded. Resident targeting matches the selected route ID or its stored barangay labels against resident barangay/location; All areas targets all residents. Route labels and audience barangays are snapshotted when saved.

First publication emits the sanitized event to administrators and matching residents' authenticated rooms. Expo notifications respect the resident's global, push, announcement and individual token settings. Editing or republishing does not alert residents again. A persisted claim favors avoiding duplicate alerts; delivery is best-effort, and a process failure after the claim can leave a notification undelivered. Saving can succeed even when delivery fails; the API returns a warning in that case. No production notifications are sent by the tests.

Live MongoDB persistence, Cloudinary delivery and physical-device notifications still need verification in the deployment environment. The existing mobile News screen is deliberately unchanged.
