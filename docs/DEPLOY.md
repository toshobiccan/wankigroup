# Deploying the multiplayer server (Railway)

Everything in the repo is ready: the production image (`Dockerfile`), Railway's build/deploy settings (`railway.json`: Docker build, health check on `/api/health`, restart on crash) and a GitHub test workflow that Railway waits for. What's left is a one-time project setup in the Railway dashboard that only a human can do.

**How it runs:** one Railway service built from this repo's `deploy` branch, one replica, with a volume for the SQLite database. Railway watches the branch, so after setup **deploying = pushing to `deploy`** — no tokens, no CLI, no GitHub secrets.

**Cost:** Railway bills by usage on top of a plan (Hobby is a few dollars a month and includes some usage; new accounts get trial credit). A small test server with a few players stays at the low end.

---

## One-time setup (≈10 minutes, works from a phone)

1. **Create the `deploy` branch** (so Railway has something to watch). Ask Claude, or run:
   ```bash
   git push origin main:deploy
   ```
2. **Create a Railway account** at https://railway.com (sign in with GitHub) and pick a plan that allows volumes (Hobby or higher; the trial works to start).
3. **Create the project**: *New Project* → *Deploy from GitHub repo* → allow access to `toshobiccan/wankigroup` → select it. Railway finds `railway.json` and the `Dockerfile` by itself.
4. **Add the volume** — required, otherwise every deploy wipes all accounts: on the project canvas right-click → *Volume* (or `Ctrl/⌘+K` → "volume") → attach it to the service → **mount path `/data`**. The server picks it up automatically through `RAILWAY_VOLUME_MOUNT_PATH`.
5. **Service settings** (click the service → *Settings*):
   - *Source* → **Branch: `deploy`**, and turn on **Wait for CI** (deploys only after the GitHub tests pass).
   - *Networking* → **Generate Domain**. If it asks for a port, enter **8080**.
   - *Deploy* → keep **1 replica** (Railway doesn't allow more with a volume anyway, and rooms live in one server's memory).
   - Optional: *Region* → an EU region (closest to Norway).
6. Railway deploys once right away. Open the generated domain (something like `https://wankigroup-production.up.railway.app`) — you should get the sign-in screen.

No variables need to be set. Optional ones are listed under "Settings" below.

## Deploy

```bash
git push origin main:deploy
```

GitHub runs the tests, Railway sees the check pass, builds the Docker image, starts it, waits for `/api/health` to answer, then switches traffic over. Watch it under the service's *Deployments* tab.

## Test it

- Open the domain on two devices (or a normal + private window), pick two names, go to *World*: you should see each other, and the room badge (top right) should say `plains1-0001 · 2 players`.
- No second person around? Run bots against the live server from any computer with the repo:
  ```bash
  npm run bot -- --server https://<your-domain>.up.railway.app --count 3
  ```
- Health and live room stats: `https://<your-domain>/api/health`.

## Operating it

| Task | How |
| --- | --- |
| Logs | Service → *Deployments* → a deployment → *View logs*. A startup line `WARNING: no Railway volume attached` means step 4 was missed. |
| Roll back | Service → *Deployments* → an older successful one → ⋯ → *Redeploy* |
| Stop the server | Service → *Deployments* → the active one → ⋯ → *Remove* (push to `deploy` again to bring it back) |
| Back up the database | Volume → *Backups* on plans that include them; otherwise copy `/data/cardslayer.db` out with the Railway CLI |
| Settings | Service → *Variables* |

Server settings (all optional): `ONLINE` (`false` = static app only), `DATABASE_PATH` (overrides the volume path), `ALLOWED_ORIGINS` (comma separated, for a frontend/native shell on another origin), `AUTH_RATE_LIMIT_PER_MINUTE`, `LOG_REQUESTS`, `APP_VERSION`. `PORT` and `TRUST_PROXY` are already set in the Dockerfile. See `server/config.js`.

## Limits of this setup (fine for testing, revisit before a public launch)

- **One server only.** Rooms live in memory and the database is a file on the volume, so it must stay at one replica. Scaling out later means Postgres (a new `Store` class — Railway can host Postgres too) plus routing each room to one server.
- **Deploys cause a few seconds of downtime** (Railway never runs two copies on one volume). The client shows "Reconnecting…" and rejoins its room by itself; a fight in progress is cancelled.
- **Grades are trusted.** Decks never leave the device, so the server can't check answers — it enforces everything else (damage, HP, rewards, respawns, range, rate limits).

## Not tied to Railway

The server is a plain Docker container reading environment variables, so any host with Docker, WebSockets and a persistent disk works (Fly.io, Render with a disk, a VPS). Set `DATABASE_PATH` to a file on that host's persistent disk.
