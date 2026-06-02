# Design: Telemetry-Backed Coaching Enhancements

## Context

The current coach already follows the right architecture: deterministic telemetry services decide the coaching facts, and the narrator only turns those facts into Discord-ready text. Recent real telemetry analysis from match `508d5283-20a9-430a-b33c-c7e41e0af183` showed that the available data is richer than the current coach uses.

The most important finding is concrete: real `LogPlayerKillV2` events do not reliably expose kill weapon data on top-level `damageCauserName`. Weapon evidence is nested under fields such as `finishDamageInfo` and `killerDamageInfo`. Fixing this improves existing weapon stats, kill chains, and death-review evidence before adding new coaching behavior.

The target user is a tracked PUBG player receiving automatic Discord match summaries. The coach should become more specific about why a fight was lost, while staying telemetry-backed and confidence-aware.

## Approved Approach

Use an incremental deterministic-coach upgrade.

First, repair known telemetry extraction gaps and enrich the existing fight context model. Then add a small number of high-confidence insight families that directly improve the decisive fight review:

- death-review context
- fight timeline evidence
- zone-pressure context

Loot readiness, weapon discipline, and vehicle rotation review should be designed into the data model as future-compatible context, but not forced into first implementation unless the evidence and thresholds are conservative enough to avoid noisy coaching.

This approach fits the existing codebase because `TelemetryProcessorService`, `FightContextBuilderService`, `CoachingDecisionEngineService`, `CoachingNarratorService`, and `CoachingPipelineService` already form the right boundaries. The work should deepen those modules instead of creating a second coaching path.

## Alternatives Considered

- Add all new coaching categories at once — rejected because loot, weapon discipline, and vehicle advice need threshold tuning across more than one real sample. Shipping them together would increase noisy or overconfident advice.
- Let the LLM inspect raw telemetry and produce coaching — rejected because existing project decisions explicitly require deterministic tactical interpretation and guardrailed narration only.
- Build a separate replay-analysis module outside the current coaching pipeline — rejected because the current pipeline is already extracted and testable; a parallel path would duplicate orchestration and make Discord output harder to reason about.

## Architecture

The existing flow remains the owner of coaching:

```text
Raw telemetry
  -> TelemetryProcessorService
  -> MatchAnalysis
  -> FightContextBuilderService
  -> FightContext[]
  -> CoachingDecisionEngineService
  -> CoachingInsight[]
  -> CoachingNarratorService
  -> Discord coaching embed
```

### TelemetryProcessorService

Improve raw-event normalization and calculated stats.

Responsibilities:

- Extract weapon evidence from real `LogPlayerKillV2` shapes.
- Prefer `finishDamageInfo.damageCauserName`, then `killerDamageInfo.damageCauserName`, then any legacy top-level fallback.
- Preserve raw kill, knock, damage, revive, and fire-count events for downstream context.
- Continue producing existing weapon stats and kill chains, but with corrected kill weapons.

### FightContextBuilderService

Expand `FightContext` so the decision engine can explain a death or knock with richer facts.

New or expanded context should include:

- decisive event weapon when known
- decisive event damage type and reason
- killer and finisher names where telemetry distinguishes them
- enemy distance at decisive event
- player health near decisive event when present
- recent damage timeline in the existing context window
- recent damage dealt timeline in the same window
- heal and boost attempts in the context window
- reposition distance between first damage and decisive event
- blue-zone damage and recent zone state near decisive event

The builder should distinguish raw evidence from tactical conclusions. For example, "took 31 blue-zone damage in the prior 60s" is evidence; "late rotate pressure contributed" is a conclusion emitted only by the decision engine.

### CoachingDecisionEngineService

Keep output short and ranked. The current maximum of two insights is still appropriate:

1. Decisive mistake
2. Pattern to fix

Enhance decisive mistake evidence with:

- death weapon/source
- previous damage sequence
- whether the player traded meaningful damage back
- whether a heal/reset attempt happened
- whether zone damage or circle pressure was part of the setup

Add one new first-class rule in the first implementation pass:

- Zone pressure: emit when blue-zone damage or forced movement materially contributed to the decisive fight or death.

Keep the existing bad-reset, no-trade-pressure, stacked-angle, and height-advantage rules, but let them consume the richer context.

Defer first-class loot-readiness, weapon-discipline, and vehicle-rotation rules until there is enough telemetry output to tune thresholds. The context fields can be added conservatively if they are useful for future work, but the decision engine should not emit noisy advice.

### CoachingNarratorService

The narrator contract does not change structurally. It should receive richer `CoachingInsight` evidence and claims, then render concise lines.

