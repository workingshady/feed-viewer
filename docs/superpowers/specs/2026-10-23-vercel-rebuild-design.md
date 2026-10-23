# Feed Viewer Pro — Vercel rebuild and Sources & Versions

Date: 2026-10-23 · Owner: Shady Mansour · Status: approved to start ("just start"); every decision below marked *(call)* was made by Claude and is open to review.

## Why

Feed Viewer Pro is a personal tool for previewing real-estate XML property feeds (agencies such as White & Co, Haus & Haus, Driven Properties; 1.7k–4.6k listings and 8–31 MB per feed). Today it only runs locally: listings live in the browser (localStorage + IndexedDB), the whole browser state is mirrored into one multi-MB blob per user on an Express server, and a third optional copy lives in Postgres tables behind a flag nobody sets. It cannot be deployed to Vercel (4.5 MB body limit, no long-lived processes, multiple instances), it has real bugs (importing one agency deletes the others), and it ships hardcoded credentials.

The owner wants: deployable on free tiers with no credit card, everything unnecessary removed, no hardcoded/demo text on login/signup, and a new page to manage agencies and their feed file versions — upload, delete, apply any version, compare, and have the rest of the site follow the applied version.

## Goals

1. Runs entirely on **Vercel Hobby + Neon Postgres (Vercel Marketplace) + Vercel Blob**, all free.
2. **One source of truth** for listings: the applied version of each source. No browser-side listing storage, no workspace blob sync.
3. **Sources & Versions page** (`/sources`) with full version management.
4. **Secure, honest auth**: no seeded or hardcoded accounts, server-enforced roles, rate-limited login, no demo text.
5. Remove local-only and dead code.

## Non-goals

- Fetching feeds from remote URLs on a schedule (needs cron + outbound fetch of 30 MB; possible later).
- Multi-tenant SaaS. Data is shared by everyone who can sign in to this deployment.
- Redesigning the analysis pages (listings grid, map, quality, dupes, compare). They keep their UI; only their data source changes.

## Anti-goals (would be a failure even if it "works")

- Any default password, or any credential in the UI, README, or seed.
- A listing changing just because someone opened a page (versions change only by explicit upload/apply).
- Silent data loss: deleting a source or version without a confirm dialog naming exactly what goes.

## Architecture

```
Browser (Vite SPA on Vercel CDN)
  ├─ /api/*  → one Vercel Function: Express app (server/src/app.ts, exported, no listen())
  │             └─ Prisma → Neon Postgres (pooled URL at runtime, direct URL for migrations)
  └─ Vercel Blob (public, random-suffix URLs)
        ├─ sources/<sourceId>/<versionId>/feed.xml.gz       raw upload, gzip
        └─ sources/<sourceId>/<versionId>/listings.json.gz   parsed listings, gzip
```

- **Parsing stays in the browser** *(call)*. `src/lib/xmlParser.ts` is the richer of the two parsers and powers mapping, validation and field-quality. The server mapper in `server/src/import/routes.ts` is deleted, which ends the two-parser drift (`scripts/verify-feeds.mjs` existed only to detect it).
- **Uploads bypass the 4.5 MB limit** using `@vercel/blob/client` `upload()` with a token from `POST /api/blob/upload` (`handleUpload`, which checks session + role). The function never receives the file.
- **The server stores only metadata.** Listing data lives in the per-version `listings.json.gz` blob. The client loads the applied version of every source straight from the Blob CDN. That removes the `Listing`, `ImportSessionListing` and `ListingQualityIssue` tables, `pg_trgm`, the per-process query cache, and server-side search *(call)*. Scale check: about 10k listings in total, around 2–6 MB gzip per source, which the current app already holds in memory.
- **Blob URLs are public but unguessable** (random suffix, never listed). This is acceptable for a personal tool and is noted in the README *(call)*.
- **Live sync is react-query refetch** on window focus, plus explicit invalidation after mutations. SSE, the EventEmitter hub and 10 s polling are removed *(call)*.

## Data model (Prisma, Postgres only)

```prisma
enum Role { admin editor viewer }
enum VersionStatus { uploading ready failed }

model User      { id, username @unique, passwordHash, role Role @default(viewer), createdAt, sessions Session[] }
model Session   { id (random 32), userId, expiresAt, createdAt, lastSeenAt }
model LoginAttempt { id, username, ip, ok Boolean, createdAt  @@index([username, createdAt]) }

model Source {
  id, name @unique            // display name, defaults to XML agency name
  agencyName                   // from <agency><company_name>
  agencyInfo   Json?           // logo, email, phone, website
  mapping      Json?           // MappingConfig used to parse this source (null = auto)
  activeVersionId String? @unique
  retainVersions Int @default(5)
  createdAt, updatedAt
  versions FeedVersion[]
}

model FeedVersion {
  id, sourceId, number Int     // 1,2,3… per source  @@unique([sourceId, number])
  status VersionStatus
  fileName, fileBytes Int, sha256   @@unique([sourceId, sha256])  // same file twice = no-op
  xmlBlobUrl, listingsBlobUrl
  listingCount Int
  added Int, removed Int, changed Int   // vs the version that was applied when uploaded
  warnings Json?               // parser warnings/errors summary
  note String?                 // optional label, editable
  pinned Boolean @default(false)        // pinned versions are never auto-pruned
  createdById, createdAt
}

model AuditEvent { id, userId?, action, targetType, targetId, meta Json?, createdAt @@index([createdAt]) }
model UserPref   { userId, key, value Json  @@id([userId, key]) }   // favorites, mapping presets
```

