# Deploying the API (staging server)

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
