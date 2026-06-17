# Task 05: Simplify Coaching Pipeline

## Status

complete

## Wave

1

## Description

Simplify `CoachingPipelineService` by removing single-use interfaces and namespace construction ceremony while preserving pipeline behavior. The service should still analyze, return `empty` when no insights exist, narrate when insights exist, and report failed stages for analyze or narrate errors.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** None

**Context from dependencies:** None. This task touches only the coaching pipeline service, its current construction in `DiscordBotService`, and direct unit tests.

## Files to Create

- None.

## Files to Modify

- `src/services/coaching-pipeline.service.ts` - inline the dependency shape and remove single-use exported interfaces/namespace if no longer needed.
- `src/services/discord-bot.service.ts` - update construction if `CoachingPipelineService.withDefaults` is removed.
- `test/unit/services/coaching-pipeline.service.test.ts` - update tests to construct the simplified service directly.

## Technical Details

### Implementation Steps

1. Inspect current usage:
   ```powershell
   rg "CoachingPipelineService\\.withDefaults|new CoachingPipelineService|CoachingAnalyzer|CoachingNarrator|CoachingPipelineDefaults" src test -g "*.ts"
   ```
2. Replace exported single-use interfaces with a local or exported dependency type only if useful:
   ```ts
   type CoachingPipelineDeps = {
     analyze: (
       matchAnalysis: MatchAnalysis,
       trackedPlayerNames: string[],
       damageEvents: LogPlayerTakeDamage[],
       resetEvents: Array<LogHeal | LogItemUse>
     ) => CoachingInsight[];
     narrate: (insights: CoachingInsight[]) => Promise<CoachingNarration>;
   };
   ```
3. Remove the `export namespace CoachingPipelineService` and `withDefaults` helper if no other code needs it.
4. In `DiscordBotService`, construct the pipeline directly with:
   - `analyze`: build fight contexts with `this.fightContextBuilder.buildFightContexts(...)`, then call `this.coachingDecisionEngine.createInsights(contexts)`.
   - `narrate`: call `this.coachingNarrator.narrate(...)`.
5. Preserve `CoachingPipelineResult` behavior:
   - analyze exception -> `{ kind: 'failed', stage: 'analyze', reason }`
   - no insights -> `{ kind: 'empty' }`
   - narrate success -> `{ kind: 'ok', insights, narration }`
   - narrate exception -> `{ kind: 'failed', stage: 'narrate', reason }`
6. Do not change `CoachingDecisionEngineService`, `FightContextBuilderService`, or narration semantics.

### Code Snippets

Expected direct construction pattern in `DiscordBotService`:

```ts
this.coachingPipeline = new CoachingPipelineService({
  analyze: (analysis, names, damage, resetEvents) => {
    const contexts = this.fightContextBuilder.buildFightContexts(
      analysis,
      names,
      damage,
      resetEvents
    );
    return this.coachingDecisionEngine.createInsights(contexts);
  },
  narrate: (insights) => this.coachingNarrator.narrate(insights),
});
```

### Environment Variables

No changes.

### API Endpoints

None.

## Verification Plan

### RED

- Command: `rg "CoachingPipelineService\\.withDefaults|CoachingAnalyzer|CoachingNarrator|CoachingPipelineDefaults" src test -g "*.ts"`
- Expected: Before implementation, this finds the single-use indirection.

### GREEN

- Command: `npx jest test/unit/services/coaching-pipeline.service.test.ts --runInBand`
- Expected: Pipeline tests pass with simplified construction and unchanged behavior.

### Final Verification

- Command: `npm run typecheck`
- Expected: TypeScript passes with no stale references to removed pipeline interfaces or namespace helper.

## Acceptance Criteria

- [ ] Single-use `CoachingAnalyzer`, `CoachingNarrator`, and `CoachingPipelineDefaults` exports are removed or reduced to the minimal useful local type.
- [ ] `CoachingPipelineService.withDefaults` namespace helper is removed if no longer needed.
- [ ] `DiscordBotService` constructs the pipeline directly.
- [ ] Existing pipeline result behavior is unchanged and covered by tests.
- [ ] No broader coaching behavior changes are introduced.

## Notes

Keep this task narrow. It should not refactor the large Discord service beyond the pipeline constructor call.
