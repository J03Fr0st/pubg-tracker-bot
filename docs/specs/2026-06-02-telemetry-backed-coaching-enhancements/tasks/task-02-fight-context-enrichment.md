# Task 02: Enrich Fight Context

## Status

complete

## Wave

1

## Description

Expand decisive fight contexts with richer telemetry facts: death weapon/source, killer/finisher, recent damage dealt/taken, heal or item-use attempts, and recent blue-zone damage. The decision engine should still own tactical conclusions; this task only makes evidence available in `FightContext`.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-03-zone-pressure-insight.md, task-04-narration-and-guardrails.md

**Context from dependencies:** None. This task starts from existing `FightContextBuilderService`, `coaching.types.ts`, and focused tests.

## Files to Create

- None expected.

## Files to Modify

- `src/types/coaching.types.ts` — add fields for decisive event details, recent reset/heal facts, and zone-pressure evidence.
- `src/services/fight-context-builder.service.ts` — populate the new fields from raw events.
- `test/unit/services/fight-context-builder.service.test.ts` — add tests for the new context fields.

## Technical Details

### Implementation Steps

1. Extend `FightContext` with evidence fields. Keep names factual and avoid conclusions such as `badRotate` in the type.
2. Extend `FightContextBuilderService.buildFightContexts` inputs only as far as needed. Current signature accepts `damageEvents`; to support heal/item-use/zone state, either add optional event-array parameters with defaults or add a narrow context-input object if that produces less churn.
3. Preserve existing call sites. If changing the method signature, use optional parameters so current production code compiles before call sites are upgraded.
4. Populate decisive event facts:
   - weapon/source when known
   - damage type/category when known
   - damage reason when known
   - killer and finisher names when telemetry distinguishes them
   - enemy distance when positions exist
5. Populate recent timelines:
   - damage taken within existing 45-second context window
   - damage dealt within existing 45-second context window
   - heal/item-use attempts in the context window when supplied
   - blue-zone damage in a 60-second pre-decisive window
6. Do not emit coaching insight text in this task. That belongs in the decision engine.

### Code Snippets

Suggested type additions:

```ts
export interface FightResetEvent {
  timestamp: Date;
  matchTimeSeconds: number;
  itemId?: string;
  healAmount?: number;
}

export interface ZonePressureEvidence {
  damage: number;
  events: FightDamageEvent[];
  windowSeconds: number;
}

export interface FightContext {
  decisiveWeapon?: string;
  decisiveDamageTypeCategory?: string;
  decisiveDamageReason?: string;
  killerName?: string;
  finisherName?: string;
  resetEvents: FightResetEvent[];
  blueZoneDamage: ZonePressureEvidence;
}
```

Adjust names to match local style, but keep the fields factual.

Suggested constants:

```ts
const ZONE_PRESSURE_WINDOW_SECONDS = 60;
```

Recent blue-zone damage can be derived from `LogPlayerTakeDamage`:

```ts
event.damageTypeCategory === 'Damage_BlueZone'
```

Heal/reset events can come from `LogHeal` and `LogItemUse` when those raw events are supplied by the caller. If not supplied, `resetEvents` should be an empty array and no claim should be made.

### Environment Variables

None.

### API Endpoints

None.

## Verification Plan

### RED

- Command: `npx jest test/unit/services/fight-context-builder.service.test.ts --runInBand`
- Expected: New tests fail because enriched fight-context fields are not populated yet.

### GREEN

- Command: `npx jest test/unit/services/fight-context-builder.service.test.ts --runInBand`
- Expected: Tests pass for decisive weapon/source, recent damage timeline, heal/item-use attempts, and recent blue-zone damage evidence.

### Final Verification

- Command: `npm run typecheck`
- Expected: TypeScript passes and existing coaching call sites remain compatible.

## Acceptance Criteria

- [ ] `FightContext` exposes factual decisive event weapon/source fields.
- [ ] `FightContext` exposes killer and finisher names when available.
- [ ] Recent damage dealt and taken remain available in the context window.
- [ ] Recent heal/item-use attempts can be represented without forcing claims.
- [ ] Recent blue-zone damage is summed and attached as factual evidence.
- [ ] Existing fight-context tests still pass.

## Notes

Keep low-confidence or tactical language out of `FightContext`. For example, store `blueZoneDamage.damage = 31`, not `lateRotate = true`.