Migrations are real `prisma migrate` migrations, run by `prisma migrate deploy` in the Vercel build. There is no `db push` and no boot-time DDL.

## Sources & Versions page (`/sources`)

- **Source list (left / top on mobile):** one row per source showing name, applied version number and date, listing count, a sparkline of listing counts across versions, and the version count.
- **Source detail:** a version timeline with newest first. Each version row shows the number, date, uploader, file name and size, listing count, the +added / −removed / ~changed badges, status, note and pin. The applied version is marked **Live**.
- **Actions** (editor or admin):
  - **Upload new version:** drop one or more XML files. Each file is matched to a source by agency name, or you pick/create a source. It is parsed in the browser, the diff against the live version is shown, and you confirm. The file and the parsed listings go to Blob and the version row is created.
    - It auto-applies unless the safety rule trips: the listing count dropped by more than 30% versus the live version *(call, default)*. In that case it is saved but not applied, with a warning banner.
  - **Apply version:** a confirm dialog shows the diff from live to the target. It sets `Source.activeVersionId`. This is instant (a pointer flip) and is the same action for rollback and roll-forward.
  - **Compare:** pick any two versions to see added, removed and changed listings. Changed listings show their changed fields, reusing `importAnalysis.ts` diff logic. Both blobs are fetched client-side.
  - **Download** the original XML.
  - **Edit note / pin.**
  - **Delete version:** confirm dialog. The live version cannot be deleted; apply another first, or delete the source. This deletes both blobs and the row.
  - **Delete source:** a typed-name confirmation. It deletes all versions, all blobs and the source.
  - **Re-parse with current mapping:** downloads the raw XML, re-parses it with the source's mapping and saves the result as a new version (same sha256 is allowed because the mapping differs; the version records its mapping fingerprint).
- **Retention:** after each upload, versions beyond `retainVersions` are deleted, oldest first, skipping pinned and live versions *(call: default 5, editable per source)*. This keeps Blob under the free 1 GB.
- **Sync with the rest of the site:** every page reads from the `useAppData()` hook. Its `listingsByAgency` holds the live version of each source, and `listings` follows the current scope (all sources, or one). After an apply, upload or delete, the sources query is invalidated, the changed blobs are refetched, and every page updates. Other open tabs catch up on focus.

## Auth

- **Signup:** the first account ever created becomes `admin`. After that, signup is closed unless `ALLOW_SIGNUP=true`, and new accounts are `viewer`. Admins change roles in the admin page *(call)*.
- **Roles** are reduced from six to three *(call)* and enforced on the server for every route:
  - `viewer` can read everything;
  - `editor` can also upload, apply, delete, change mappings and add notes;
  - `admin` can also manage users.
- **Login:** bcrypt, a generic "invalid username or password" message, and rate limiting through the `LoginAttempt` table (5 failures per username or IP in 15 minutes → 429). The cookie is httpOnly, Secure and SameSite=Lax. Sessions last 30 days with a sliding expiry and no in-memory cache.
- **Login and signup pages** contain only a title, fields, submit, a link to the other page, and errors. Removed: the dev alert containing `admin / admin`, the marketing benefits, the "secure session" footer claims, and the role picker.
- **Removed from the seed:** `admin/admin` and all `demo_*` accounts, along with the boot-time seeding. The README describes "sign up → you are admin".

## What gets removed

- **Workspace sync:**
  - `WorkspaceSyncProvider`, `workspaceSync*`, `workspaceSnapshot`, `idbKV`, `syncLogger`;
  - `server/src/sync/*`;
  - the `UserWorkspace` model.
- **Browser listing storage:** `src/lib/storage.ts` shrinks to UI prefs only, and favorites and mapping presets move to `UserPref`. Batch-import snapshots, the import fast-path and the `featureFlags` server-listings flag also go.
- **Stream scan:** `src/lib/streamImport/*`, `StreamAutoSync`, `StreamingImportPanel`, `StreamFeedsPage`, and `StreamingDashboardPage` (1,658 lines). Multi-file upload on `/sources` replaces it. `/import-dashboard`, `/stream-feeds` and `/streaming` redirect to `/sources`.
- **Server:**
  - the import mapper, the listings routes, `searchIndex`, `queryCache`, the Windows/SQLite reconnect logic in `db.ts`, and the `uncaughtException` keep-alive;
  - in the admin routes: the SQLite status, the DB file download, and the full JSON export that leaked session tokens and password hashes;
  - `POST /api/audit` from clients; audit events are now written by the server only.
