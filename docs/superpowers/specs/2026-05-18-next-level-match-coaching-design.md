# Next-Level Match Coaching Design

## Goal

Upgrade the current match coaching feature from a single deterministic rule plus narration into a stricter hybrid coach that explains what the player should have done to improve their chance of winning.

The coach should lead with the decisive fight or death review, then add one broader match pattern only when telemetry strongly supports it. The tone should be strict and blunt, but geometry and terrain claims must remain confidence-aware.

## Decisions

- Coaching style: hybrid coach.
- Primary output: decisive fight review first.
- Secondary output: one recurring habit or pattern if supported.
- Tone: strict and blunt.
- Terrain scope: fight geometry inferred from telemetry, not map-region labels.
- Enemy references: use enemy names when telemetry provides them.
- Uncertain geometry: use cautious wording for medium-confidence claims and omit low-confidence claims.
- LLM role: narrator only. Deterministic services own tactical interpretation.

## Non-Goals

- Do not let the LLM infer tactics from raw telemetry.
- Do not claim map-specific terrain such as field, ridge, compound, tree, rock, wall, city, bridge, or shoreline unless a later map-classification system supplies that evidence.
- Do not render maps or replay paths.
- Do not produce long coaching essays in Discord.
- Do not block normal match summary posting if coaching fails.

## Architecture

```text
Telemetry events
  -> TelemetryProcessorService
  -> FightContextBuilder
  -> FightContext[]
  -> CoachingDecisionEngine
  -> CoachingInsight[]
  -> CoachingNarratorService
  -> Discord coaching embed
```

The current `MatchCoachingService` should evolve from direct event-rule matching into an orchestrator that consumes `FightContext` objects. This keeps tactical reconstruction separate from advice selection and narration.

## Fight Context Model

Each `FightContext` represents a decisive fight window around a tracked player's knock or death. The default window should cover roughly 20-45 seconds before the decisive event, with thresholds tuned after real local match output.

Core fields:

- tracked player name
- enemy name when known
- outcome: knock or death
- decisive event time and match time
- damage taken timeline
- damage dealt timeline when available
- player positions at key moments
- enemy positions when available
- closest tracked teammate at the decisive moment
- teammate distance
- whether teammate was likely in trade range
- whether the player meaningfully repositioned after damage
- whether the player repeated the same enemy challenge
- height delta when z-position data is present and stable
- confidence flags for each tactical claim

The model should distinguish facts from conclusions. For example, "nearest tracked teammate was 78m away" is evidence; "outside likely trade range" is a conclusion with confidence.

## Geometry And Terrain

For this version, terrain means fight geometry inferred from telemetry:

- Distance geometry: distance between player, attacker, and tracked teammates.
- Trade geometry: whether a teammate was close enough to punish the enemy after the player took damage or died.
- Reposition geometry: whether the player meaningfully changed position between taking damage and dying.
- Height geometry: whether the enemy had a meaningful elevation advantage, only when position z-values are present and stable.
- Exposure inference: cautious wording when the player took repeated damage without meaningful movement or reset.

The coach must not claim map-zone labels or physical cover objects without explicit supporting data.

## Coaching Decision Engine

The decision engine should produce at most two coaching points per match:

1. Decisive mistake: the strongest explanation of the fight that ended the player's match or removed their ability to win.
2. Pattern to fix: one broader issue only if repeated evidence exists.

Initial decisive-fight rules:

- Bad reset: the player took heavy damage, stayed engaged, and was knocked or killed by the same enemy shortly after.
- No trade pressure: the player fought or died while the nearest tracked teammate was outside likely trade range.
- Same-angle repeat: the player took damage, then challenged the same enemy again without meaningful position change.
- Height disadvantage: the player died while fighting from lower elevation into an enemy with a meaningful height advantage, if z-position data supports it.
- Crossfire exposure: the player took damage from multiple enemy positions in a short window, if attacker positions are available.
- Late rotate pressure: blue-zone or forced movement contributed to a bad fight, if damage/source telemetry supports it.

Initial pattern rules:

