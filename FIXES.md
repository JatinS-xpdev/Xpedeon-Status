# Xpedeon Status 0.3.0 — Change Summary

## Requested behaviour

### Report-driven date bars

- Incident and maintenance reports now update affected service date bars automatically.
- Reports can apply to all services or selected service IDs.
- Minor incidents detect `Degraded Performance`.
- Major and critical incidents detect `Major Outage`.
- Maintenance windows detect `Maintenance`.
- Overlapping reports use deterministic severity precedence: outage, maintenance, degraded, operational.
- Active reports adjust the current service pill and overall status automatically.
- Resolved and completed reports stop affecting the current pill but remain available in historical date details.
- Future maintenance later today can mark today's daily bar without falsely changing the current pill before its start time.

### Expandable history interaction

- The 30-day service bar expands on pointer hover and keyboard focus.
- Hovering or focusing an individual date selects it.
- Clicking a date pins the detail panel open.
- Clicking the selected date again, pressing Escape or using the close control unpins it.
- Expanded detail identifies every contributing incident, maintenance window, manual override or current setting.
- Automatic dates receive a visual marker and an `Auto-detected` badge.
- The interaction is responsive, keyboard accessible and reduced-motion aware.

## Correctness fixes

- Past dates with no explicit history no longer inherit today's degraded or outage state; they use an operational baseline.
- Calendar keys now follow the viewer's local date instead of UTC, preventing early-hours date shifts in time zones such as India.
- Event ranges are treated as half-open, so an event ending exactly at midnight does not incorrectly mark the following day.
- Date calculations use local calendar construction so daylight-saving transitions do not create missing or duplicated days.
- Legacy resolved incident statuses infer `resolvedAt` from `updatedAt`.
- Creating a follow-up for a resolved incident now preserves the original report and starts a new report, avoiding a false continuous outage between the two periods.
- An empty service list no longer presents the overall page as being under maintenance.
- Redundant explicit operational entries were removed from the sample configuration; only exceptional manual history needs persistence.

## Validation and data integrity

- Added validation for real calendar dates in manual history.
- Added incident update/start chronology validation.
- Added report-scope validation when “All services” is disabled.
- Preserved validation for unknown service references, duplicate service names, invalid statuses, invalid risks and invalid maintenance ranges.
- Added stable IDs and backward-compatible normalization for older configurations.
- Kept completed reports available for history rather than silently discarding them.
- Configuration saves remain atomic through a temporary-file-and-rename operation.

## Administration UX

- Added explicit incident start, update and resolved fields.
- Added maintenance start/end fields and calculated duration.
- Added affected-service checkboxes and automatic detected-status previews.
- Added unsaved-change state and a browser navigation warning.
- Added confirmations before destructive service/report deletion.
- Changed resolved/completed cards to a positive visual state.
- Added a saved-page preview link, stronger empty states and clearer guidance.
- The password remains only in component memory; browser storage is not used.

## Public-page UI

- Reworked the service board around expandable, date-level history.
- Added current-state auto-adjustment notes.
- Added active-incident severity banners and affected-service chips.
- Added scheduled maintenance timing, active-window badges and improved status summaries.
- Added automatic 60-second refresh, refresh-on-tab-return and a non-destructive refresh error notice.
- Improved desktop, tablet and mobile layouts, focus states and reduced-motion behaviour.

## Server and project cleanup

- Added shared normalization and validation used by the UI and API.
- Added `/api/health` and API integration tests.
- Added failed-login throttling and timing-safe password comparison.
- Disabled framework-identifying headers.
- Added CSP, frame, referrer, permissions, MIME, DNS-prefetch and cross-origin isolation headers.
- Removed the unnecessary CSP `unsafe-inline` style allowance.
- Added atomic writes, configurable storage path and defensive JSON/body handling.
- Added cross-platform npm scripts and a Node engine requirement.
- Added `.env.example`, a stronger `.gitignore` and an npm lockfile.
- Reduced the default configuration from repeated operational dates to exception-only manual history.

## Verification

- `npm test`: 21 passed, 0 failed.
- `npm run build`: completed successfully with Vite 6.4.3.
- `npm audit`: 0 vulnerabilities in production and development dependencies.
- Rendered QA: public page checked at 1440 × 1050 and 390 × 844, including hover expansion, date selection and click-to-pin behaviour.
