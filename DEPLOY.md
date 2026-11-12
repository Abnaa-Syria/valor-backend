# Deploying the API

## Current staging: shared server (PM2 + Apache)

| | |
|---|---|
| URL | https://valor-api.nodeteam.site/api (health: `/api/health`) |
| Folder | `/var/www/valor-api.nodeteam.site` (settings in `.env` there) |
| Process | PM2 app `valor-api`, port 4123 |
| Database | MySQL `valor_db`, user `valor` (only this database) |
| Web | Apache vhost `valor-api.nodeteam.site` → 127.0.0.1:4123, Let's Encrypt via certbot |
| Dashboard | https://valor-dashboard-virid.vercel.app (Vercel, `VITE_API_URL=https://valor-api.nodeteam.site/api`) |

Update to a new version (on the server):

```bash
cd /var/www/valor-api.nodeteam.site
# get the new code (git pull, or upload a fresh copy without overwriting .env and uploads/)
npm ci && npx prisma generate && npm run build
npx prisma migrate deploy
pm2 restart valor-api
```

Reload demo data: `npm run db:seed:demo` · Logs: `pm2 logs valor-api`.

---

## Alternative: a dedicated server with Docker

The API and MySQL run in Docker on one Linux server. Uploaded videos and images are kept in a Docker volume.

## 1. Server, once

```bash
# Docker (Ubuntu / Debian)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out and in again

# DNS: point api.<your-domain> (A record) to the server IP before enabling HTTPS.
```

## 2. Get the code and settings

```bash
git clone <backend repo> valor-api && cd valor-api
cp .env.server.example .env
nano .env        # fill every "change-me"; openssl rand -hex 48 makes a good secret
```

## 3. Start

```bash
# A) Nothing else on ports 80/443 → Caddy gets an HTTPS certificate automatically:
docker compose --profile https up -d --build

# B) The server already has Nginx → start without Caddy and use deploy/nginx.conf.example:
docker compose up -d --build
```

Migrations run automatically on every start. Then, once:

```bash
docker compose exec api npm run db:seed          # super admin + reference data
docker compose exec api npm run db:seed:demo     # optional demo data (needs ALLOW_DEMO_SEED=true)
```

Check: `curl https://api.<your-domain>/api/health` → `"status":"ok"`.

## 4. Update to a new version

```bash
git pull && docker compose --profile https up -d --build   # or without --profile https (option B)
```

## Useful

| Task | Command |
|---|---|
| Logs | `docker compose logs -f api` |
| Restart | `docker compose restart api` |
| Database shell | `docker compose exec db mysql -u valor -p valor` |
| Backup database | `docker compose exec db mysqldump -u root -p"$DB_ROOT_PASSWORD" valor > backup.sql` |

## Dashboard (Vercel)

Import the dashboard repo in Vercel (framework: Vite) and set the environment variable
`VITE_API_URL=https://api.<your-domain>/api`. Then add the Vercel address to `CORS_ORIGINS` in the server `.env`
and restart the API.
