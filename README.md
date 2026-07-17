# Xpedeon Status

Xpedeon Status is a lightweight public service-status page with an authenticated administration screen. It is built with React, Vite, Node.js and Express, and stores its configuration in `status.config.json`.

- Public status page: `/`
- Administration page: `/admin`
- Status API: `/api/status`

## What this version adds

### Timestamped progress updates

Incident and maintenance reports now keep a chronological `updates` log separate from the stable public summary. In `/admin`, use **Add update** to record what changed and when it was published. Incident entries also capture the progress state. Update timelines appear on active incidents, resolved incidents, maintenance cards and service-history details.

All displayed date/times include the viewer's local timezone plus an explicit UTC reference, so the same instant can be compared unambiguously across regions.

### Per-incident resolution

Every incident card in `/admin` now has a prominent **Issue resolution** control. Selecting **Mark issue as resolved**:

- Records the resolution time and sets the progress status to `Resolved`.
- Removes that incident from the active-incident banner and active-incident list after the changes are saved.
- Recalculates each affected service and the overall page status immediately. A service returns to its manual baseline or to the next-most-severe active report; it is not forced to Operational when another report still applies.
- Preserves the incident’s original severity on every affected date in the 30-day history.
- Adds the incident to the public **Recently Resolved** section for 30 days.

The resolution time remains editable for corrections. A recurrence should be recorded with **Create follow-up incident**. This creates a new active report with the same title, impact, risk and service scope while keeping the original resolved period intact.

### Automatic status detection

Incident and maintenance reports now drive both the current service state and the 30-day date bar. Each report can affect all services or a selected set of services.

| Report type | Report level | Detected service status |
| --- | --- | --- |
| Incident | Minor | Degraded Performance |
| Incident | Major | Major Outage |
| Incident | Critical | Major Outage |
| Maintenance | Any active or overlapping window | Maintenance |

When more than one state applies, the most severe state wins:

`Major Outage` → `Maintenance` → `Degraded Performance` → `Operational`

The current status pill changes only while a report is active. The daily history bar records any incident or maintenance window that overlaps that date. Therefore, maintenance scheduled for later today can appear in today's date bar without incorrectly showing the service as currently under maintenance.

Resolved incidents and completed maintenance remain available for historical detail for 30 days after their end time. On the first status read or admin save after that boundary, the server permanently removes them from `status.config.json`. Active incidents and active or future maintenance are never removed by retention cleanup. Manual deletion removes report-derived history immediately.

### Expandable 30-day history

Each service has an interactive 30-day bar:

- Point to the bar to expand it temporarily.
- Point to or focus a date to inspect that day.
- Click a date to pin the detail panel open.
- Click the selected date again, use the close button, or press `Escape` to unpin it.
- Keyboard focus provides the same detail interaction as mouse hover.

The expanded panel explains whether the state came from an incident, maintenance, a manual history entry, or the configured current status. Dates follow the viewer's local calendar, including local-midnight and daylight-saving boundaries.

### Administration improvements

The editor now includes:

- Affected-service selection for every incident and maintenance report.
- Explicit incident start, update and resolution times.
- Separate timestamped update logs for incidents and maintenance.
- A 30-day automatic retention policy for resolved incidents and completed maintenance.
- A compact admin overview showing service, active-report and retained-report counts.
- A clear per-incident resolution control with an explanation of its live-status effect.
- Explicit maintenance start and end times with calculated duration.
- A live preview of the automatically detected status level.
- A 30-day editor showing report-driven overlays separately from manual history.
- Unsaved-change indicators and a browser warning before accidental navigation.
- Confirmation before destructive deletes.
- A follow-up action that preserves the old resolved incident instead of creating a false continuous outage.

## Requirements

- Node.js 20.11 or later
- npm

## Install

```bash
npm install
```

## Run locally

```bash
npm run dev
```

Local URLs:

- Front end: `http://localhost:5173`
- API: `http://localhost:3001`
- Admin editor: `http://localhost:5173/admin`

### Development password

When `NODE_ENV` is not `production` and `STATUS_ADMIN_PASSWORD` is not set, the development password is:

```text
admin
```

The server prints a warning when this fallback is active. Set your own password even during local development when the machine or network is shared:

**PowerShell**

```powershell
$env:STATUS_ADMIN_PASSWORD = "use-a-long-unique-password"
npm run dev
```

**Command Prompt**

```cmd
set STATUS_ADMIN_PASSWORD=use-a-long-unique-password
npm run dev
```

**macOS/Linux shell**

```bash
STATUS_ADMIN_PASSWORD="use-a-long-unique-password" npm run dev
```

The password is held only in the admin page's in-memory React state. It is not written to local storage or session storage.

## Production

Build and start the application:

```bash
npm run build
```

**PowerShell**

```powershell
$env:NODE_ENV = "production"
$env:STATUS_ADMIN_PASSWORD = "use-a-long-unique-password"
npm start
```

**macOS/Linux shell**

```bash
NODE_ENV=production STATUS_ADMIN_PASSWORD="use-a-long-unique-password" npm start
```

Production startup fails deliberately when `STATUS_ADMIN_PASSWORD` is missing. Serve the application over HTTPS because the admin password is sent to the same-origin API when signing in and saving.

