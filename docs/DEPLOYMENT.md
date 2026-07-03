# Deployment (VPS + GHCR + GitHub Actions)

Production runs on a VPS via Docker Compose, with images built and pushed to the
GitHub Container Registry (GHCR) and auto-deployed on every push to `main`.

## Topology

```
GitHub push (main)
  → deploy.yml: test → build+push images → SSH redeploy
        ghcr.io/dadadadas111/code-dojo-api:latest
        ghcr.io/dadadadas111/code-dojo-bot:latest
  → VPS /opt/code-dojo: docker compose pull && up -d
        code-dojo-mongo   (internal)
        code-dojo-redis   (internal)
        code-dojo-api     (127.0.0.1:3010 → :3000, local-only)
        code-dojo-bot     (outbound to Discord; calls api over the compose net)
```

Mongo and Redis are **not published** to the internet. The API is bound to
`127.0.0.1:3010` on the host for local debugging only; the bot reaches it at
`http://api:3000` on the compose network.

## Images

Built from the root [`Dockerfile`](../Dockerfile) (parameterized by `--build-arg PACKAGE=api|bot`),
a multi-stage pnpm-monorepo build that produces a self-contained `pnpm --prod deploy`
runtime (~225 MB each).

## CI/CD

- **[ci.yml](../.github/workflows/ci.yml)** — runs on pull requests (typecheck, lint, format, tests, build).
- **[deploy.yml](../.github/workflows/deploy.yml)** — runs on push to `main` (and manual dispatch):
  1. `test` — full gate with Mongo + Redis services.
  2. `build-push` — builds `code-dojo-api` + `code-dojo-bot`, pushes `:latest` and `:<sha>` to GHCR (auth via the automatic `GITHUB_TOKEN`).
  3. `deploy` — SSHes to the VPS; the deploy key is **locked to a forced command** (`/opt/code-dojo/deploy.sh`), so it can only `docker compose pull && up -d` — not run arbitrary root commands.

### Secrets (GitHub → repo → Settings → Secrets)
- `VPS_HOST`, `VPS_USER` — SSH target.
- `VPS_SSH_KEY` — private half of a dedicated ed25519 deploy key whose public half is in the VPS `authorized_keys` with `command="/opt/code-dojo/deploy.sh"`.

## Server layout (`/opt/code-dojo/`)
- `docker-compose.yml` — the 4-service stack (images pulled from GHCR).
- `.env` — runtime secrets (mode 600). **Not in git.** `API_KEY`/`JWT_SECRET` are generated; Discord vars must be filled (see below).
- `deploy.sh` — pull + up + prune (the only thing the CI key can run).

## First-time / one-time setup (already done)
1. `/opt/code-dojo/{docker-compose.yml,.env,deploy.sh}` created.
2. Deploy key installed (forced-command) + GitHub secrets set.
3. Server already had GHCR pull auth for `dadadadas111` private packages.

## To go live (what you still need to do)
Fill the Discord vars in `/opt/code-dojo/.env` (see [DISCORD_SETUP.md](DISCORD_SETUP.md)):
```bash
ssh root@<vps>
nano /opt/code-dojo/.env      # DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, TEACHER_ROLE_ID
cd /opt/code-dojo && ./deploy.sh   # or just re-push main / re-run the workflow
# register slash commands once (from a machine with the repo, pointed at prod API_URL is NOT needed —
# deploy-commands only talks to Discord): run it wherever, with DISCORD_TOKEN + DISCORD_CLIENT_ID + DISCORD_GUILD_ID.
```
> The bot container will crash-loop until `DISCORD_TOKEN` is set — that's expected. Mongo/Redis/API run regardless.

## Manual operations
```bash
cd /opt/code-dojo
docker compose ps                 # status
docker compose logs -f api bot    # tail logs
./deploy.sh                       # pull latest + restart
docker compose down               # stop (keeps volumes/data)
curl -s localhost:3010/health     # API health (mongo/redis status)
```

## Rolling back
Images are tagged by commit sha. To pin a previous build:
```bash
IMAGE_TAG=<sha> docker compose up -d   # e.g. IMAGE_TAG=abc1234
```
(The compose files default `IMAGE_TAG` to `latest`.)
