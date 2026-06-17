# Task 01: Remove Stale Match Flow Runner

## Status

complete

## Wave

1

## Description

Remove the stale manual match-flow runner and its wrappers. The runner imports `mongoose` and `PubgStorageService`, but the current codebase uses Prisma repositories and no longer has that service. Keeping the runner makes the repo advertise an entry point that cannot compile or run.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-06-remove-eslint-and-unused-deps.md

**Context from dependencies:** None. This task starts from the current script and README references. It blocks package cleanup because `package.json` has a `test:match-flow` script pointing at `scripts/run-test.js`.

## Files to Create

- None.

## Files to Modify

- `scripts/test-match-flow.ts` - delete stale TypeScript runner.
- `scripts/test-match-flow.js` - delete duplicate JS wrapper for the stale runner.
- `scripts/run-test.js` - delete duplicate JS wrapper for the stale runner.
- `scripts/README-test-match-flow.md` - delete stale runner documentation or remove references if the file still contains other useful content.
- `scripts/example-test-usage.sh` - delete stale example script.
- `scripts/example-test-usage.bat` - delete stale example script.
- `README.md` - remove the match-flow runner section and any stale MongoDB or `mongoose` dependency reference discovered during this task.
- `package.json` - remove the `test:match-flow` script entry.

## Technical Details

### Implementation Steps

1. Delete the stale runner files:
   - `scripts/test-match-flow.ts`
   - `scripts/test-match-flow.js`
   - `scripts/run-test.js`
   - `scripts/example-test-usage.sh`
   - `scripts/example-test-usage.bat`
2. Inspect `scripts/README-test-match-flow.md`. If it only documents the removed runner, delete it. If it has reusable troubleshooting content, remove stale runner-specific content and keep only still-accurate notes.
3. Update `package.json` by removing:
   ```json
   "test:match-flow": "node scripts/run-test.js"
   ```
4. Update `README.md` to remove stale manual runner commands such as:
   ```text
   npx ts-node scripts/test-match-flow.ts ...
   npm run test:match-flow -- ...
   ```
5. Remove any README claim that `mongoose` is an active runtime dependency. Historical docs under `docs/plans` may mention MongoDB migration history; do not edit those unless they are active user-facing instructions.
6. Do not add a replacement CLI in this task. Existing Jest integration tests remain the supported automated verification path.

### Code Snippets

No replacement code is expected.

### Environment Variables

No changes. Existing runtime environment variables remain unchanged.

### API Endpoints

None.

## Verification Plan

### RED

- Command: `rg "test-match-flow|test:match-flow|run-test|PubgStorageService|mongoose" package.json README.md scripts src test -g "!node_modules" -g "!dist"`
- Expected: Before implementation, this finds stale runner references in `package.json`, `README.md`, and `scripts`.

### GREEN

- Command: `rg "test-match-flow|test:match-flow|run-test|PubgStorageService|mongoose" package.json README.md scripts src test -g "!node_modules" -g "!dist"`
- Expected: No matches in active source, scripts, package metadata, or README. Historical matches in `docs/plans` are out of scope and should not be included in this command.

### Final Verification

- Command: `npm run typecheck`
- Expected: TypeScript passes without references to the deleted runner files.

## Acceptance Criteria

- [ ] Stale match-flow runner and both JS wrappers are removed.
- [ ] Stale example scripts and runner docs are removed or made accurate.
- [ ] `package.json` no longer exposes `test:match-flow`.
- [ ] Active README docs no longer tell users to run the stale script.
- [ ] No active source or script references remain to `PubgStorageService` or `mongoose`.

## Notes

Keep this task focused on deleting stale runner surface. Do not change integration tests or Discord bot behavior.
