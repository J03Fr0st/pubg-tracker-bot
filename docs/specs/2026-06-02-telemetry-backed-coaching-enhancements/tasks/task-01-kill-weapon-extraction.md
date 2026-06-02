# Task 01: Fix Kill Weapon Extraction

## Status

complete

## Wave

1

## Description

Fix kill weapon extraction for real `LogPlayerKillV2` telemetry. The downloaded real match showed that kill weapon/source data is nested under `finishDamageInfo` or `killerDamageInfo`, not reliably present as top-level `damageCauserName`. This task improves existing weapon stats and kill-chain evidence before new coaching rules depend on that evidence.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-03-zone-pressure-insight.md

**Context from dependencies:** None. This task starts from the current `TelemetryProcessorService` and its tests.

## Files to Create

- None expected.

## Files to Modify

- `src/services/telemetry-processor.service.ts` — add a helper for extracting kill weapon/source from `LogPlayerKillV2` flexible damage info and use it in weapon stats/kill chains.
- `test/unit/services/telemetry-processor.test.ts` — add tests for nested `finishDamageInfo`, nested `killerDamageInfo`, array-shaped damage info, and legacy fallback.

## Technical Details

### Implementation Steps

1. Inspect current kill weapon usage in `TelemetryProcessorService`. Existing code calls `this.getReadableWeaponName(kill.damageCauserName)` in kill stats and kill chains.
2. Add a private helper that extracts a damage causer from `LogPlayerKillV2` safely.
3. Use this helper wherever kill weapon/source is derived from a `LogPlayerKillV2`.
4. Preserve existing fallback behavior for older or synthetic test objects that still have top-level `damageCauserName`.
5. Keep helper scope private unless another task needs it; do not create a new abstraction unless the code becomes duplicated outside this service.

### Code Snippets

Suggested helper shape:

```ts
import { DamageInfoUtils, type LogPlayerKillV2 } from '@j03fr0st/pubg-ts';

private getKillDamageCauserName(kill: LogPlayerKillV2): string {
  const finishDamage = DamageInfoUtils.getFirst(kill.finishDamageInfo)?.damageCauserName;
  if (finishDamage && finishDamage !== 'None') {
    return finishDamage;
  }

  const killerDamage = DamageInfoUtils.getFirst(kill.killerDamageInfo)?.damageCauserName;
  if (killerDamage && killerDamage !== 'None') {
    return killerDamage;
  }

  return (kill as LogPlayerKillV2 & { damageCauserName?: string }).damageCauserName ?? '';
}
```

Use this helper in:

- `calculateWeaponStats` kill loop
- longest-kill weapon derivation, if present
- `createKillChain` weapon list

The real sample shape that motivated this task:

```json
{
  "_T": "LogPlayerKillV2",
  "finisher": { "name": "Aculite" },
  "finishDamageInfo": {
    "damageTypeCategory": "Damage_Gun",
    "damageCauserName": "WeapKar98k_C"
  },
  "killerDamageInfo": null
}
```

### Environment Variables

None.

### API Endpoints

None.

## Verification Plan

### RED

- Command: `npx jest test/unit/services/telemetry-processor.test.ts --runInBand`
- Expected: New tests fail because `LogPlayerKillV2` nested weapon data is not used yet.

### GREEN

- Command: `npx jest test/unit/services/telemetry-processor.test.ts --runInBand`
- Expected: Tests pass, including cases where kill weapon comes from `finishDamageInfo`, `killerDamageInfo`, array-shaped flexible damage info, and legacy top-level fallback.

### Final Verification

- Command: `npm run typecheck`
- Expected: TypeScript passes without widening public types unnecessarily.

## Acceptance Criteria

- [ ] Kill weapon extraction prefers `finishDamageInfo.damageCauserName`.
- [ ] Kill weapon extraction falls back to `killerDamageInfo.damageCauserName`.
- [ ] Array-shaped flexible damage info is handled safely.
- [ ] Legacy top-level `damageCauserName` remains a fallback.
- [ ] Existing weapon stat and kill-chain outputs use corrected weapon names.

## Notes

Avoid changing unrelated telemetry calculations. This task is intentionally narrow because later coaching tasks depend on this extraction being trustworthy.