- repeated isolated engagements
- repeated damage without reset
- repeated unconverted damage
- repeated teammate trade-distance problems

Decision ranking should favor:

- death or knock relevance
- high confidence
- high severity
- direct connection to win chance
- actionable alternative play

## Confidence-Aware Tone

The coach should be strict, but not fake certainty.

High-confidence wording:

```text
You were isolated and could not be traded.
```

Medium-confidence wording:

```text
You appear to have been isolated and unlikely to be traded.
```

Low-confidence claims should be omitted.

## LLM Narration

The LLM should act as a blunt coach narrator. It receives compact structured coaching facts and rewrites them for Discord.

Example payload:

```json
{
  "tone": "strict_blunt",
  "matchResult": {
    "rank": 5,
    "mode": "squad",
    "map": "Erangel"
  },
  "decisiveFight": {
    "player": "PlayerName",
    "enemy": "EnemyOne",
    "outcome": "death",
    "claims": [
      {
        "text": "Player re-peeked EnemyOne 6s after taking 83 damage",
        "confidence": "high"
      },
      {
        "text": "Nearest tracked teammate was 78m away, outside likely trade range",
        "confidence": "medium"
      }
    ],
    "betterPlay": [
      "break line of sight",
      "heal before re-engaging",
      "wait for teammate trade pressure or force a new angle"
    ]
  }
}
```

Valid output example:

```text
You re-peeked EnemyOne 6s after taking 83 damage and died for it. Your nearest tracked teammate appears to have been too far to trade, so the better play was to break line of sight, heal, and only re-engage from a new angle or with teammate pressure.
```

Validation rules:

- reject new player or enemy names
- reject new numbers
- reject unsupported terrain labels
- reject advice outside supplied better plays
- enforce Discord line and embed length limits
- fall back to deterministic template narration when validation fails

## Discord Output

Coaching should remain its own embed and should not be buried inside player stats.

Format:

```text
Coaching

Decisive mistake
You re-peeked EnemyOne 6s after taking 83 damage and died for it. Your teammate appears to have been too far to trade. Break line of sight, heal, then re-engage from a new angle or with teammate pressure.

Pattern to fix
You repeatedly took heavy damage without creating a reset. Stop giving the same enemy a second clean fight.
```

Rules:

- Max two sections: `Decisive mistake` and `Pattern to fix`.
- Include enemy names when telemetry has them.
- Use strict and blunt wording.
- Include geometry only when confidence is medium or high.
- If only one strong point exists, show only `Decisive mistake`.
- If no strong context exists, omit the coaching embed.

## Testing

Unit tests for `FightContextBuilder`:

- re-peek after damage
- teammate too far to trade
- meaningful reposition versus no reposition
- height advantage when z-position exists
- geometry omitted when position data is missing

Unit tests for `CoachingDecisionEngine`:

- decisive mistake priority
- pattern emitted only with repeated evidence
- confidence-aware claim selection
- no low-confidence geometry wording

Unit tests for LLM narration validation:

- invented enemy name rejected
- invented distance rejected
- unsupported terrain label rejected
- unsupported advice rejected
- fallback template used on validation failure

Integration tests:

- Discord coaching embed includes `Decisive mistake`.
- `Pattern to fix` appears only with repeated evidence.
- Match summary still posts when LLM narration fails.

## Rollout

1. Add `FightContext` types and `FightContextBuilder`.
2. Refactor `MatchCoachingService` to consume fight contexts.
3. Add decisive-fight decision rules.
4. Add match-pattern detection.
5. Upgrade LLM prompt and response validation.
6. Update Discord coaching embed format.
7. Re-run one local match and tune thresholds from real output.

## Open Questions For Implementation

- Exact trade-range threshold should start conservative and be tuned from real matches.
- Exact reposition threshold should account for PUBG coordinate scale.
- Height advantage should remain disabled until z-position data is confirmed reliable in telemetry samples.
- Cached telemetry coaching should only be added if raw events are available from `match_telemetry`; persisted player analyses alone are not enough for geometry.
