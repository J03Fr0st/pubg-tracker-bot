# Task 04: Polish Narration And Guardrails

## Status

complete

## Wave

3

## Description

Make template and LLM-backed narration present the richer death-review and zone-pressure evidence cleanly. The narrator should remain a formatter, not a tactical interpreter, and guardrails must continue rejecting invented facts.

## Dependencies

**Depends on:** task-02-fight-context-enrichment.md, task-03-zone-pressure-insight.md
**Blocks:** None

**Context from dependencies:** Task 02 adds richer factual evidence to `FightContext`; Task 03 turns zone pressure into `CoachingInsight` claims/evidence. This task ensures those richer insights render well in Discord and remain protected by LLM guardrails.

## Files to Create

- None expected.

## Files to Modify

- `src/services/coaching-narrator.service.ts` — tune template output if needed so richer evidence remains readable and line-limited.
- `src/services/openrouter-coaching-llm-client.service.ts` — ensure LLM payload includes claims/evidence/better plays already supplied by the decision engine; avoid raw telemetry.
- `src/services/coaching-llm-guardrail.ts` — adjust allowed text/number handling only if new evidence formatting is rejected incorrectly.
- `test/unit/services/coaching-narrator.service.test.ts` — add template narration coverage for death-review and zone-pressure evidence.
- `test/unit/services/openrouter-coaching-llm-client.service.test.ts` — verify richer insight payload is sent without raw telemetry.
- `test/unit/services/coaching-llm-guardrail.test.ts` — verify invented names/numbers/terrain/advice are still rejected with richer evidence.

## Technical Details

### Implementation Steps

1. Start with tests that pass a `CoachingInsight` containing:
   - decisive death evidence
   - a weapon/source value
   - blue-zone damage evidence
   - better plays including rotate earlier, break line of sight, heal, and re-engage from a new angle
2. Verify current template narration already handles the richer evidence. If it does, keep code changes minimal and only add tests.
3. If template lines become too long, adjust formatting by preserving the existing line truncation behavior instead of adding complex layout rules.
4. Confirm `OpenRouterCoachingLlmClient` sends only structured insight data: player, title/category/kind, match time, severity, confidence, claims, evidence, betterPlay, and recommendation.
5. Confirm guardrails allow numbers/names present in the supplied insight and still reject unsupported terrain labels or advice not present in `betterPlay` / `recommendation`.

### Code Snippets

Example insight evidence to use in tests:

```ts
const insight: CoachingInsight = {
  playerName: 'Aculite',
  category: 'decisive-mistake',
  kind: 'decisive-mistake',
  title: 'Decisive mistake',
  timestamp: new Date('2026-05-25T16:27:19.510Z'),
  matchTimeSeconds: 841,
  severity: 'high',
  confidence: 'high',
  evidence: [
    'You took 67 damage from EnemyOne, healed zero, moved 8m, then died to the same player with M416.',
    'You took 31 blue-zone damage in the 60s before this fight.',
  ],
  recommendation:
    'Rotate earlier, break line of sight, heal, then re-engage only from a new angle.',
  betterPlay: [
    'rotate earlier before taking optional fights',
    'break line of sight',
    'heal before re-engaging',
    'force a new angle',
  ],
};
```

No raw telemetry object should be passed to the LLM client.

### Environment Variables

No new variables. Existing variables still apply:

- `LLM_COACHING_ENABLED`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `LLM_TIMEOUT_MS`

### API Endpoints

The existing OpenRouter endpoint remains unchanged:

- `POST https://openrouter.ai/api/v1/chat/completions`

## Verification Plan

### RED

- Command: `npx jest test/unit/services/coaching-narrator.service.test.ts test/unit/services/openrouter-coaching-llm-client.service.test.ts test/unit/services/coaching-llm-guardrail.test.ts --runInBand`
- Expected: New tests fail if richer evidence is missing from template/LLM payload or guardrail handling is too restrictive.

### GREEN

- Command: `npx jest test/unit/services/coaching-narrator.service.test.ts test/unit/services/openrouter-coaching-llm-client.service.test.ts test/unit/services/coaching-llm-guardrail.test.ts --runInBand`
- Expected: Narration tests pass, richer evidence is included, and guardrails still reject invented facts.

### Final Verification

- Command: `npm run typecheck`
- Expected: TypeScript passes and no raw telemetry is introduced into the LLM contract.

## Acceptance Criteria

- [ ] Template narration includes richer death-review and zone-pressure evidence.
- [ ] Template lines remain capped by existing `maxLineLength` behavior.
- [ ] OpenRouter payload includes structured insight facts only, not raw telemetry events.
- [ ] Guardrails still reject invented player/enemy names.
- [ ] Guardrails still reject invented numbers.
- [ ] Guardrails still reject unsupported terrain and unsupported advice.

## Notes

Do not loosen the guardrail just to make generated prose pass. If the LLM wants to say something, the deterministic insight must provide that fact or advice first.
