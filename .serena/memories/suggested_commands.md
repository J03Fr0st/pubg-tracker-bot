# Suggested commands

## Setup and runtime

- Reproducible install: `npm ci`
- Development: `npm run dev`
- Development with console output: `npm run dev:console`
- Compile: `npm run build`
- Start compiled output: `npm start`
- Register Discord slash commands: `npm run update-commands`

## Verification

- Typecheck: `npm run typecheck`
- Lint source, tests, and scripts: `npm run lint`
- Full Jest suite: `npm test -- --runInBand`
- Focused Jest file: `npx jest <test-file> --runInBand`
- Integration suite: `npm run test:integration -- --runInBand`
- Formatting check: `npm run format:check`
- Apply source/test import and Biome fixes: `npm run format:imports`
- Apply repo-wide formatting: `npm run format`
- Lint plus typecheck: `npm run check:all`
- Dependency tree: `npm ls --omit=dev @j03fr0st/pubg-ts`
- Production dependency audit: `npm audit --omit=dev`

`format` and `format:imports` mutate files. Review `git diff` immediately afterward. `lint`, `format:check`, and `check:all` are non-writing checks. There is no `test:match-flow` package script.

## Prisma and PostgreSQL

- Generate client: `npx prisma generate`
- Validate schema: `npx prisma validate`
- Create a development migration: `npx prisma migrate dev --name <migration-name>`
- Apply committed migrations: `npx prisma migrate deploy`

Prisma commands require `DATABASE_URL`; use a safe local PostgreSQL database for development migrations.

## Docker and releases

- Build image: `npm run docker:build`
- Run image: `npm run docker:run`
- Start Compose stack: `docker compose up --build -d`
- Follow bot logs: `docker compose logs -f bot`
- Stop Compose stack: `docker compose down`
- Increment build: `npm run version:build`
- Increment semantic version: `npm run version:patch`, `npm run version:minor`, or `npm run version:major`

The GitHub Docker workflow builds and publishes images when changes land on `main`.
