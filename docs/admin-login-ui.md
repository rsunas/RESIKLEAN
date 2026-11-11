# Admin login presentation

## Stack and scope

React 19.2.8, Vite 8.2.1, React Router 7.18.2, Tailwind 4.3.3 / HeroUI 3.2.4. The existing dashboard uses hand-written CSS for most screen layouts and Plus Jakarta Sans from its existing font stylesheet. This change retains both. No dependency, route, API, session, validation or redirect changes.

`handleSubmit` is byte-for-byte equivalent to the repository version (ignoring CRLF); the QA script asserts this. The server returns one form-level error, not field-specific validation. It is displayed once below the password field with its original message, connected to both inputs using `aria-describedby`, and red field rings. Native required/email validation and Enter submission are retained.

## Changed files

- `web-dashboard/src/pages/Login.jsx`: split/stacked semantic structure, existing form bindings, accessible show/hide button, decorative responsive image, footer and security icons.
- `web-dashboard/src/pages/Login.css`: login-scoped tokens, 640px desktop column, inset art panel, 260/320px mobile/tablet banner and overlapping sheet, keyboard focus, errors, fluid text sizing and reduced-motion rules. No authenticated dashboard CSS is altered.
- `web-dashboard/src/assets/swmo-login-original.jpg`: unmodified supplied illustration (199,316 bytes).
- `web-dashboard/src/assets/swmo-login-1600.webp`: 1600×900, 91,754 bytes.
- `web-dashboard/src/assets/swmo-login-800.webp`: 800×450, 42,288 bytes.
- `web-dashboard/src/assets/resiklean-logo.png`: existing transparent ResiKlean logo reused from the mobile assets, unchanged. Unlike the older dashboard SVG it has no oversized surrounding canvas.
- `web-dashboard/scripts/browser-check.mjs`: local hidden Edge/CDP test helper, no browser package added.
- `web-dashboard/scripts/prepare-login-art.mjs`: reproducible WebP exports using the installed browser's canvas encoder, preserving the original file.
- `web-dashboard/scripts/check-login.mjs`: actual Vite/browser responsive and mocked-auth regression checks, plus source-handler preservation and contrast assertions.
- `web-dashboard/scripts/login-assets.d.ts`: ambient asset/env types for the focused JavaScript typecheck.
- This document.

## Presentation decisions

- Vite/React has no Next-style image component, so use native `<picture>`/`<img>` with `fetchPriority="high"`, intrinsic dimensions, a mobile `srcSet` and decorative `alt=""`. Desktop always uses the 1600px export because a tall `cover` crop stretches more than its column width suggests. Phone/tablet selects responsive candidates (800px at the tested DPR 1).
- White chip text over pale illustration pixels cannot meet 4.5:1 with a white translucent background alone. The mobile chip includes a dark-green backing; the desktop caption has an additional full-width bottom gradient, rather than a separate caption card. Worst-case contrast over white artwork: headline 7.24:1, desktop chip 4.61:1, mobile chip 7.74:1. The requested main gradients and translucent chip borders remain.
- Desktop form is centered at max-width 400px; logo/footer stay on the column's 64px inset. Tablet content is centered at 480px; phone content uses 24px gutters.
- Fixed values for inputs/buttons are minimum heights, allowing 200% text to grow instead of clipping. The page has minimum viewport height only and scrolls naturally when a keyboard reduces the viewport.
- No entrance animation was added; reduced-motion users see no entrance motion.

## Validation

- Browser checks at 360, 390, 430, 768, 1024, 1280 and 1920 CSS pixels, normal and 200% text (14 normal-layout cases), plus loading/error layouts at the six requested widths and both font scales (24 cases).
- Actual browser keyboard/focus order, visible focus rings, native required validation, Enter submission, password toggle, autocomplete attributes, loading/disabled state, unchanged server-error text, non-admin rejection, session storage and `/dashboard` redirect. All requests are mocked; no real login/backend calls.
- Reduced-motion media preference and scrolling in a 390×420 keyboard-sized viewport checked. This is browser viewport emulation, not a physical-device keyboard test.
- Production Vite build passes; existing large-bundle warning remains.
- Focused JavaScript typecheck passes using the already-installed TypeScript compiler (dashboard has no TypeScript config or typecheck script):
  `node ../mobile/node_modules/typescript/bin/tsc --allowJs --checkJs --noEmit --skipLibCheck --moduleResolution bundler --module esnext --jsx react-jsx --target es2022 src/pages/Login.jsx scripts/login-assets.d.ts`
- Focused Oxlint for the login and scripts passes. Full `npm run lint` reports an existing conditional `useMemo` violation in `src/pages/Dashboard.jsx` (line 1174) and existing warnings; that unrelated file is unchanged.

The browser fixture blocks external requests, including the existing Google Fonts stylesheet, so its screenshots exercise the configured system fallback font. Production retains the existing Plus Jakarta Sans font loading. A final check with the deployed font and a physical mobile keyboard is advisable.
