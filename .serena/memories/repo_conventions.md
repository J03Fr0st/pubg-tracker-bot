# Repository conventions

## Code shape

- Use strict TypeScript, two-space indentation, semicolons, and the existing naming style (`PlayerStatsService`, `MatchRepository`, `calculateOpponentDifficulty`).
- Services own workflows, repositories own Prisma access, and utilities remain side-effect-light.
- Keep shared interfaces in `src/types` or beside the owning module when they are private implementation details.
- Prefer the smallest local change. Do not introduce broad abstractions for one caller.

## PUBG SDK boundary

- Use `@j03fr0st/pubg-ts` for every PUBG API call; do not add direct `fetch`, Axios, or custom PUBG HTTP wrappers.
- Version 2 exposes domain modules on `PubgClient`. Fetch telemetry with `client.matches.getTelemetry(matchId)` and use `client.assets` for catalog lookups.
- Season-stat batch requests accept at most ten account IDs per request; preserve the chunking in `PlayerStatsService`.

## Data and configuration

- Use the repository classes in `src/data/repositories` for PostgreSQL access.
- Update `prisma/schema.prisma` and add a migration for persistent schema changes; generated Prisma output lives under `generated/prisma`.
- Never commit `.env` or credentials. Required variables are `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CHANNEL_ID`, `PUBG_API_KEY`, and `DATABASE_URL`.
- Optional behavior is configured through `PUBG_SHARD`, monitoring/rate-limit variables, and the `LLM_*`/`OPENROUTER_*` variables documented in `.env.example`.

## Tests and formatting

- Jest unit tests live under `test/unit`; integration tests live under `test/integration` and use `jest.integration.config.js`.
- Update tests for behavior changes at Discord, telemetry, repository, and PUBG SDK boundaries.
- Biome owns formatting/import cleanup. `npm run format` and `npm run format:imports` write files; inspect their diff before staging.
- The current Husky pre-commit script calls `npm run lint`, but `package.json` has no `lint` script. Run the documented checks manually and do not assume the hook is healthy until that mismatch is fixed.

## Git and delivery

- Use conventional commits scoped to one logical change.
- Stage named files so local caches, telemetry data, `.env`, and unrelated edits remain out of commits.
- PRs must describe the change, reason, validation commands, and deployment impact. Include Discord examples for visible embed changes.
