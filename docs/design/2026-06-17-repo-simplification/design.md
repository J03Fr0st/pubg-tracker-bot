# Design: Repo Simplification

## Context

The repository has accumulated several pieces of avoidable complexity: stale match-flow scripts from an older MongoDB storage model, duplicate lint tooling, unused dependencies, scratch files, generated Prisma output under `src`, and small abstractions that add ceremony without changing behavior.

The goal is to reduce maintenance surface while preserving the bot's runtime behavior. This is not a product feature. It is a cleanup pass driven by the repo audit findings so future work scans less generated code, installs fewer packages, and has fewer misleading entry points.

## Approved Approach

Implement the audit findings as one repo simplification feature with independent, reviewable tasks. Each task should remove or shrink one concern and verify that the TypeScript build and relevant tests still pass.

The selected scope is:

- Delete stale match-flow runner files that reference removed MongoDB-era code.
- Move Prisma generated client output out of `src` and update imports accordingly.
- Keep Biome plus TypeScript as the validation stack and remove the duplicate ESLint stack.
- Remove unused direct dependencies.
- Delete tracked scratch files.
- Shrink the logger implementation without changing its exported logging API.
- Simplify the coaching pipeline service by removing single-use indirection while preserving behavior.

This approach was chosen because it keeps behavior-preserving cleanup bounded by existing files and avoids broad architecture changes.

## Alternatives Considered

- Direct refactor without a design/spec workflow - rejected because the requested work was explicitly routed through `plan-feature`, and the changes span several files.
- Separate specs per audit finding - rejected because the findings are small, related cleanup items and would create more process overhead than useful isolation.
- Large rewrite of Discord or coaching services - rejected because the audit findings only justify removing avoidable complexity, not changing product behavior or domain boundaries.

## Architecture

The cleanup preserves the current runtime architecture:

```text
index.ts
  -> DiscordBotService / MatchMonitorService
  -> repositories
  -> Prisma client
```

For Prisma, the generated client should remain generated code, but it should no longer live under `src`. The schema generator output should move to a generated location outside the application source tree, such as `generated/prisma`, and application imports should point to that location.

For tooling, Biome remains responsible for formatting, import organization, and lint rules configured in `biome.json`. TypeScript remains responsible for strict typechecking via `npm run typecheck`. ESLint configuration and packages are redundant once Biome and TypeScript cover the active checks.

For logging, callers should keep importing the same named helpers from `src/utils/logger.ts` (`debug`, `info`, `success`, `warn`, `error`, `database`, `discord`, `monitor`, `startup`, `shutdown`). The implementation can be a small level-aware console wrapper instead of a singleton class with icon/color maps and setter APIs.

For coaching, `CoachingPipelineService` should keep the same observable behavior: analyze insights, return `empty` when none exist, narrate when insights exist, and return failed results for analyze or narrate errors. The cleanup should remove single-use interfaces and namespace construction ceremony, not alter the pipeline result contract.

## Configuration and Inputs

No new runtime environment variables are required.

Existing configuration remains unchanged:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_CHANNEL_ID`
- `PUBG_API_KEY`
- `DATABASE_URL`
- existing optional PUBG, monitoring, and LLM settings

No command-line interface is being added. The stale `test:match-flow` command should be removed if its runner is deleted.

## Decisions

- Do not change Discord bot behavior, PUBG API behavior, Prisma models, migrations, or coaching output semantics.
- Remove stale match-flow scripts instead of trying to repair them, because they reference removed MongoDB-era service names and duplicate integration coverage exists under `test/integration`.
- Keep generated Prisma output out of `src` so source scans and task planning focus on handwritten code.
- Keep Biome and TypeScript as the validation stack; remove ESLint as duplicate tooling.
- Preserve logger exports so callers do not need broad unrelated edits.
- Preserve `CoachingPipelineService` behavior while simplifying its dependency shape.

## Risks and Constraints

- Moving Prisma generated output can break imports or build scripts if `prisma generate` is not aligned with TypeScript paths.
- Removing ESLint must not remove the only active unused-code signal; `tsconfig.json` already has `noUnusedLocals` and `noUnusedParameters`.
- Logger simplification should avoid changing message visibility in production versus development.
- Coaching pipeline simplification must keep tests focused on the same failure and empty-result behavior.
- This work should avoid opportunistic refactors in large services such as `DiscordBotService`.

## Verification Strategy

Use focused checks per task and repo-level verification at the end.

Task-level verification:

- Confirm deleted stale scripts are no longer referenced by `package.json`, README, or script docs.
- Run Prisma generation after moving the output path and confirm TypeScript imports compile.
- Run package cleanup with `npm install` so `package-lock.json` reflects removed dependencies.
- Run focused tests for logger and coaching pipeline if existing tests cover those modules; otherwise rely on TypeScript and dependent service tests.

Final verification:

```powershell
npm run format:imports
npm run typecheck
npm test -- --runInBand
git diff --check
```

