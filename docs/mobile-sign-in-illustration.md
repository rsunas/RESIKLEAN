# Mobile Sign In illustration refresh

## Scope and files

- `mobile/app/login.tsx`: replaces the mint header with a 280px illustration, bottom gradient and overlapping rounded sheet. The fixed footer is outside the scrollable form and lifted another 8px. Its measured height supplies the form's bottom scroll space and focused-input keyboard offset.
- `mobile/src/components/auth-ui.tsx`: opt-in compact field spacing and invalid-border styling. Defaults, including Sign Up's rendering, are unchanged.
- `mobile/assets/images/swmo-login-original.jpg`: original supplied illustration (199,316 bytes).
- `mobile/assets/images/swmo-login-800.webp`: optimized 800×450 illustration (42,288 bytes); only this version is referenced by the screen.
- `mobile/scripts/check-auth-ui.cjs`: updated pinned-footer checks, keyboard focus/blur and measured-offset checks, and normal/loading/error layout fixtures using the actual artwork and logo.

## Decisions and preserved behavior

- Uses existing `expo-image` for cover with exact 14% horizontal positioning and existing `expo-linear-gradient`. No packages or native configuration changed.
- Android retains its existing `adjustResize`; only iOS enables KeyboardAvoidingView padding, avoiding double keyboard adjustment on Android.
- Footer controls and fields use minimum heights so large text can grow. Sign Up's shared field defaults and screen are untouched.
- Login's network/session/role-routing handler is byte-for-byte unchanged. Loading, disabled state, password visibility, error messages and the Sign Up destination are preserved.
- The existing Forgot password text has no handler or route. It remains unchanged rather than inventing password-reset behavior.
- A server error gives both fields the requested red outline; the same existing message appears once below the fields. No validation was added.

## Verification

- `node scripts/check-auth-ui.cjs`: passed mocked authentication and Sign Up regression checks; keyboard-open and field-switch focus offsets; blur and cleanup; footer measurement; 20 browser layout cases at 360px width, 1×/2× text, 640px/340px available heights, including normal/loading/error states. No external authentication calls were made.
- Hidden-browser visual inspection at 360×800: illustration crop, sheet, logo, form and pinned footer checked. Icons are placeholders in this browser adapter.
- Android Babel compilation passed for `app/login.tsx` and `src/components/auth-ui.tsx`.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: no diagnostics in edited UI files; blocked by 20 pre-existing diagnostics in `src/app/explore.tsx`, `src/components/animated-icon.tsx`, `src/components/app-tabs.tsx`, `src/components/app-tabs.web.tsx`, `src/components/ui/collapsible.tsx`, and `src/hooks/use-theme.ts`.
- `npm run lint` in CI mode: blocked because `eslint` is not installed. Nothing was installed.

Browser geometry and mocked keyboard events do not replace native-device QA. Still check a small Android phone with the real keyboard, switching email/password, scrolling to Forgot password, typing errors, and pressing Sign In/Sign Up. No new development build is needed for these UI/assets-only changes with the existing native modules already installed.
