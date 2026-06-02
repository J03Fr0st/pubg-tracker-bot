# Task 03: Add Zone Pressure Insight

## Status

complete

## Wave

2

## Description

Add conservative zone-pressure coaching to the decision engine. The coach should mention zone pressure only when recent material blue-zone damage is connected to the decisive fight or death, avoiding noisy advice for tiny or stale zone damage.

## Dependencies

**Depends on:** task-01-kill-weapon-extraction.md, task-02-fight-context-enrichment.md
**Blocks:** task-04-narration-and-guardrails.md

**Context from dependencies:** Task 01 fixes kill weapon/source extraction so death evidence is reliable. Task 02 enriches `FightContext` with factual `blueZoneDamage` and decisive event details. This task consumes those context fields and turns them into ranked coaching claims.

## Files to Create

- None expected.

## Files to Modify

- `src/services/coaching-decision-engine.service.ts` — add zone-pressure scoring and claim generation.
- `src/config/coaching-weights.ts` — add a documented zone-pressure weight if scoring needs one.
- `src/types/coaching.types.ts` — only if `CoachingCategory` or related union types need a new `'rotation'` or zone-pressure-specific kind.
- `test/unit/services/coaching-decision-engine.service.test.ts` — add tests for zone-pressure claim emission and omission.

## Technical Details

### Implementation Steps

1. Add constants in `CoachingDecisionEngineService`:
   - material blue-zone damage: `25`
   - use the `windowSeconds` supplied by `FightContext` from Task 02, expected to be `60`
2. Add a helper such as `hasMaterialZonePressure(context)` that returns true only when recent blue-zone damage is at least 25.
3. Add a claim builder for zone pressure. Example wording:
   - `You took 31 blue-zone damage in the 60s before this fight, so the rotate was already costing health before the duel.`
4. Keep recommendation practical and within supplied better plays. Suggested additional better play:
   - `rotate earlier before taking optional fights`
5. Add scoring only enough for zone pressure to be included when it is relevant. Do not let zone pressure outrank a clearly stronger bad-reset/death context unless it is attached to the same decisive context.
6. Preserve the existing maximum of two insights.
7. Do not create loot, weapon-discipline, or vehicle-rotation insights in this task.

### Code Snippets

Suggested claim helper:

```ts
const MATERIAL_BLUE_ZONE_DAMAGE = 25;

private buildZonePressureClaim(context: FightContext): FightContextClaim | null {
  if (context.blueZoneDamage.damage < MATERIAL_BLUE_ZONE_DAMAGE) {
    return null;
  }

  return {
    text: `You took ${Math.round(context.blueZoneDamage.damage)} blue-zone damage in the ${context.blueZoneDamage.windowSeconds}s before this fight, so the rotate was already costing health before the duel.`,
    confidence: 'high',
    evidence: [`Blue-zone damage before decisive event: ${Math.round(context.blueZoneDamage.damage)}`],
  };
}
```

If adding a scoring weight:

```ts
export interface CoachingScoringWeights {
  zonePressureKnown: number;
}
```

Update default weights and tests so legacy behavior remains stable except when zone evidence exists.

### Environment Variables

None.

### API Endpoints

None.

## Verification Plan

### RED

- Command: `npx jest test/unit/services/coaching-decision-engine.service.test.ts --runInBand`
- Expected: New zone-pressure tests fail because no claim is emitted yet.

### GREEN

- Command: `npx jest test/unit/services/coaching-decision-engine.service.test.ts --runInBand`
- Expected: Zone-pressure claim is emitted for recent blue-zone damage >= 25 and omitted for tiny or stale/no evidence.

### Final Verification

- Command: `npm run typecheck`
- Expected: TypeScript passes with scoring weights and context types aligned.

## Acceptance Criteria

- [ ] Zone-pressure evidence is included for recent material blue-zone damage.
- [ ] Zone-pressure evidence is omitted for blue-zone damage below 25.
- [ ] Zone-pressure evidence is omitted when the context has no recent zone evidence.
- [ ] Existing bad-reset, teammate-distance, stacked-angle, and height claims still work.
- [ ] Insight output remains capped at two sections.

## Notes

This rule should be conservative. Blue-zone damage is common in telemetry; the coach should not blame every death on rotation.
