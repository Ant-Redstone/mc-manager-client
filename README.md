# mc-manager-client

Web client for [mc-manager-server](https://github.com/lomokwa/mc-manager-server) — manage a Minecraft server from the browser: live console, player management, server setup (version picker, properties), in-app file editing, world backups, and user management.

Built with React 19 + TypeScript + Vite (React Compiler enabled).

## Getting started

```bash
npm install
cp .env.example .env   # then adjust if your API isn't on localhost:8080
npm run dev
```

The app expects a running `mc-manager-server`. Sign in with your account, or register with an invitation token (an admin creates invitations via `POST /api/admin/invitations` — see the server's `INVITATION_AUTH.md`).

## Environment variables

All variables are optional — the defaults target a local server on port 8080.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE` | `http://localhost:8080/api` | Base URL of the mc-manager REST API |
| `VITE_WS_URL` | `ws://localhost:8080/api/console` | WebSocket URL of the live console |
| `VITE_BLUEMAP_URL` | _(empty)_ | Default URL for the player panel's "View on live map" link (also settable on the Settings page) |

Vite only exposes variables prefixed with `VITE_`, and they are inlined at build time — rebuild after changing them. Authentication uses your login (JWT); no API key is configured in the client.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server on `http://localhost:5173` |
| `npm run build` | Type-check (`tsc -b`) and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |

## Pages

- **Console** — live server log over WebSocket, with a command input offering Minecraft-style suggestions and tab-completion
- **Players** — known players with op / whitelisted / banned / online status; open one for a management panel (op, whitelist, teleport, run-as, kick/ban, and a live chat)
- **Files** — browse the server directory and edit text / JSON / `.properties` files in-app, with JSON validation and highlighting
- **Backups** — create, restore, and schedule world backups
- **Server** — create the server (vanilla/Fabric, version picker) and edit `server.properties`
- **Settings** — client preferences, e.g. the BlueMap live-map URL
- **Users** — manage accounts and invitations