Template narration should improve even without LLM mode by producing lines such as:

```text
8:42 - Decisive mistake
- You took 67 damage from EnemyOne, healed zero, moved 8m, then died to the same player with M416.
- You had 31 blue-zone damage in the minute before the fight.
Do this: rotate earlier, break line of sight, heal, then re-engage only from a new angle.
```

LLM guardrails remain mandatory:

- no invented names
- no invented numbers
- no unsupported terrain labels
- no advice outside supplied `betterPlay`

### DiscordBotService

Discord output stays as a coaching embed after the match/player summaries. The embed should remain brief and omit lower-ranked evidence rather than exceeding Discord limits.

## Configuration and Inputs

No new environment variables are required for the first implementation.

Inputs are existing telemetry events and existing tracked player names:

- `LogPlayerKillV2`
- `LogPlayerTakeDamage`
- `LogPlayerMakeGroggy`
- `LogPlayerPosition`
- `LogGameStatePeriodic`
- `LogPhaseChange`
- `LogHeal`
- `LogItemUse`
- `LogWeaponFireCount`

Existing configurable LLM behavior remains unchanged:

- `LLM_COACHING_ENABLED`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `LLM_TIMEOUT_MS`

Thresholds should stay code-level constants at first, matching the current coaching style. Only promote them to config after repeated tuning proves they need runtime adjustment.

Suggested initial thresholds:

- Context window: keep existing 45 seconds for fight review.
- Zone pressure window: 60 seconds before decisive event.
- Material blue-zone damage: start at 25 damage.
- Meaningful reposition: keep existing 15 meters until more samples suggest otherwise.
- Heavy damage: keep existing 60 damage.

## Decisions

- Keep deterministic services responsible for tactical interpretation.
- Fix `LogPlayerKillV2` weapon extraction before adding new advice.
- Treat death review as an enrichment of `FightContext`, not as a separate service.
- Add zone-pressure coaching in the first implementation because the sample strongly supports reliable blue-zone damage and circle-state events.
- Defer loot-readiness, weapon-discipline, and vehicle-rotation coaching as emitted insight categories until thresholds are validated across more samples.
- Preserve concise Discord output: at most two coaching sections per match unless a later design changes the product shape.
- Keep terrain language restricted to measured geometry and zone facts; do not claim cover, compounds, ridges, bridges, or map objects without a later map-classification system.

## Risks and Constraints

- Real telemetry event shapes vary. Parser helpers should use defensive extraction and tests based on realistic nested shapes.
- Blue-zone damage is abundant in telemetry, so zone-pressure rules must avoid blaming every death near zone damage. The rule should require material damage close to the decisive event.
- Solo, duo, and squad modes have different coaching value. Team-trade claims are less useful in solo; zone and death-review claims work across modes.
- `LogPlayerPosition` is rich but large. Avoid persisting or transforming more raw position data than needed for the current context.
- Height data exists, but current design should continue treating height advantage as medium confidence at best until validated across more maps.
- Loot and weapon advice can become noisy quickly. They should not emit player-facing claims until thresholds are proven with real matches.

## Verification Strategy

Use focused unit tests first, then one real telemetry verification run.

Unit tests:

- `TelemetryProcessorService` extracts kill weapon from `finishDamageInfo`.
- `TelemetryProcessorService` falls back to `killerDamageInfo` and then legacy top-level fields.
- `FightContextBuilderService` includes death weapon/source and recent damage timeline.
- `FightContextBuilderService` includes recent heal or item-use events when supplied.
- `FightContextBuilderService` includes blue-zone damage in the pre-death window.
- `CoachingDecisionEngineService` emits zone-pressure evidence only when blue-zone damage is material and recent.
- `CoachingDecisionEngineService` does not emit zone-pressure evidence for tiny or stale blue-zone damage.
- `CoachingNarratorService` template output includes richer evidence without exceeding line limits.
- LLM guardrail tests still reject invented names, numbers, terrain, and unsupported advice.

Regression commands:

```powershell
npx jest test/unit/services/telemetry-processor.test.ts test/unit/services/fight-context-builder.service.test.ts test/unit/services/coaching-decision-engine.service.test.ts test/unit/services/coaching-narrator.service.test.ts --runInBand
npm run typecheck
git diff --check
```

Manual verification:

- Re-run the downloaded telemetry sample through the updated processor.
- Confirm the coach identifies Aculite's self-death source correctly from nested kill damage info.
- Confirm zone-pressure does not emit unless the tracked player's decisive event has recent material blue-zone damage.
- Confirm the Discord coaching embed stays short and omits low-confidence claims.
