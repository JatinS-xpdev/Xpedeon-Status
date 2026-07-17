# Xpedeon Status 0.4.0 — Change Summary

## Timestamped report updates

- Incident updates can now change risk level; the newest update drives the public incident badge and automatic service impact, and each public update displays its recorded risk.
- Added dedicated chronological update logs to incidents and maintenance, separate from each report's stable public summary.
- Admins can add, edit and remove update entries with an explicit publication time; incident updates also record the progress state.
- The newest incident update automatically advances the report's `updatedAt` time.
- Public incident, resolved-incident, maintenance and service-history views now show the update timeline.
- Every displayed timestamp includes the viewer's local timezone and an explicit UTC standard-time reference.
- Update messages and timestamps are normalized and validated, including protection against incident updates predating the incident.
- Redesigned the service history control as a full-width visual button with a chart icon, affected-day summary, chevron state and clearer 30-day wording.

## Automatic retention and UI cleanup

- Resolved incidents and completed maintenance are permanently removed after 30 days; reports exactly on the boundary remain until they become older than 30 days.
- Cleanup runs on status reads and saves, and persists the filtered configuration atomically.
- Serialized configuration operations prevent cleanup reads from racing administrator saves within the server process.
- Active incidents and active or future maintenance are never removed by retention cleanup.
- Recently completed maintenance remains visible during the retention window with distinct Scheduled, In progress and Completed states.
- Added a compact admin overview for service, active-report and retained-report counts.
- Removed redundant timestamp sorting and object memoization work from public rendering.

## Per-incident resolved option

- Added a prominent **Issue resolution** control to every incident card in the admin page.
- Resolving an issue sets its progress status, last-updated time and resolution time consistently.
- Resolved issues immediately stop contributing to current service and overall status after saving.
- Resolution does not blindly force a service to Operational; any other active incident, maintenance window or manual baseline still applies.
- Resolved issues leave the active banner and Active Incidents list.
- Added a public **Recently Resolved** section showing incidents resolved during the last 30 days.
- Historical date bars retain the incident’s detected severity through its actual resolution time.
- Added a follow-up action that creates a new active incident without reopening or stretching the original resolved interval.
- Made explicit resolution dates authoritative during normalization, preventing a report from being stored as both resolved and “Investigating”.

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

- Existing service data without explicit history preferences remains visible on the public page, including during frontend-only development reloads.
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

- Added `Ctrl+S` and `Command+S` keyboard shortcuts for saving valid admin changes, with a discoverable hint on the save button.
- Added per-service controls for public history visibility and a customizable 1-to-60-day display range, with a 30-day default.
- Added a show/hide control to the administrator password field and concise guidance explaining where the server password is changed.
- Added explicit incident start, update and resolved fields.
- Added a per-incident resolution control with clear live-status consequences.
- Added maintenance start/end fields and calculated duration.
- Added affected-service checkboxes and automatic detected-status previews.
- Added unsaved-change state and a browser navigation warning.
- Added confirmations before destructive service/report deletion.
- Changed resolved/completed cards to a positive visual state.
- Added a saved-page preview link, stronger empty states and clearer guidance.
- The password remains only in component memory; browser storage is not used.

## Public-page UI

- Standardized the service-status column and pill width so history controls remain aligned when a service shows the longer Degraded Performance label.
- Service cards now respect their own history visibility and day range while retaining a balanced current-status-only layout when history is hidden.
- Reworked the service board around expandable, date-level history.
- Added a Recently Resolved incident panel with resolution timestamps and affected-service details.
- Added current-state auto-adjustment notes.
- Added active-incident severity banners and affected-service chips.
- Added scheduled maintenance timing, active-window badges and improved status summaries.
- Added automatic 60-second refresh, refresh-on-tab-return and a non-destructive refresh error notice.
- Improved desktop, tablet and mobile layouts, focus states and reduced-motion behaviour.

## Server and project cleanup

- Development mode now reloads the API when its server or shared status schema changes, and the admin editor detects outdated servers that discard newer configuration fields.
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

- `npm test`: 29 passed, 0 failed.
- `npm run build`: completed successfully with Vite 6.4.3.
- `npm audit`: 0 vulnerabilities in production and development dependencies.
