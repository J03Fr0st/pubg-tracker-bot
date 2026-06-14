# Repository Guidelines

## Project Structure & Module Organization

This is a TypeScript Discord bot for PUBG match monitoring and telemetry analysis. Runtime code lives under `src/`: configuration in `src/config`, data access in `src/data`, services in `src/services`, shared types in `src/types`, and helpers in `src/utils`. Prisma schema and migrations are in `prisma/`. Tests live under `test/unit` and `test/integration`. Operational assets include Docker, GitHub workflow, script, and Unraid files.

## Build, Test, and Development Commands

- `npm run dev` starts the bot with `ts-node` and `nodemon`.
- `npm run build` compiles TypeScript to `dist/`.
- `npm start` runs the compiled app from `dist/index.js`.
- `npm test` runs the Jest unit test suite.
- `npm run test:integration` runs integration tests via `jest.integration.config.js`.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run format:imports` applies Biome checks/fixes for `src`, `test`, and `scripts`.
- `npm run docker:build` builds the production Docker image.

## Coding Style & Naming Conventions

Use strict TypeScript and existing service/repository patterns. Services own workflows, repositories own Prisma access, and utilities stay side-effect-light. Use two-space indentation, semicolons, and explicit interfaces for shared shapes. Prefer names like `PlayerStatsService`, `MatchRepository`, and `calculateOpponentDifficulty`. Do not add broad abstractions for single-use behavior.

## PUBG API Usage

Use `@j03fr0st/pubg-ts` for all PUBG API calls. Do not add direct `fetch`, `axios`, or custom HTTP wrappers for PUBG endpoints unless `pubg-ts` cannot support the case and the exception is documented in the PR. When integrating new PUBG data, prefer extending or fixing `pubg-ts` usage over bypassing it.

## Testing Guidelines

Jest is the test framework. Put unit tests in `test/unit/.../*.test.ts` and integration coverage in `test/integration/...*.test.ts`. Add or update tests for behavior changes, especially Discord embed output, telemetry processing, Prisma repositories, and PUBG API boundaries. Run `npm run typecheck` plus the relevant Jest target before committing.

## Commit & Pull Request Guidelines

Use conventional commit style seen in history, for example `feat(unraid): add app template` or `fix(discord): read pubg-ts season stats response`. Keep commits scoped to one logical change. PRs should explain what changed, why it changed, validation commands run, and any deployment impact. Include screenshots or Discord embed examples when changing visible output.

## Security & Configuration Tips

Never commit `.env` or credentials. Required runtime configuration includes `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CHANNEL_ID`, `PUBG_API_KEY`, and `DATABASE_URL`. Docker startup runs Prisma migrations, so ensure Postgres is reachable before deploying. For Unraid, provide an existing Postgres URL rather than bundling a database container.
