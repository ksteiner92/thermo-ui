# Thermo UI

Mobile-first React frontend for the thermostat system.

## Requirements

- Node.js 18, 20, or 22 recommended
- `thermo-api` running and reachable from the browser

## Scripts

In `thermo-ui/`:

### `npm run dev`

Starts the Vite development server.

Default local URL:

- `http://localhost:5173`

### `npm run build`

Builds the production bundle into `dist/`.

### `npm run preview`

Serves the production build locally for a quick smoke test.

### `npm test`

Runs the frontend test suite with Vitest.

## Docker

### Build the image

```bash
docker build -t thermo-ui .
```

### Run the container

```bash
docker run --rm -p 3000:80 thermo-ui
```

The container serves the app on port `80`, so the default browser URL is:

- `http://localhost:3000`

### Runtime backend configuration

The container can be pointed at a specific backend without rebuilding:

```bash
docker run --rm -p 3000:80 \
  -e THERMO_UI_REST_BASE_URL=http://192.168.1.50:3001 \
  -e THERMO_UI_WS_URL=ws://192.168.1.50:3002 \
  thermo-ui
```

If those variables are not set, the frontend falls back to the current host on:

- REST: `http://<current-host>:3001`
- WebSocket: `ws://<current-host>:3002`

### Docker Compose

Use the sample file in `thermo-ui/`:

```bash
cp docker-compose.yml.sample docker-compose.yml
docker compose up --build
```

## Backend URLs

For local Vite development, the app defaults to:

- REST: `http://<current-host>:3001`
- WebSocket: `ws://<current-host>:3002`

You can override those in a `.env` file:

```bash
VITE_REST_BASE_URL=http://192.168.1.50:3001
VITE_WS_URL=ws://192.168.1.50:3002
```

That is useful when opening the UI from a phone on the same network.

## Development

1. Start `thermo-api`
2. Start the frontend with `npm run dev`
3. Open the Vite URL in a browser or on your phone

If you need the dev server reachable from other devices on your LAN, run:

```bash
npm run dev -- --host
```
