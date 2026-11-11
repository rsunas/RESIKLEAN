# Mobile skeleton loading

## Implementation

- `mobile/src/components/loading-skeleton.tsx`: shared HeroUI Native `Skeleton` / `SkeletonGroup.Item` shapes, list recipes, accessible regions and presentation-only timing hook.
- `mobile/app/resident.tsx`: collection card, weekly schedule, recent reports, complaints, server conversation and connecting indicator. Refreshes retain current content.
- `mobile/app/staff.tsx`: History summary/records, Profile hero/account rows and Input select placeholders, connected to the existing flags.
- `mobile/src/components/staff-submission-details.tsx`: selected photo loading, per-URI onLoad memory, error placeholder and timeout. The real image stays mounted underneath its skeleton so loading can finish.
- `mobile/app/collector.tsx`: route progress/checklist, past collections, Profile and floating map-widget placeholders. Mapbox, monitoring, downloads, Finish route and sync handlers remain unchanged. The new pre-route widget disables Truck emptied; the existing assigned-route behavior is unchanged.
- `mobile/src/components/resident-settings-modal.tsx`: session account and fallback FAQ content stay visible while preferences load. The previous loading lock on controls is preserved without replacing the page with a spinner.
- QA: new `mobile/scripts/check-loading-skeleton.cjs`; updated resident, Collector, Staff History and Staff details fixture scripts for the shared component and image load events.

Confirmed installed free `heroui-native` **1.0.8** exports both components. Checked its installed source/types and the [Skeleton](https://www.heroui.com/en/docs/native/components/skeleton) and [SkeletonGroup](https://www.heroui.com/en/docs/native/components/skeleton-group) documentation. Read the versioned Expo documentation required by `mobile/AGENTS.md`; no Expo/package upgrades were made.

Styles use `StyleSheet` and the components' `style` prop, not class-name-dependent dimensions. Base is `#E8EDEA`, highlight `#F6F9F7`; shimmer is 1500ms. HeroUI uses the already-installed SVG library for shimmer, so this change adds no native dependency.

Loading starts visually after 150ms; the invisible shapes reserve space during that delay. A displayed skeleton remains for 400ms on normal completion, then content uses HeroUI's 250ms entering transition. Error, cached-data hydration and the 10-second timeout take priority over the minimum duration. Timeout reveals the existing empty/error UI without aborting the request; a late successful response still renders normally. An empty completed result counts as settled, so refreshing it does not restart skeletons. Resource-key changes reset the presentation cycle and effect cleanup cancels timers.

The loading region announces “Loading” with `busy: true`; individual shapes are hidden from accessibility and cannot be pressed. Reduce Motion uses `variant="none"` and responds to preference changes. Existing active screens use a light palette even though Settings stores a theme preference; this change does not introduce theme logic.

## Deliberate coverage limits: existing flags only

These are not new artificial loading states:

- Resident News comes from static `CITY_NEWS`; it has no request/loading flag.
- Resident greeting and Profile come from the session; session hydration has no loading flag. Existing session content stays visible.
- Settings account data is already in the session. FAQ loading is a separate `loadAppInfo` request with **no loading flag**, and actual fallback questions are already available. `isLoadingSettings` tracks preferences, not FAQs, so it is not used to pretend FAQ loading is complete.
- Collector report content is derived synchronously from `selectedHistoryGroup`, not separately fetched. Its map retains Mapbox tile loading, attribution and controls. No fake report timer was added.
- Collector Profile uses session data while the full driver profile refreshes, so cached profile content takes precedence.
- Staff's `historyLoading`, `profileLoading`, `isLoadingTrucks`, `isLoadingAreas` and `isLoadingDrivers` currently never become `true` in the existing flow. The placeholders are wired, but cannot appear until those existing flags are actually driven. Changing fetch/loading orchestration was explicitly outside this task. Built-in/cached options remain visible.

These gaps need a separately authorized loading-lifecycle change if true placeholders are wanted there. No fetching, cache persistence, API contract, navigation, monitoring, notification or sync changes were made.

## Verification

- Deterministic hook tests: delayed/fast requests, minimum duration, cache hydration, offline with/without cache, timeout, error, empty results, refresh, resource/tab rerenders, timer cleanup, accessibility and both motion variants.
- Skeleton recipe browser proxy: 36 cases at 360px and 1x/2x font environments; no overflow. These are shape/layout tests, not a native shimmer performance test.
- Existing resident/Collector loaded-content and action fixtures, Staff History layouts, Staff details image switching and fallback checks, and 27 route-monitoring regression tests.
- Typecheck still reports 20 existing errors in `src/app/explore.tsx`, `src/components/animated-icon.tsx`, `src/components/app-tabs.tsx`, `src/components/app-tabs.web.tsx`, `src/components/ui/collapsible.tsx`, and `src/hooks/use-theme.ts`; no errors in changed implementation files.
- `npm run lint` is blocked by missing `eslint`; no dependencies installed. Supplemental `oxlint` reports existing unused declarations only. `git diff --check` passes.

Real Android testing with throttled networking, airplane mode/cache persistence, native image loading and system Reduce Motion is still needed. Browser fixtures and deterministic timers do not establish device performance or native integration correctness.
