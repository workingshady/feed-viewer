# Feed Viewer Pro

Preview and quality-check real-estate XML property feeds, with a version history per agency.

## Features

- **Sources and versions:** each agency feed is a source, and every upload becomes a numbered version. One version per source is live, and every page shows the live data.
- **Apply, compare, roll back:** switch any version live, compare two versions (added, removed and changed listings), pin, annotate and delete versions.
- **Safety rule:** an upload that loses a large share of the live listings is saved for review instead of going live.
- **Quality score:** per-version checks for photos, permits, map location, descriptions, prices and agent contacts. Problem listings can be exported as CSV.
- **Explore and analyze:** listings grid, map, agencies and agents, field quality, validation, duplicate detection across agencies, side-by-side comparison.
- **Field mapping:** per-source XML-to-field mapping, with re-parse of the live file.
- **Roles:** viewer, editor and admin, enforced by the server.

## Stack

React, Vite, TanStack Query, Tailwind and shadcn/ui on the front end. An Express API runs as a serverless function. Postgres is accessed through Prisma, and uploaded files are kept in object storage.

## Development

```bash
npm install
npm run dev
npm test
```

Environment variables are listed in `.env.example`.