An environment template is provided in `.env.example`. The application does not load `.env` files automatically; provide the variables through your hosting platform, shell, process manager or a suitable environment loader.

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `STATUS_ADMIN_PASSWORD` | Production: yes | Development: `admin` | Password for `/admin` login and saves |
| `PORT` | No | `3001` | Express server port |
| `NODE_ENV` | No | Development behaviour | Set to `production` for production safeguards and caching |
| `STATUS_CONFIG_PATH` | No | Project `status.config.json` | Alternate persistent configuration file |
| `TRUST_PROXY` | No | `false` | Set to `true` when one trusted reverse proxy supplies the client IP |

## Configuration model

The persisted file contains four top-level sections:

```json
{
  "page": {},
  "services": [],
  "incidents": [],
  "maintenance": []
}
```

### Service

```json
{
  "id": "service-application-api",
  "name": "Application API",
  "description": "Backend APIs used by web and mobile clients.",
  "status": "operational",
  "showHistory": true,
  "historyDays": 14,
  "history": {
    "2026-07-03": "maintenance"
  }
}
```

Supported service statuses:

- `operational`
- `degraded`
- `maintenance`
- `outage`

`status` is the manual current baseline. `showHistory` controls whether the public service card includes history, and `historyDays` sets that service's range from 1 to 60 days. Existing configurations default to visible 30-day history. Missing past dates use the operational baseline. Add a `history` entry only when a historical day needs a manual override; incident and maintenance reports are overlaid automatically.

### Incident report

```json
{
  "id": "incident-api-latency",
  "title": "Elevated API latency",
  "status": "Monitoring",
  "impact": "Some requests may take longer than usual.",
  "riskLevel": "minor",
  "startedAt": "2026-07-10T08:00:00.000Z",
  "updatedAt": "2026-07-10T08:20:00.000Z",
  "resolvedAt": "",
  "affectsAllServices": false,
  "affectedServiceIds": ["service-application-api"],
  "message": "Some API requests are taking longer than usual.",
  "updates": [
    {
      "id": "update-capacity-adjustment",
      "status": "Monitoring",
      "message": "The team is monitoring recovery after a capacity adjustment.",
      "createdAt": "2026-07-10T08:20:00.000Z"
    }
  ]
}
```

Supported risk levels:

- `minor`
- `major`
- `critical`

Set `resolvedAt` when the incident ends. The admin resolution control sets `status`, `updatedAt` and `resolvedAt` together. An explicit `resolvedAt` is authoritative and normalizes the progress status to `Resolved`. For compatibility with old data, statuses containing `resolved`, `closed`, `completed` or `fixed` infer the resolution time from `updatedAt` when `resolvedAt` is absent.

### Maintenance report

```json
{
  "id": "maintenance-database-upgrade",
  "title": "Database upgrade",
  "scheduledFor": "2026-07-13T21:30:00.000Z",
  "endsAt": "2026-07-13T22:15:00.000Z",
  "duration": "45 minutes",
  "affectsAllServices": true,
  "affectedServiceIds": [],
  "message": "Brief interruptions may occur during the maintenance window.",
  "updates": [
    {
      "id": "update-maintenance-started",
      "status": "",
      "message": "The planned work has started.",
      "createdAt": "2026-07-13T21:30:00.000Z"
    }
  ]
}
```

`duration` is recalculated from `scheduledFor` and `endsAt`. Older records containing only `duration` are migrated in memory and receive an inferred end time when saved.

Update entries require a message and `createdAt` timestamp. Incident updates cannot predate the incident start. Arrays are stored oldest-first and displayed newest-first.

## Validation rules

The client and server share the same normalization and validation logic. Saves are rejected when, for example:

- A required title, message, service name or description is blank.
- A status or risk level is unsupported.
- A report refers to an unknown service.
- “All services” is off but no affected service is selected.
- An incident update precedes its start.
- An incident resolution precedes its start.
- A maintenance end is not later than its start.
- A manual history key is not a real `YYYY-MM-DD` calendar date.
- Service names are duplicated.

## API

- `GET /api/health` — process health and whether admin access is configured.
- `GET /api/status` — normalized status configuration plus a server-generated `generatedAt` timestamp.
- `POST /api/admin/login` — validates `{ "password": "..." }`.
- `PUT /api/status` — validates and saves `{ "password": "...", "config": { ... } }`.

The public page refreshes every 60 seconds while visible and also refreshes when the browser tab becomes visible again. A failed background refresh keeps the last successfully loaded status on screen and displays a warning.

Configuration writes use a temporary file followed by an atomic rename to reduce the chance of leaving partially written JSON. API responses are not cached. The server also applies restrictive content, framing, referrer, permissions and cross-origin headers.

## Scripts

```bash
npm run dev       # API and Vite development server
npm run client    # Vite only
npm run server    # Express API only
npm run server:dev # Express API with automatic reloads
npm run build     # Production bundle
npm run preview   # Preview the Vite bundle
npm start         # Start Express; serves dist when it exists
npm test          # Node unit and API integration tests
npm run check     # Tests followed by production build
```

## Verification for version 0.4.0

- 24 automated tests pass.
- The production Vite build completes successfully.
- `npm audit` reports zero production and development vulnerabilities.
