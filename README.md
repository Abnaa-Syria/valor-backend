# VALOR — Backend

Node.js + Express 5 + TypeScript + Prisma + MySQL 8.

## Setup

```bash
npm install
cp .env.example .env        # then set DATABASE_URL, JWT_ADMIN_SECRET, JWT_USER_SECRET
npm run db:migrate          # creates the tables
npm run db:seed             # super admin + games, packs, gifts, frames, themes, badges
npm run dev                 # http://localhost:4000/api
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Run with auto-reload (also runs the background jobs) |
| `npm run build` / `npm start` | Compile to `dist/` and run it |
| `npm run typecheck` | Type errors only |
| `npm run db:migrate` | Create a migration from `schema.prisma` and apply it (development) |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:seed` | Seed reference data |
| `npm run db:studio` | Browse the database |

## Structure

```
prisma/
  schema.prisma     database schema
  migrations/       migration history — always commit
  seed.ts           reference data from the design
src/
  config/           env validation
  lib/              prisma, logger, jwt, crypto, storage (uploads), mailer
  middlewares/      admin auth, player auth, idempotency, errors
  utils/            AppError, pagination
  jobs/             scheduler: closes battles, expires entries, retries matching
  modules/<name>/   one folder per domain
    *.routes.ts        mobile routes        → /api/v1/...
    *.admin.routes.ts  dashboard routes     → /api/admin/...
    *.service.ts       business logic + database
    *.schemas.ts       zod validation
    *.controller.ts    (when a module has many handlers)
  routes.ts         mounts every module
  app.ts / server.ts
```

## API conventions

- Success: `{ "data": ... }` · Error: `{ "error": { "code", "message", "details?" } }`
- Lists: `{ "data": { "items": [], "meta": { page, pageSize, total, totalPages } } }` with `?page=&pageSize=`
- Mobile auth: `Authorization: Bearer <accessToken>` (15 min). Renew with `POST /v1/auth/refresh`; each refresh returns a new refresh token (the old one stops working).
- Requests that spend credits need an `Idempotency-Key` header (a new UUID per user action, reused on retry).
- Useful error codes: `TOKEN_EXPIRED` (refresh then retry), `INSUFFICIENT_CREDITS` (402, `details.type`), `ACCOUNT_SUSPENDED` / `ACCOUNT_BANNED`, `CLIP_IN_BATTLE`, `ALREADY_VOTED`, `OWN_BATTLE`, `VOTING_CLOSED`.

## Mobile endpoints — `/api/v1`

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | `{username, email, password, referralCode?}` → `referral: APPLIED / INVALID / NONE` |
| POST | `/auth/login` · `/auth/refresh` · `/auth/logout` | |
| POST | `/auth/forgot-password` · `/auth/reset-password` | dev: the reset link is printed in the server log |
| GET / PATCH | `/me` | profile, battle stats, games played, active frame / theme |
| POST | `/me/avatar` · `/me/banner` | multipart `image` (jpeg / png / webp, 5 MB) |
| GET | `/me/badges` · `/players/:id/badges` | earned + locked |
| GET | `/me/blocks` · POST / DELETE `/players/:id/block` | block works both ways |
| POST | `/me/delete` | `{password}` — deletes the account (store requirement) |
| GET | `/me/popularity` | total, sources, gift collection |
| GET | `/players/:id` · `/players/:id/clips` | public profile and clips (live-battle clips hidden) |
| GET | `/games` | games with battle criteria |
| GET | `/wallet` · `/wallet/transactions?type=` | balances and ledger |
| POST | `/clips` | multipart: `video`, `thumbnail?`, `gameId`, `title`, `description?`, `durationSec?`, `battle?` (JSON `{weaponClass, rank}`) · Idempotency-Key |
| GET | `/clips/mine?gameId=` | my gallery (live clips flagged in `live`) |
| GET / PATCH / DELETE | `/clips/:id` | |
| POST / DELETE | `/clips/:id/like` | |
| GET / POST | `/clips/:id/comments` · DELETE `/clips/:id/comments/:commentId` | |
| POST | `/battles/entries` | enter an existing clip `{clipId, weaponClass, rank}` · Idempotency-Key |
| GET / DELETE | `/battles/entries` · `/battles/entries/:id` | my entries, cancel a waiting one (refund) |
| GET | `/battles?gameId=` · `/battles/featured` · `/battles/history?result=won\|lost` | |
| GET | `/battles/:id` | identities and counts hidden until voting closes |
| POST | `/battles/:id/votes` | `{side: "A" \| "B"}` · Idempotency-Key |
| POST | `/battles/:id/rematch` | loser asks for a rematch `{clipId}` · Idempotency-Key |
| GET | `/rematches` · `/rematches/:id` | |
| POST | `/rematches/:id/accept` `{clipId}` (Idempotency-Key) · `/rematches/:id/decline` · DELETE `/rematches/:id` | |
| GET | `/leaderboard?period=weekly\|monthly&gameId=` | wins, then votes; includes `me` |
| GET | `/store` | wallet + credit packs |
| POST | `/store/purchases` | `{provider, productId, transactionId, receipt?, quantity?, gift?}` · Idempotency-Key |
| GET | `/store/purchases` | my purchases |
| GET | `/gifts` | gift catalog by tier |
| GET | `/app-config` | **public** (no login): default theme tokens for splash / auth screens |
| GET | `/cosmetics?kind=FRAME\|THEME\|AVATAR` · POST `/cosmetics/:id/apply` | themes include `metadata.tokens`, `palette`, `corners`; frames include ring `assetUrl` + `metadata.layout` / `glowColor` |
| GET | `/notifications` · `/notifications/unread-count` · POST `/notifications/read` `{ids?}` | |
| POST | `/reports` | `{targetType: CLIP \| COMMENT \| USER, targetId, reason}` |

