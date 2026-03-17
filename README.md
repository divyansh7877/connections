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

## Current behavior

- Create a temporary room with a 6-character code.
- Join with name + LinkedIn URL.
- See room membership update in realtime.
- Remove your own membership from the current browser session.
- Block joins after expiry and purge stale rooms later.
