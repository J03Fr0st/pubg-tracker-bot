# Project overview

- `pubg-tracker-bot` is a TypeScript Discord bot for PUBG match monitoring, telemetry analysis, performance scoring, and coaching output.
- Runtime entrypoint is `src/index.ts`; production runs from compiled `dist/index.js`.
- Main source areas:
  - `src/services`: Discord bot, match monitoring, PUBG stats/storage, telemetry processing, fight context, and coaching services.
  - `src/data`: Prisma client and repository classes.
  - `src/types`: shared TypeScript contracts for analytics, coaching, Discord summaries, and monitoring.
  - `src/config/config.ts`: environment-backed configuration.
  - `prisma/schema.prisma` and `prisma/migrations`: database schema/history.
  - `test/unit` and `test/integration`: Jest coverage.
- Important operational context: Discord delivery can fail because of effective channel/category permissions even when `DISCORD_CHANNEL_ID` is correct.