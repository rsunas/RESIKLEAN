# Mobile presentation transitions

## Installed navigator and supported options

Verified locally on 2026-11-10 (no dependency changes):

- Expo Router 6.0.24, on React Navigation native 7.3.16 / native-stack 7.18.8.
- Installed bottom-tabs 7.18.16 supports `none`, `fade`, `shift`, and a timing `transitionSpec`.
- **The active resident, Staff and Collector screens do not use that bottom-tab navigator.** They select existing JSX with local tab state. Converting them would change navigation, mounting and potentially map effects. Their crossfade and sliding pill therefore use Reanimated 4.1.7, keeping the same state and callbacks.
- Native-stack animation names in the installed types: `default`, `fade`, `fade_from_bottom`, `slide_from_bottom`, `slide_from_right`, `slide_from_left`, `ios_from_right`, `ios_from_left`, `simple_push`, `flip`, `none`. Platform behavior differs. See [React Navigation native-stack options](https://reactnavigation.org/docs/native-stack-navigator/#animation).
- Expo 54.0.37 / React Native 0.81.5, New Architecture enabled. No Expo/native package upgrades.

## Implementation decisions

- Root Stack: ordinary pushes slide from the right; the five existing auth/role routes fade. Initial index redirect / cold-start destination is not animated. Back and navigation callbacks are untouched.
- Custom tabs: 180ms opacity crossfade. Reanimated retains exiting native views, not a second live React screen or a second map/data subscription. Only the selected screen is mounted in React. Initial tab entry is skipped.
- Active pill: one non-interactive 56×32/radius-16 background, measured from the existing tab and icon layouts. Translates in 250ms; initial layout and resizing snap into position. Rapid changes cancel/retarget from the current presentation.
- Existing native Modals stay Modals: Settings, route report, complaint details and Staff submission details slide up/down. `useClosingValue` retains the last displayed record for dismissal while actual selection clears immediately. Staff photo selection/scroll reset on reopening. Confirmation dialogs and photo viewers retain their existing fade.
- Native timing is OS-owned: React Native Modal has no duration/easing prop. Native-stack's `animationDuration` is supported for selected iOS animations, not arbitrary Android transitions. Requested durations are used for Reanimated UI; unsupported native props are not fabricated. No new swipe-dismiss gestures or navigation handlers were added.
- Sign-up content moves 12px and fades over 250ms; Back reverses direction. Progress fill is a transform with the same 250ms duration (replaces the earlier delayed 500ms animation). No color tween or form/Google behavior changes.
- Shared press feedback: scale 0.97 over 100ms, preserving callbacks, labels, testIDs and disabled state. Animated style is attached directly to the animated Pressable, including when the original style uses `pressed`. Tab buttons opt out so the translating pill remains aligned.
- Existing inline messages/toasts enter from 12px above and leave upward over 250ms. The previously removed resident collection banner is not reintroduced.
- Skeleton-to-content fade remains 250ms, now with explicit ease-out/in. Existing loading timers, shimmer and cache/refresh rules stay unchanged.
- Accordions: 200ms opacity/translate/scale reveal and chevron rotation. **Height is not animated**, to satisfy the opacity/transform-only rule. Layout expands when opening and is removed after closing; stale completion callbacks cannot collapse a rapidly reopened item.
- First asynchronously loaded schedule/report/stop/history rows: first six only, 250ms fade/8px rise with 40ms stagger. No replay on cached initial data, tab revisit, refresh, or a refresh after an empty result. Static News and already-present profile data do not receive fabricated loading animations.
- One app-wide native reduce-motion listener. Slides/scales/rotations become fades or immediate changes, including live accessibility-setting changes. The query race and listener cleanup are covered by tests.

## Files changed for this task

- `mobile/app/_layout.tsx`: existing Stack options and shared motion preference provider.
- `mobile/app/{resident,staff,collector}.tsx`: custom tab transitions/pill, first-load list wrappers, messages and detail-dismiss presentation.
- `mobile/app/{login,signup}.tsx`: press feedback; sign-up step wrapper.
- `mobile/src/components/app-motion.tsx`: reusable motion primitives and presentation-only hooks.
- `mobile/src/hooks/use-app-reduced-motion.ts`: shared live accessibility preference.
- `mobile/src/components/{signup-progress,loading-skeleton}.tsx`: synchronized progress / content easing and shared reduced-motion preference.
- `mobile/src/components/{staff-submission-details,resident-settings-modal}.tsx`: modal transitions, reopening presentation and accordion motion.
- `mobile/src/components/{auth-ui,app-select,profile-settings-row,sign-out-confirm-modal,route-monitoring-consent-modal}.tsx`: existing buttons/modal wrappers use shared motion, retaining callbacks.
- `mobile/scripts/check-app-motion.cjs`: deterministic tests of the actual motion source and root Stack options.
- Existing `check-{auth-ui,resident-ui,collector-ui,staff-history,staff-details}.cjs`: adapters for the shared wrappers; prior interaction/layout assertions retained.
- This document.

## Validation and device handoff

- 13 deterministic motion tests: initial mount, cold index/deep-link destination, auth/back option selection, rapid tab retargeting, resize, press callbacks, native-modal props, detail retention, forward/reverse sign-up, toast easing, accordion cancellation, reduce-motion subscription, cached/empty/refresh exclusion and six-row stagger limit.
- Existing UI regressions: resident 408 layout fixtures; Collector 40 interaction fixtures and 200 layout sections; Staff history 8 layouts; Staff details 8 interaction cases / 12 layouts; auth handlers/progress and 12 layouts; skeletons 11 state checks / 36 layouts; consent interactions / 4 layouts. Browser layouts include 360px and large font scale. These are native-component adapters, **not native animation performance tests**.
- Route monitoring: 27 regression checks passed; permission/geofence/submission/download code is not changed by this task.
- Typecheck: still blocked by 20 existing errors in obsolete/sample `src/app/explore`, `animated-icon`, `app-tabs(.web)`, `ui/collapsible`, and `use-theme`; no new errors in the changed presentation files.
- All 17 changed application files compile through the installed Expo Babel preset; Reanimated worklets are transformed successfully.
- `npm run lint`: blocked by missing ESLint. No packages installed. Available repository Oxlint reports no errors, with existing unused-code warnings.
- Still required on a physical low-end Android device: fast tab taps (especially Mapbox surfaces), native modal close/reopen, hardware Back and supported iOS back gesture, cold-start deep links/notification links, and live reduce-motion toggling. Exact Android native transition duration cannot be proven with browser fixtures.

These are JavaScript/TypeScript-only changes. An existing compatible development build can reload Metro; no new native build is required for this task.