- **SQLite support:** `server/prisma/sqlite`, the orphan `server/prisma/migrations`, every committed `dev.db*`, and about 15 `db:*` scripts.
- **Dev cruft:**
  - `run-dev*.ps1/.cmd`, `scripts/dev-pg.mjs`, `scripts/stop-dev.mjs`, `scripts/verify-feeds.mjs`;
  - `server/scripts/{doctor,ensure-prisma-client,prisma-generate-safe}.mjs`;
  - the `cmd.exe` concurrently shell, the Vite proxy request logging, `lovable-tagger`, `playwright-fixture.ts`, the `lovable.dev` og:image;
  - `bun.lock`/`bun.lockb` (npm is kept). `docker-compose.yml` shrinks to a single `postgres:16` service (pgAdmin removed) used for local dev and the API tests; production uses Neon *(call: Docker is on the dev machine, so tests need no cloud account)*.
- **Dead UI and dependencies:**
  - 17 unused `src/components/ui/*` files;
  - vaul, input-otp, react-day-picker, react-resizable-panels, react-hook-form, @hookform/resolvers, frontend zod, and the Radix packages used only by deleted UI files;
  - the Radix toaster (sonner is kept).
- **Demo content:** `DEMO_ROWS`/`DEMO_HOME_*` on the home page, which gets a proper empty state linking to `/sources`, and the bundled `XML_EXAMPLE` samples in the import workbench. The `feed/` and `XML_EXAMPLE/` folders move out of git into `.gitignore` (about 96 MB) *(call)*. Tests that need fixtures get a small trimmed XML in `e2e/fixtures/`.

## What stays

All analysis pages and their pure logic modules are kept, with their unit tests:
- listings, database, favorites, listing detail, compare;
- feed-compare (now version vs version);
- cross-agency dupes, field quality, mapping and mapping QA (the mapping is now saved per source);
- validation (now per version);
- geo map, agencies and agents, insights, account, admin (users + audit only).

`/import` is folded into `/sources` (the upload flow). `/field-mapping` stays, editing the mapping of the selected source.

## Production details

- **`vercel.json`:**
  - build `npm run build`, output `dist`;
  - the `/api/(.*)` function is `api/index.ts`, which re-exports the Express app, with `maxDuration` 60;
  - SPA fallback rewrite to `/index.html`;
  - `Cache-Control: public, max-age=31536000, immutable` on `/assets/*`.
- **Prisma:** `binaryTargets = ["native", "rhel-openssl-3.0.x"]` (or the driver adapter `@prisma/adapter-neon`, chosen at plan time after checking current docs). `postinstall: prisma generate`. Build runs `prisma migrate deploy`.
- **Env:** `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED`, `BLOB_READ_WRITE_TOKEN`, `ALLOW_SIGNUP`, `SESSION_TTL_DAYS`. `.env.example` documents them, with no real values.
- **Errors:** the 500 handler returns `{error:"server_error"}` and logs the detail; Zod 400s stay.
- **Repo layout:**
  - one root `package.json` *(call)*: the server dependencies merge into the root and `server/` becomes `server/src` plus `prisma/`, so Vercel installs once;
  - the package is renamed to `feed-viewer-pro`;
  - the scripts are `dev` (vite + `tsx watch server/src/dev.ts` running Express on 8788 with the Vite proxy), `build`, `test` and `test:e2e`, via a cross-platform `concurrently` without the `cmd.exe` shell.

## Testing

- Unit (vitest): keep the existing pure-logic tests. Add tests for the version diff and retention selection, the safety-rule decision, source matching by agency name, role guards, the rate limiter, and the first-user-becomes-admin rule.
- API: supertest against the Express app with a test Postgres schema (`DATABASE_URL` pointed to a Neon branch or a local Postgres) covering auth, sources, versions, apply, delete and retention.
- E2E (Playwright):
  - rewrite the specs around `/sources`: sign up as first user, upload the fixture, see listings, upload v2, compare, apply v1, delete v2, delete source;
  - specs that only tested removed features are deleted.

## Left to the builder

- Exact component split of the `/sources` page, which should reuse existing shadcn components and the existing chart theme.
- Whether `listings.json.gz` omits `rawXml` per listing and the detail page reads it from the XML blob on demand. This is recommended if it halves the blob size; measure on `driven_properties.xml`.
- Breaking up files over 800 lines is **not** in scope except where the data-layer change forces edits anyway.

## Change 2026-10-23: admin bootstrap

Owner request: the admin account exists before anyone signs up. `npm run create-admin [username] [--reset]` creates (or resets) an admin with a random 24-character password and writes it to the git-ignored `.admin-credentials.txt`. The password is never printed or committed. For production, run the same command with `DATABASE_URL` pointing at Neon. Once any user exists, signup stays closed unless `ALLOW_SIGNUP=true`; the "first signup becomes admin" rule only applies to an empty database.
