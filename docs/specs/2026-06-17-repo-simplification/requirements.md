# Requirements: Repo Simplification

## Summary

The repository should be easier to scan, build, and maintain without changing the PUBG tracker bot's runtime behavior. The audit identified stale scripts, duplicate tooling, unused dependencies, scratch files, generated code in the application source tree, and small abstractions that can be simplified.

This feature removes that avoidable complexity in bounded tasks. The result should keep existing Discord bot behavior, Prisma schema behavior, telemetry processing, and coaching output semantics intact.

## Goals

- Remove stale or misleading files that no longer match the Prisma-based codebase.
- Move generated Prisma client output outside `src` and update imports accordingly.
- Reduce package and tooling surface by keeping Biome plus TypeScript and removing duplicate ESLint tooling.
- Preserve public module exports and runtime behavior while shrinking logger and coaching pipeline implementation complexity.
- Verify the repository still typechecks and tests pass after cleanup.

## Non-Goals

- Do not change Discord command behavior or embed output semantics.
- Do not change PUBG API integration behavior.
- Do not alter Prisma models, migrations, or database schema.
- Do not add replacement match-flow CLI behavior in this feature.
- Do not refactor large services beyond the specific logger and coaching pipeline cleanup.

## Acceptance Criteria

- [ ] Stale match-flow runner files are deleted and no active package or README references point to them.
- [ ] Prisma generated output is configured outside `src`, and application imports compile.
- [ ] ESLint config and direct ESLint-related dev dependencies are removed while Biome and TypeScript checks remain.
- [ ] Direct dependencies are reduced where runtime transitive imports permit it.
- [ ] Tracked scratch files identified by the audit are removed.
- [ ] Logger exports remain source-compatible for existing callers.
- [ ] Coaching pipeline result behavior remains covered by tests.
- [ ] `npm run typecheck`, `npm test -- --runInBand`, and `git diff --check` pass after implementation.

## Assumptions

- `src/generated/prisma` is generated output and is intentionally ignored by `.gitignore`.
- `tsconfig.json` unused checks plus Biome cover the active quality gate after ESLint removal.
- The stale match-flow runner is not a supported user-facing CLI because it imports `mongoose` and `PubgStorageService`, neither of which matches the current codebase.
- Existing integration tests are the supported way to verify match processing behavior.

## Technical Constraints

- Keep changes surgical and tied directly to the audit findings.
- Tasks in the same wave must not modify overlapping files.
- Use `@j03fr0st/pubg-ts` for PUBG API access; this cleanup must not add direct PUBG HTTP calls.
- Keep the lockfile consistent with `package.json` after dependency changes.
