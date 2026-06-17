# Task 06: Remove ESLint And Unused Deps

## Status

complete

## Wave

2

## Description

Remove duplicate ESLint tooling and unused direct dependencies. The project already uses Biome for linting/import organization and TypeScript for strict typechecking, including unused locals and parameters. The direct `debug` dependency looked unused by repo code, but must be retained if runtime verification shows a dependency requires it without declaring it.

## Dependencies

**Depends on:** task-01-remove-stale-match-flow-runner.md
**Blocks:** None

**Context from dependencies:** Task 01 removes the stale `test:match-flow` script and runner files. This task updates `package.json` and lockfile after that script cleanup so package metadata reflects only active commands and dependencies.

## Files to Create

- None.

## Files to Modify

- `.eslintrc.js` - delete duplicate ESLint config.
- `package.json` - remove `lint`, `eslint`, `@typescript-eslint/eslint-plugin`, and `@typescript-eslint/parser`; keep `debug` if Docker/runtime verification proves it is required by a dependency.
- `package-lock.json` - update via `npm install` so removed packages disappear where no longer needed directly.
- `README.md` - replace the removed `npm run lint` command with the remaining validation command.

## Technical Details

### Implementation Steps

1. Delete `.eslintrc.js`.
2. In `package.json`, remove the `lint` script:
   ```json
   "lint": "eslint . --ext .ts"
   ```
3. Keep these validation scripts:
   - `format:imports`
   - `typecheck`
   - `check:all`
4. Remove direct dependencies:
   - `eslint` from `devDependencies`
   - `@typescript-eslint/eslint-plugin` from `devDependencies`
   - `@typescript-eslint/parser` from `devDependencies`
5. Run:
   ```powershell
   npm install
   ```
   This updates `package-lock.json` consistently.
6. Do not remove transitive `debug` packages from the lockfile if Prisma or other dependencies still require them.

### Code Snippets

No replacement code is expected. `check:all` should continue to use:

```json
"check:all": "npm run format:imports && npm run typecheck"
```

### Environment Variables

No changes.

### API Endpoints

None.

## Verification Plan

### RED

- Command: `rg "eslint|@typescript-eslint" package.json .eslintrc.js`
- Expected: Before implementation, direct package metadata and ESLint config are present.

### GREEN

- Command: `npm install`
- Expected: Lockfile updates successfully after package removal.

### Final Verification

- Command: `npm run format:imports; npm run typecheck`
- Expected: Biome import/format checks and TypeScript typechecking pass without ESLint.

## Acceptance Criteria

- [ ] `.eslintrc.js` is deleted.
- [ ] `package.json` no longer has a `lint` script using ESLint.
- [ ] Direct ESLint and `@typescript-eslint/*` dev dependencies are removed.
- [ ] Direct `debug` dependency is either removed or retained with runtime evidence.
- [ ] `package-lock.json` is consistent with `package.json`.
- [ ] Biome and TypeScript validation commands remain available.

## Notes

Do not chase transitive dependency names in `package-lock.json`. Only direct package ownership matters unless `npm install` naturally removes unused transitive packages.
