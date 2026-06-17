# Task 02: Move Prisma Generated Output

## Status

complete

## Wave

1

## Description

Move Prisma generated client output outside `src` so source scans and task planning focus on handwritten code. The current schema generates into `../src/generated/prisma`, which creates thousands of generated lines under application source even though `.gitignore` already treats it as generated.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** None

**Context from dependencies:** None. This task changes only generated-output configuration and imports that directly reference the generated Prisma client.

## Files to Create

- None expected. `npx prisma generate` will create generated output as a build artifact, not a committed source file.

## Files to Modify

- `prisma/schema.prisma` - change the Prisma generator `output` path to a generated location outside `src`.
- `.gitignore` - ignore the new generated output path and remove or adjust the old `/src/generated/prisma` ignore entry if appropriate.
- `src/data/prisma.client.ts` - update the generated Prisma client import path.
- `src/data/repositories/telemetry.repository.ts` - update the generated Prisma type import path.

## Technical Details

### Implementation Steps

1. In `prisma/schema.prisma`, change:
   ```prisma
   output = "../src/generated/prisma"
   ```
   to:
   ```prisma
   output = "../generated/prisma"
   ```
2. In `.gitignore`, add:
   ```gitignore
   /generated/prisma
   ```
   Keep `/src/generated/prisma` ignored if local old output may remain during transition, or remove it only after confirming no old generated output is needed.
3. Update imports:
   - `src/data/prisma.client.ts` currently imports `PrismaClient` from `../generated/prisma/client`. From `src/data`, the new relative path should point to `../../generated/prisma/client`.
   - `src/data/repositories/telemetry.repository.ts` currently imports `Prisma` from `../../generated/prisma/client`. From `src/data/repositories`, the new relative path should point to `../../../generated/prisma/client`.
4. Run Prisma generation:
   ```powershell
   npx prisma generate
   ```
5. Confirm generated output exists under `generated/prisma` and that `src/generated/prisma` is no longer required by imports.
6. Do not modify Prisma models or migrations in this task.

### Code Snippets

Expected import changes:

```ts
// src/data/prisma.client.ts
import { PrismaClient } from '../../generated/prisma/client';
```

```ts
// src/data/repositories/telemetry.repository.ts
import type { Prisma } from '../../../generated/prisma/client';
```

### Environment Variables

No changes.

### API Endpoints

None.

## Verification Plan

### RED

- Command: `rg "src/generated/prisma|\\.\\./generated/prisma|\\.\\./\\.\\./generated/prisma" prisma src -g "*.prisma" -g "*.ts"`
- Expected: Before implementation, the schema and imports point generated output into `src`.

### GREEN

- Command: `npx prisma generate`
- Expected: Prisma generation succeeds and writes generated output under `generated/prisma`.

### Final Verification

- Command: `npm run typecheck`
- Expected: TypeScript resolves the generated client imports and passes.

## Acceptance Criteria

- [ ] Prisma generator output no longer targets `src/generated/prisma`.
- [ ] New generated output path is ignored by git.
- [ ] All handwritten TypeScript imports compile against the new generated client path.
- [ ] Prisma models and migrations are unchanged.

## Notes

Generated output should remain untracked. If old local files under `src/generated/prisma` remain after generation, remove them from the working tree only if they are untracked/generated and not needed.
