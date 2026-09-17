# Deploying the multiplayer server

Everything is prepared: the production image (`Dockerfile`), the Fly.io config (`fly.toml`) and a GitHub Actions workflow (`.github/workflows/deploy.yml`) that tests, creates the app + database volume on first run, deploys and smoke-tests. What's left is a one-time account setup only a human can do.

**Where it runs:** [Fly.io](https://fly.io), one small machine in Stockholm (`arn`) with a 1 GB volume for the SQLite database. It sleeps when nobody is connected and wakes on the next visit, so a test server costs very little (Fly bills by usage; a card is required on the account).

---

## One-time setup (≈10 minutes, can be done from a phone)

1. **Create a Fly.io account** at https://fly.io/app/sign-up and add a payment card (Billing).
2. **Create a deploy token**: https://fly.io/dashboard → *Tokens* → *Create token* → type **Organization**, org **personal**, name `github-deploy`, no expiry (or a long one). Copy the token — it is shown once.
   - It must be an *organization* token: the first deploy creates the app, which an app-scoped token can't do.
3. **Give the token to GitHub**: https://github.com/toshobiccan/wankigroup/settings/secrets/actions → *New repository secret* → name `FLY_API_TOKEN`, value = the token.
4. *(Only if needed)* The app name `cardslayer` must be unique on all of Fly.io. If the first deploy fails with "name has already been taken", change `app = "cardslayer"` in `fly.toml` (e.g. `cardslayer-game`) and deploy again.

Nobody ever has to install `flyctl` or Docker locally — GitHub builds and deploys.

## Deploy

Push the code you want live to the `deploy` branch:

```bash
git push origin main:deploy
```

…or open GitHub → *Actions* → *Deploy* → *Run workflow*. Follow progress in the Actions tab; the last step prints the health check.

The game is then at **https://cardslayer.fly.dev** (or `https://<your-app-name>.fly.dev`). Share that link — it's the full app, online mode, with accounts.

## Test it

- Open the link on two devices (or a normal + private browser window), pick two names, go to *World*: you should see each other and the room badge (top right) should say `plains1-0001 · 2 players`.
- No second person around? Run bots against the live server from any computer with the repo:

  ```bash
  npm run bot -- --server https://cardslayer.fly.dev --count 3
  ```

- Health and live room stats: https://cardslayer.fly.dev/api/health

## Operating it

| Task | How |
| --- | --- |
| Logs | fly.io dashboard → app → *Monitoring*, or `flyctl logs -a cardslayer` |
| Roll back | Re-run an older successful *Deploy* run, or push an older commit: `git push --force origin <commit>:deploy` |
| Stop the server | dashboard → *Machines* → stop (it also sleeps by itself when idle) |
| Back up the database | `flyctl ssh sftp get /data/cardslayer.db ./cardslayer-backup.db -a cardslayer`, or use the volume snapshots in the dashboard (Fly takes one daily) |
| Settings | `fly.toml` `[env]`, or secrets: `flyctl secrets set NAME=value -a cardslayer` |

Server settings (all optional): `PORT`, `HOST`, `ONLINE` (`false` = static app only), `DATABASE_PATH`, `ALLOWED_ORIGINS` (comma separated, for a frontend/native shell on another origin), `TRUST_PROXY`, `AUTH_RATE_LIMIT_PER_MINUTE`, `LOG_REQUESTS`, `APP_VERSION`. See `server/config.js`.

## Limits of this setup (fine for testing, revisit before a public launch)

- **One machine only.** Rooms live in that machine's memory and the database is a file on its volume, so the app must not be scaled to more machines (the workflow deploys with `--ha=false`). Scaling out later means Postgres (a new `Store` class) plus routing each room to one machine.
- **Deploys disconnect players** for a few seconds; the client reconnects and rejoins its room by itself, but a fight in progress is cancelled.
- **Grades are trusted.** Decks never leave the device, so the server can't check answers — it only enforces everything else (damage, HP, rewards, respawns, range, rate limits).
