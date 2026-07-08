# Xpedeon Status

A basic manually configured status page built with React, Node.js, Express, and Vite.

## Run locally

```bash
~npm install
npm run dev~
```

Open the Vite app at `http://localhost:5173`. The API runs on `http://localhost:3001`.

## Manual configuration

Edit `status.config.json` to change:

- page title, description, and support email
- services and their status
- active incidents
- scheduled maintenance

Supported service statuses are:

- `operational`
- `degraded`
- `maintenance`
- `outage`

The Node server reads `status.config.json` on every `/api/status` request, so refresh the browser after editing the file.

## Production

```bash
npm run build
npm start
```

The production server serves both the API and the built React app.
