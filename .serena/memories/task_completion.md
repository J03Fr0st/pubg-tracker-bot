# Task completion

Before calling work complete:

1. Inspect `git status --short` and the scoped diff. Preserve unrelated edits and exclude secrets, generated telemetry, caches, and local configuration.
2. Run `npm run typecheck` and the narrowest Jest suite that proves the changed behavior.
3. Run `npm test -- --runInBand` for broad service or shared-type changes, and `npm run test:integration -- --runInBand` for Discord/telemetry workflow changes.
4. Run `npm run build` when runtime code, dependencies, TypeScript configuration, or Docker output changes.
5. Run a non-writing Biome check or inspect the diff after any writing formatter. Avoid accepting repo-wide line-ending or formatting churn unrelated to the task.
6. For Prisma changes, validate the schema, generate the client, inspect the migration, and verify migration deployment against a safe database.
7. For PUBG SDK changes, confirm the installed production tree with `npm ls --omit=dev @j03fr0st/pubg-ts` and exercise the affected API boundary in tests.
8. For Docker/runtime dependency changes, build the image when Docker is available and verify migrations/startup from `dist/src/index.js`.
9. For Discord delivery changes, cover normal guild text channels, missing required permissions, inaccessible channels, and rejection of thread channels.
10. Report skipped checks, Jest open-handle warnings, audit findings, and deployment impact accurately.

The pre-commit hook runs `npm run lint`, `npm run typecheck`, and the default Jest suite in-band. It does not replace the separate integration configuration, build, dependency audit, Prisma, PUBG SDK tree, Docker, or deployment checks required by the relevant items above.
