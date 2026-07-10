# Xpedeon Status

A manually configured status page built with React, Vite, Node.js and Express.

The application has two parts:

- Public status page: `/`
- Admin editor: `/admin`

The admin editor updates `status.config.json` through the Express API.

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

## Admin password

Set the admin password before starting the server:

```bash
STATUS_ADMIN_PASSWORD="change-me" npm run dev
```

If `STATUS_ADMIN_PASSWORD` is not set, the server falls back to `admin` and prints a warning.

## Production

```bash
npm run build
STATUS_ADMIN_PASSWORD="change-me" npm start
```

In production, the Express server serves the API and the built React app from `dist`.

## Configuration

The status page is controlled by `status.config.json`.

Supported service statuses:

- `operational`
- `degraded`
- `maintenance`
- `outage`

Supported incident risk levels:

- `minor`
- `major`
- `critical`

Example service:

```json
{
  "name": "Xpedeon Web App",
  "description": "Login, dashboards and browser-based Xpedeon workflows.",
  "status": "operational",
  "history": {
    "2026-07-09": "operational"
  }
}
```

Days missing from `history` inherit the current service status.

## API

- `GET /api/health` - basic API health check
- `GET /api/status` - returns the current normalized status configuration plus `generatedAt`
- `POST /api/admin/login` - validates the admin password
- `PUT /api/status` - saves a new status configuration; body format is `{ "password": "...", "config": { ... } }`

## Tests

```bash
npm test
```

`npm run check` runs the unit tests and then the production build.

## Notes on this cleaned version

- Shared status metadata and validation live in `src/status.js` so that the public page, admin editor and server use the same rules.
- Writes to `status.config.json` are atomic to reduce the risk of partially written JSON.
- The admin password is kept in component state only and is not written to browser storage.
- The package scripts are cross-platform; `npm start` no longer depends on Unix-only inline environment variable syntax.
