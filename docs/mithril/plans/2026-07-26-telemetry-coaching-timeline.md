# Telemetry Coaching Timeline Implementation Plan

**Design:** `docs/mithril/specs/2026-07-25-telemetry-coaching-timeline-design.md`

**Goal:** Build the approved normalized telemetry foundation, run it at the coaching seam, and keep
current Discord output unchanged while the derived timeline is validated in shadow mode.

**Architecture:** `MatchPresentationService` passes stable monitored-player identities and the
complete raw telemetry stream to `CoachingPipelineService`. `TelemetryTimelineBuilderService`
normalizes and deterministically orders the stream. `PlayerStateProjectorService` derives lifecycle
and concurrent activity intervals. `EncounterSegmenterService` isolates combat evidence. A
`TimelineCoachingShadowService` owns those three steps and returns diagnostics without affecting the
existing visible `FightContextBuilderService` adapter.

**Tech stack:** TypeScript, `@j03fr0st/pubg-ts`, Jest, Biome.

## Task 1: Carry stable account identity through analysis

**Files:**

- Modify: `src/types/analytics-results.types.ts`
- Modify: `src/services/telemetry-processor.service.ts`
- Modify: `src/services/match-presentation.service.ts`
- Test: `test/unit/services/telemetry-processor.test.ts`
- Test: `test/unit/services/match-presentation.service.test.ts`

1. Add a `TrackedPlayerIdentity` interface with `name` and `accountId`.
2. Add `accountId` to `PlayerTelemetry`.
3. Change `TelemetryProcessorService.processMatchTelemetry` to accept monitored identities.
4. Add a failing unit test proving an analysis exposes the supplied account ID.
5. Add a failing presentation test proving both cached and live paths preserve identity input.
6. Implement the smallest identity flow that passes both tests.
7. Run:
   `npm test -- --runInBand test/unit/services/telemetry-processor.test.ts test/unit/services/match-presentation.service.test.ts`

## Task 2: Define the normalized timeline contracts

**Files:**

- Create: `src/types/coaching-timeline.types.ts`
- Test: `test/unit/services/telemetry-timeline-builder.service.test.ts`

Define:

- `TimelineIdentity`
- `TimelinePosition`
- `TimelineEventCategory`
- `NormalizedTelemetryEvent`
- `TimelineDiagnostic`
- `TelemetryTimeline`
- `PlayerCoreState`
- `PlayerActivityState`
- `PlayerStateInterval`
- `PlayerStateProjection`
- `EncounterOutcome`
- `TelemetryEncounter`
- `TimelineShadowResult`

Contracts must make account ID authoritative, retain source event type, retain deterministic source
index, expose match-relative time, and carry compact evidence data without creating a second PUBG
event schema.

## Task 3: Normalize the complete telemetry stream

**Files:**

- Create: `src/services/telemetry-timeline-builder.service.ts`
- Test: `test/unit/services/telemetry-timeline-builder.service.test.ts`

1. Add failing tests for:
   - timestamp and source-index ordering;
   - equal timestamps;
   - malformed or missing timestamps;
   - account-ID-first actor and target extraction;
   - name-only fallback confidence;
   - known combat, lifecycle, movement, healing, inventory, vehicle, zone, and match events;
   - unknown event retention as `generic`;
   - input immutability.
2. Implement a source-type metadata table covering every event type exported by installed
   `@j03fr0st/pubg-ts` 2.0.0.
3. Extract actor, target, position, vehicle, item, damage, phase, alive-player count, and carry state
   only where the SDK contract exposes them.
4. Sort valid events by timestamp, then source index.
5. Retain malformed events as generic records with diagnostics and place them after timestamped
   events deterministically.
6. Run:
   `npm test -- --runInBand test/unit/services/telemetry-timeline-builder.service.test.ts`

## Task 4: Project lifecycle and activity state

**Files:**

- Create: `src/services/player-state-projector.service.ts`
- Test: `test/unit/services/player-state-projector.service.test.ts`

1. Add table-driven failing tests for:
   - alive to knocked to revived to alive;
   - knocked to carried to knocked;
   - knocked to dead;
   - direct alive to dead;
   - logout and login restoration;
   - vehicle ride and leave;
   - swim start and end;
   - contradictory transition diagnostics;
   - one monitored player not changing another player's state.
2. Implement non-overlapping core-state intervals and independent activity intervals.
3. Record the normalized event IDs that opened and closed each interval.
4. Lower confidence and add diagnostics for ambiguous transitions rather than inventing state.
5. Do not implement redeploy until the SDK exposes the official event type.
6. Run:
   `npm test -- --runInBand test/unit/services/player-state-projector.service.test.ts`

## Task 5: Segment independent combat encounters

**Files:**

