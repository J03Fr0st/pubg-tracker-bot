# Task completion

Before calling work complete:
- For code changes, run the narrowest meaningful Jest suite for the touched area and `npm run typecheck`.
- For formatting/import-sensitive changes, run `npm run format:imports` or at least check the specific files with Biome.
- For Discord integration changes, verify both behavior tests and startup/channel validation paths when relevant.
- For Prisma/database changes, inspect `prisma/schema.prisma`, generated client implications, and migration state.
- If a full `npm test` run is too slow, report the targeted suites that were run and why they cover the change.