# Repo conventions

- Keep code in TypeScript and preserve existing service/repository boundaries.
- Use Prisma for database access through `src/data/repositories` rather than ad hoc database calls.
- Tests use Jest with `ts-jest`; add focused unit tests near the affected service/repository when behavior changes.
- Biome is used for import/format cleanup via `npm run format:imports`.
- Avoid committing credentials or local environment files. Required runtime secrets live in `.env` and include Discord token/client/channel IDs plus PUBG API settings and database connection.
- The package has a `prepare` script for Husky, but it is intentionally tolerant when Husky is unavailable.