## Dashboard endpoints — `/api/admin`

| Method | Path | Role |
|---|---|---|
| POST | `/auth/login` · GET `/auth/me` · POST `/auth/change-password` | |
| GET | `/stats/overview` | any admin |
| GET | `/users` · `/users/:id` · `/users/:id/ledger` | any admin |
| PATCH | `/users/:id/status` · POST `/users/:id/credits` | SUPER_ADMIN, ADMIN |
| GET | `/clips` · POST `/clips/:id/remove` | any admin |
| GET | `/battles` · `/battles/:id` | any admin |
| POST | `/battles/:id/cancel` | SUPER_ADMIN, ADMIN |
| GET | `/reports` · PATCH `/reports/:id` | any admin |
| GET | `/games` · POST / PATCH `/games/:id` | edit: SUPER_ADMIN, ADMIN |
| POST / DELETE | `/users/:id/badges` · `/users/:id/badges/:badgeId` | SUPER_ADMIN, ADMIN |
| GET | `/store/purchases` | any admin |
| GET / POST / PATCH | `/store/packs` · `/store/gifts` · `/store/cosmetics` | edit: SUPER_ADMIN, ADMIN |
| GET / POST / PATCH | `/badges` | edit: SUPER_ADMIN, ADMIN |
| GET / PATCH | `/settings` | edit: SUPER_ADMIN |
| GET / POST / PATCH | `/admins` | SUPER_ADMIN |
| GET | `/store/theme-tokens` | token definitions for the theme editor |
| POST | `/uploads` | multipart `image` → `{ url }` (frames, avatars, icons) · SUPER_ADMIN, ADMIN |

## Rules that matter

- **Credits** are never edited in place: every change is a `credit_ledger` row, with the cached balance updated in the same transaction under a row lock. Free credits reset daily (`dailyResetTimezone`); unused ones expire. Purchased credits never expire.
- **Battles** are anonymous until voting closes. Clips in a waiting entry or a live battle are hidden from everyone but their owner.
- **Matching** (v1): same game + weapon class + rank, different players. Unmatched entries expire after `matchmakingTimeoutMinutes` and are refunded.
- **One vote** per player per battle is enforced by a unique index. Players can't vote in their own battle.
- **Idempotency**: credit-spending requests replay the stored response on retry, so nothing is charged twice.
- **Purchases**: the app buys through Apple / Google, then calls `/store/purchases`; the server verifies the transaction before delivering. A store transaction is delivered once. Verified-but-undelivered purchases are saved as `FAILED` for support. `provider: "TEST"` works while `PAYMENTS_TEST_MODE` is on (default outside production); real App Store / Google Play verification goes in `src/lib/payments.ts`.
- **Gifts** add popularity, never votes. Profile gifts land immediately; gifts sent to a battle clip land when the battle closes or is cancelled.
- **Badges** with a rule (`battlesWon`, `battlesPlayed`, `gamesPlayed`, `clipsPublished` ≥ n) are awarded automatically; others by an admin.
- **Rematch** (VALOR rules until the client decides): the loser (either player on a draw) can ask within `rematchRequestWindowHours` (48h); each player brings a new clip from the same game; 1 Challenge Credit each; the opponent has `rematchAcceptHours` (24h) to accept; declined / expired / cancelled requests are refunded.
- **Leaderboard**: rolling 7 / 30 days, battle wins then votes received.
- **Themes** are the Figma "VALOR Theme" token set: 58 tokens (colors `#RRGGBB[AA]`, two corner radii) + `appearance` dark/light. Definitions live in `src/modules/customization/cosmetic-metadata.ts`; the six designed themes are seeded from `prisma/seed-assets/themes.json`.
- **Frames** are a transparent PNG ring (`assetUrl`) drawn over the avatar. `metadata.layout` gives the avatar circle and ring boxes as fractions of a square canvas, so the app draws them at any size. The ten designed rings (exported from the Figma "Profile Frame" component) are in `prisma/seed-assets/frames/` and copied to `uploads/catalog/` by the seed.
- **Avatars** (`kind: AVATAR`) are ready-made profile pictures; applying one sets the player's avatar. One default per kind (frame / theme / avatar) is given to new players.
- Every player shown in the app (battles after close, clips, comments, leaderboard, rematch) carries `activeFrame` so the ring can be drawn next to them.
- **Notifications** are stored for the in-app bell (match found, results, gifts, friend joined, badges, rematch). Push comes with the mobile app.
- **Blocking** is two-way: no profile, clips or comments between the two players, no comments / likes / profile gifts / rematch, never matched in a battle.
- **Account deletion** erases personal data and cancels live activity with refunds to others; purchases, ledger, gift transactions, votes and clips from finished battles stay, anonymised.
- **Rate limits**: per IP on auth, per player on every write (votes, uploads, entries, comments, likes, reports, purchases, block, images). In-memory — use a shared store with several servers.
- **Undecided product values** live in `app_settings`, editable from the dashboard.
- **Files** are stored on disk under `uploads/` (served at `/uploads`). Only keys are stored in the database, so moving to Cloudflare Stream / R2 means changing `src/lib/storage.ts`.
