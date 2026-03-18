# Connections V2

TanStack Start frontend hosted on Vercel with Convex as the realtime backend.

## Stack

- TanStack Start
- Convex
- React Query
- Vercel deployment target

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create or connect a Convex project:

```bash
npx convex dev
```

3. Start the app:

```bash
npm run dev
```

## Required environment

Convex injects `VITE_CONVEX_URL` during local setup. For hosted environments, set the same value in Vercel.

For LinkedIn enrichment, also set these Convex server env vars:

- `BLAXEL_AGENT_URL`
- `BLAXEL_AGENT_TOKEN`
- `BLAXEL_WORKSPACE` (optional when your agent URL already encodes the workspace)

## Current behavior

- Create a temporary room with a 6-character code.
- Join with name + LinkedIn URL.
- Enrich LinkedIn URLs asynchronously into profile cards with photo, headline, and AI summary.
- Reuse cached LinkedIn profile data across rooms for 7 days.
- See room membership update in realtime.
- Remove your own membership from the current browser session.
- Block joins after expiry and purge stale rooms later.

## Blaxel agent

The Blaxel-hosted summarizer agent lives in [`linkedin-summarizer/`](/Users/divagarwal/Projects/connections/linkedin-summarizer).

Local workflow:

1. Install the package-local dependencies in `linkedin-summarizer/`.
2. Run `npm test` inside `linkedin-summarizer/`.
3. Run `bl serve --hotreload` inside `linkedin-summarizer/`.
4. Deploy from that directory with `bl deploy`.
