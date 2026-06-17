# Task 04: Shrink Logger

## Status

complete

## Wave

1

## Description

Replace the current large logger singleton with a small level-aware console wrapper while preserving the named exports used by existing services. The current implementation has setter APIs, icon/color maps, extensive comments, and specialized methods that can be represented more directly.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** None

**Context from dependencies:** None. This task modifies only `src/utils/logger.ts` and preserves its caller-facing helper exports.

## Files to Create

- None.

## Files to Modify

- `src/utils/logger.ts` - shrink implementation while keeping exported helpers source-compatible.

## Technical Details

### Implementation Steps

1. Inspect current imports across `src`:
   ```powershell
   rg "from '../utils/logger'|from './utils/logger'|from '../../src/utils/logger'" src test -g "*.ts"
   ```
2. Preserve these named exports:
   - `debug`
   - `info`
   - `success`
   - `warn`
   - `error`
   - `database`
   - `discord`
   - `monitor`
   - `startup`
   - `shutdown`
3. Preserve `LogLevel` only if it is imported outside `logger.ts`. If not, it can be removed or kept as a local implementation detail.
4. Replace class/singleton/setter implementation with a small function map. Requirements:
   - Debug logs appear only when `NODE_ENV === 'development'`.
   - Info/success/database/discord/monitor/startup/shutdown use `console.log`.
   - Warn uses `console.warn`.
   - Error uses `console.error`.
   - Object contexts are rendered with `JSON.stringify(context, null, 2)`.
   - `Error` contexts include message and stack when present.
5. Avoid changing message text at callsites. Minor logger prefix changes are acceptable if tests do not assert exact console output.

### Code Snippets

One possible compact shape:

```ts
type Context = string | object | Error;

const shouldDebug = () => process.env.NODE_ENV === 'development';

function format(message: string, context?: Context): string {
  if (!context) return message;
  if (context instanceof Error) {
    return `${message}\n${context.stack ?? context.message}`;
  }
  if (typeof context === 'object') {
    return `${message}\n${JSON.stringify(context, null, 2)}`;
  }
  return `${message} ${context}`;
}

export const debug = (message: string, context?: string | object): void => {
  if (shouldDebug()) console.debug(format(message, context));
};
```

The exact implementation can differ, but it should be substantially smaller and keep the same export names.

### Environment Variables

- `NODE_ENV` - existing environment variable used to determine debug visibility.

### API Endpoints

None.

## Verification Plan

### RED

- Command: `Get-Content src/utils/logger.ts | Measure-Object -Line`
- Expected: Before implementation, the logger is roughly 240 lines.

### GREEN

- Command: `npm run typecheck`
- Expected: All logger callers compile against the preserved named exports.

### Final Verification

- Command: `npm test -- --runInBand`
- Expected: Test suite passes with the simplified logger.

## Acceptance Criteria

- [ ] Logger implementation is substantially smaller than the current singleton class.
- [ ] Existing named logger helper exports still exist.
- [ ] Debug logging remains gated to development.
- [ ] Warn and error still use appropriate console methods.
- [ ] TypeScript and tests pass without changing unrelated callsites.

## Notes

Do not add a new logging dependency. The goal is to shrink this code, not replace it with another abstraction.
