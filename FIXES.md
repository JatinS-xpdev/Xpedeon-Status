# Fix Summary

## Build and project hygiene

- Added an explicit `engines.node` requirement.
- Added `npm test` and `npm run check` scripts.
- Moved Vite and the React plugin to `devDependencies`.
- Changed `npm start` to `node server/index.js` so it works on Windows as well as Unix shells.
- Added a `.gitignore` covering dependencies, build output, logs and local environment files.

## Shared status logic

- Centralized service statuses, risk levels, normalization, date helpers and validation in `src/status.js`.
- Added safe fallback behavior for invalid or missing status values.
- Added deterministic UTC date handling for 30-day status histories.
- Made `formatDateTime` resilient to empty and invalid dates.
- Added service summary and worst-status helpers with unit tests.

## Public status page

- Reworked the layout into reusable sections for navigation, incident banners, service board, metrics, incidents and maintenance.
- Added a clear 30-day status timeline with accessible labels and hover titles.
- Added safer empty states and support-email handling.
- Improved responsive behavior for desktop, tablet and mobile.

## Admin editor

- Removed browser `sessionStorage` password persistence.
- Added a safer login and sign-out flow.
- Added client-side validation before save.
- Fixed the incident risk label from the old wording to `Risk level`.
- Added service history editing that cycles through supported statuses and allows clearing explicit day overrides.
- Added better loading, success and error messages.

## Server/API

- Added `/api/health`.
- Disabled `x-powered-by`.
- Added a small login rate limiter.
- Normalized and validated configuration on read/write.
- Changed file writes to an atomic temp-file-and-rename flow.
- Reduced production error leakage while keeping useful detail in development.
- Added support for `STATUS_CONFIG_PATH` for easier testing or deployment-specific storage.
- Kept production static serving conditional on a built `dist/index.html`, so development API runs cleanly without a build.

## Verification performed here

- `npm test` passed: 8 tests, 0 failures.
- `node --check src/status.js` passed.
- `node --check server/index.js` passed.
- `npm run build` could not be completed in this sandbox because dependencies were not installed and external package download was unavailable.
