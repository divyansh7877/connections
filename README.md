# Connections

Mobile web MVP for event networking with one shared QR code per room.

## Run

```bash
bun start
```

Open [http://localhost:3000](http://localhost:3000).

## Test

```bash
bun test
```

## Notes

- Rooms are stored in `data/store.json`.
- Rooms expire automatically after 8 hours by default.
- Runtime and scripts are Bun-native.
- QR display currently uses the hosted image endpoint at `api.qrserver.com`; the join link remains usable even if that image is blocked.
