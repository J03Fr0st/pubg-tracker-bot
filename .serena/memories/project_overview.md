# Project overview

`pubg-tracker-bot` is a TypeScript Discord bot that monitors PUBG matches, processes telemetry, calculates match difficulty, and posts player analysis and coaching output to Discord.

## Runtime flow

1. `src/index.ts` validates environment configuration, starts `DiscordBotService`, and starts `MatchMonitorService`.
2. `MatchMonitorService` loads monitored players, finds unprocessed matches through `@j03fr0st/pubg-ts`, persists match data, and builds Discord summaries.
3. `DiscordBotService` validates the configured guild text channel, fetches telemetry through `PubgClient.matches.getTelemetry(matchId)`, and renders summary/player embeds.
4. `TelemetryProcessorService` produces per-player analytics. The fight-context, decision-engine, pipeline, narrator, and optional OpenRouter client turn strong evidence into coaching output.
5. `PlayerStatsService` fetches season statistics in batches and supplies lobby/opponent difficulty calculations through a PostgreSQL-backed cache.

## Main areas

- `src/config`: environment-backed application and coaching configuration.
- `src/data/repositories`: Prisma-backed access for players, matches, processed matches, telemetry, and season-stat cache entries.
- `src/services`: Discord, match monitoring, telemetry, difficulty inputs, and coaching workflows.
- `src/types` and `src/utils`: shared contracts and side-effect-light helpers.
- `prisma/schema.prisma` and `prisma/migrations`: PostgreSQL data model and migration history.
- `test/unit` and `test/integration`: Jest coverage for services, repositories, telemetry, Discord output, and permission failures.
- `scripts`, `Dockerfile`, `docker-compose.yml`, `unraid`, and `.github/workflows/docker-release.yml`: versioning and deployment assets.

## Operational facts

- Development starts from `src/index.ts`; production starts from `dist/src/index.js`.
- PUBG API access must go through `@j03fr0st/pubg-ts` v2. Use client-local domain modules such as `players`, `matches`, `seasons`, and `assets`.
- PostgreSQL is required. Docker startup runs `prisma migrate deploy` before starting the bot.
- Optional LLM narration uses OpenRouter; deterministic template narration remains available when it is disabled or unavailable.
- Docker images are published to `joevreug/pubg-tracker-bot` when `main` changes.