- Create: `src/config/coaching-timeline.ts`
- Create: `src/services/encounter-segmenter.service.ts`
- Test: `test/unit/services/encounter-segmenter.service.test.ts`

1. Centralize encounter inactivity and spatial-separation thresholds.
2. Add failing tests proving:
   - damage, attack, knock, armor, and kill evidence is grouped by monitored player and opponent;
   - a revive closes the old encounter;
   - damage before a revive cannot seed a post-revive encounter;
   - death closes an encounter;
   - time gaps create a boundary;
   - different opponent identities do not merge merely because names match;
   - environmental damage does not invent an opponent;
   - equal timestamps produce stable encounter IDs.
3. Implement deterministic encounter IDs derived from monitored account ID and ordinal.
4. Include decisive outcome and evidence IDs in each encounter.
5. Run:
   `npm test -- --runInBand test/unit/services/encounter-segmenter.service.test.ts`

## Task 6: Run the timeline in shadow mode at the coaching seam

**Files:**

- Create: `src/services/timeline-coaching-shadow.service.ts`
- Modify: `src/services/coaching-pipeline.service.ts`
- Modify: `src/services/match-presentation.service.ts`
- Modify: `src/app.ts`
- Test: `test/unit/services/timeline-coaching-shadow.service.test.ts`
- Test: `test/unit/services/coaching-pipeline.service.test.ts`
- Test: `test/unit/services/match-presentation.service.test.ts`
- Test: `test/unit/app.test.ts`

1. Add a failing service test proving one raw stream produces a timeline, state projection, and
   encounters without mutating its input.
2. Change `CoachingPipelineService.run` to accept:
   - `MatchAnalysis`;
   - `TrackedPlayerIdentity[]`;
   - `TelemetryEvent[]`.
3. Inject a `deriveTimeline` dependency and execute it before the legacy visible analyzer.
4. Keep timeline failures best-effort and diagnostic-only in shadow mode.
5. Adapt the legacy analyzer inside the application composition root by filtering damage, reset, and
   revive events there temporarily.
6. Add a presentation test proving the complete raw array and account identities reach the pipeline
   for both cached and live telemetry.
7. Keep current narration and Discord embed behavior unchanged.
8. Run:
   `npm test -- --runInBand test/unit/services/timeline-coaching-shadow.service.test.ts test/unit/services/coaching-pipeline.service.test.ts test/unit/services/match-presentation.service.test.ts test/unit/app.test.ts`

## Task 7: Add the reported regression at the new public seam

**Files:**

- Modify: `test/integration/telemetry-discord-flow.integration.test.ts`

1. Add the telemetry sequence:
   - player takes 100 damage;
   - the same event window knocks the player;
   - no revive occurs;
   - the same opponent kills the player eight seconds later.
2. Assert the state projection remains knocked until death.
3. Assert encounter evidence does not expose an actionable reset window.
4. Assert Discord output does not include “before creating a reset”.
5. Run:
   `npm test -- --runInBand test/integration/telemetry-discord-flow.integration.test.ts`

## Task 8: Verify Phase 1

1. Run `npm run lint`.
2. Run `npm run typecheck`.
3. Run `npm test -- --runInBand --silent`.
4. Run `npm run build`.
5. Confirm the diff contains no changes from the nested worktree and no unrelated dirty-tree files.
6. Confirm the implementation-plan document remains uncommitted unless explicitly approved.

## Follow-on phases

Phase 2 replaces the legacy analyzer with isolated failed-reset, team-spacing, damage-conversion,
movement/exposure, and recovery/revive detectors over enriched encounters. Phase 3 adds zone, armor,
utility, vehicle, carry, and SDK-supported redeploy context. Phase 4 adds candidate ranking,
deduplication, established causal links, and deterministic narrative assembly before the existing LLM
guardrail.

## Completion status

Implemented on 2026-07-26:

- Phase 2: enriched encounter facts, evidence provenance, isolated detector results, detector failure
  isolation, and the core fight detectors.
- Phase 3: lifecycle accuracy, zone rotation, armor disadvantage, utility usage, vehicle decision,
  carry context, and a deliberately suppressed redeploy detector until `@j03fr0st/pubg-ts` exposes a
  typed redeploy event.
- Phase 4: deterministic ranking, deduplication, candidate caps, evidence-only claims, causal links,
  and narrative assembly before the existing narration guardrail.
- Public migration: `CoachingPipelineService` now delegates to the timeline analyzer; the temporary
  fight-context adapter, decision engine, coaching weights, geometry helper, and their compatibility
  tests were removed.
- Regression and resilience: Discord integration coverage proves 100 damage that immediately causes
  DBNO does not create a false reset window, visible coaching still reaches Discord, cache and live
  telemetry paths agree, and coaching failure does not suppress the normal match embeds.
