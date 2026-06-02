# Requirements: Telemetry-Backed Coaching Enhancements

## Summary

The existing PUBG coach already has the right shape: deterministic telemetry services select coaching facts, and the narrator turns those facts into Discord text. A real downloaded telemetry sample showed that the bot can extract more reliable death and fight context than it currently uses.

This feature improves the coach in three incremental steps: fix real `LogPlayerKillV2` weapon extraction, enrich decisive fight context with death/source/timeline/zone facts, and add a conservative zone-pressure insight. The result should make coaching more specific without letting the LLM infer from raw telemetry.

## Goals

- Correctly extract kill weapon/source data from nested real `LogPlayerKillV2` damage info.
- Enrich decisive fight contexts with death-review and fight-timeline evidence.
- Add deterministic zone-pressure coaching when recent material blue-zone damage contributes to a decisive event.
- Keep Discord coaching concise, confidence-aware, and backed by supplied telemetry facts.

## Non-Goals

- Do not add a new slash command.
- Do not let the LLM inspect raw telemetry or invent tactical conclusions.
- Do not emit first-class loot-readiness, weapon-discipline, or vehicle-rotation advice in this feature.
- Do not render maps, replay paths, or claim terrain objects such as compounds, ridges, trees, walls, bridges, or cover.
- Do not introduce new environment variables or runtime configuration for thresholds.

## Acceptance Criteria

- [ ] `TelemetryProcessorService` uses nested `finishDamageInfo.damageCauserName` / `killerDamageInfo.damageCauserName` for `LogPlayerKillV2` kill weapons, with fallback behavior.
- [ ] Fight contexts expose decisive weapon/source, recent damage timeline, recent damage dealt, recent heal/reset attempts, and recent blue-zone damage evidence.
- [ ] `CoachingDecisionEngineService` emits zone-pressure evidence only for recent material blue-zone damage near a decisive event.
- [ ] Tiny or stale blue-zone damage does not produce zone-pressure coaching.
- [ ] Template and LLM narration continue to use only supplied insight facts and stay within configured line limits.
- [ ] Focused unit tests and type-check pass.

## Assumptions

- `LogPlayerKillV2` damage info can appear as an object, array, null, or undefined, matching `@j03fr0st/pubg-ts` flexible damage info types.
- Existing `LogPlayerTakeDamage` events are reliable enough for blue-zone damage detection.
- Existing 45-second fight context, 60-damage heavy damage, and 15-meter reposition thresholds remain acceptable initial values.
- Zone-pressure should start with a 60-second pre-death window and 25-damage materiality threshold.

## Technical Constraints

- Tactical interpretation remains deterministic and lives in services, not in the LLM.
- `CoachingPipelineService` remains the orchestration entry point.
- Keep changes scoped to existing coaching/telemetry modules and tests.
- Tasks in the same implementation wave must not modify overlapping files.
- No production behavior should depend on the local `telemetry-analysis/` artifact.
