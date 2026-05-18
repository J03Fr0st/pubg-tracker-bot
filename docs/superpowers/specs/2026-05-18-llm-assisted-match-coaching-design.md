# LLM-Assisted Match Coaching Design

## Goal

Add a new coaching section to the existing Discord match summary that explains what tracked players should have done differently to improve their chance of winning the match.

The system must be telemetry-backed. Deterministic rules decide the coaching points. The LLM only rewrites those points into concise, player-facing language.

## Non-Goals

- Do not add a new slash command in this version.
- Do not let an LLM inspect raw telemetry and decide what happened.
- Do not block match summary posting if coaching analysis or LLM narration fails.
- Do not attempt full replay reconstruction or map rendering.

## User Experience

The existing automatic Discord match summary gains a new `Coaching` section.

Example:

```text
Coaching

PlayerName
18:42 - Fight reset
You took 83 damage, then re-peeked the same opponent 6s later and got knocked.
Do this instead: break line of sight, heal, or force a new angle before challenging again.

12:10 - Team spacing
You were knocked 78m from your closest tracked teammate.
Do this instead: wait until a teammate can trade before committing to the fight.
```

The section should be short enough for Discord embeds:

- Maximum 3 insights per match summary by default.
- Prefer the highest-confidence, highest-impact insight per player.
- If multiple tracked players need coaching, keep each player to 1 insight unless there is room.
- If no strong insight is found, omit the section.

## Architecture

```text
TelemetryProcessorService
  -> PlayerAnalysis map
  -> MatchCoachingService
  -> CoachingInsight[]
  -> CoachingNarratorService
  -> CoachingNarration
  -> DiscordBotService
  -> Coaching section in existing match summary
```

### MatchCoachingService

New deterministic service that converts telemetry and existing `PlayerAnalysis` values into structured coaching insights.

Input:

- `MatchAnalysis`
- tracked player names
- match participants and rosters when available
- match start time

Output:

```typescript
interface CoachingInsight {
  playerName: string;
  category:
    | 'fight-reset'
    | 'team-spacing'
    | 'damage-conversion'
    | 'weapon-range'
    | 'rotation'
    | 'survival';
  timestamp: Date;
  matchTimeSeconds: number;
  severity: 'low' | 'medium' | 'high';
  confidence: 'low' | 'medium' | 'high';
  evidence: string[];
  recommendation: string;
}
```

The service is responsible for ranking insights. Ranking should favor high confidence, death/knock relevance, and events near the match-losing sequence.

### CoachingNarratorService

New service that turns `CoachingInsight[]` into Discord-ready text.

It has two modes:

1. Template mode: deterministic local formatting.
2. LLM mode: OpenRouter-backed narration from the same structured insight payload.

The LLM mode must never invent facts. It may only rephrase supplied evidence and recommendations.

### LLM Client

Add an OpenRouter client behind a small interface so the rest of the bot does not depend on OpenRouter request details.

```typescript
interface CoachingLlmClient {
  narrate(insights: CoachingInsight[]): Promise<CoachingNarration>;
}
```

OpenRouter uses an OpenAI-compatible chat completions endpoint:

```text
POST https://openrouter.ai/api/v1/chat/completions
```

Required configuration:

```env
LLM_COACHING_ENABLED=true
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=anthropic/claude-sonnet-4
LLM_TIMEOUT_MS=8000
```

The selected model should be configurable because OpenRouter model availability and structured-output support vary by model and provider.

## Deterministic Rules

### Re-Peek After Heavy Damage

Trigger when a player takes high damage from an attacker, then is knocked or killed by the same attacker within a short window.

Initial thresholds:

- damage taken >= 60
- knock/death within 20 seconds
- same attacker where telemetry identifies the attacker

Recommendation:

- Break line of sight.
- Heal or reset before re-challenging.
- Force a new angle if continuing the fight.

### Isolated Knock Or Death

Trigger when a tracked player is knocked or killed far from the closest tracked teammate.

Initial threshold:

- closest tracked teammate distance >= 60m when position data is available

Recommendation:

- Delay commitment until a teammate can trade.
- Avoid taking isolated fights when squad support is not close.

If teammate position data is not available for the relevant event, do not emit this insight.

### Unconverted Damage

Trigger when a player deals meaningful damage to an enemy but does not convert it into a knock or kill before the fight ends or before the player dies.

Initial thresholds:

- damage dealt to one enemy >= 75
- no knock or kill on that enemy within 30 seconds

Recommendation:

- Call damage and push with a teammate.
- Use utility or angle pressure to finish before the enemy resets.

### Late Reset

Trigger when a player takes repeated damage events over a short window without a successful reset before being knocked or killed.

Initial thresholds:

- at least 2 damage events
- total damage taken >= 80
- final knock/death within 30 seconds

Recommendation:

- Stop re-engaging after stacked damage.
- Heal, reposition, or force the opponent to cross first.

### Weapon Range Mismatch

Trigger when a player loses a fight at a range that is clearly poor for the weapon used, where the weapon and distance are known.

Initial examples:

- shotgun or SMG death at long range after returning fire
- DMR/sniper challenge lost at close range without disengaging

Recommendation:

- Avoid accepting the fight at that range.
- Close distance, create cover, or switch weapons before committing.

This rule should start conservative to avoid bad advice.

### Blue-Zone Pressure

Trigger when avoidable blue-zone damage materially affects the next fight or death sequence.

Initial thresholds:

- blue-zone damage within 60 seconds before knock/death
- blue-zone damage >= 25

Recommendation:

- Rotate earlier.
- Avoid taking optional fights while the zone is already costing health.

Only enable this rule if telemetry exposes reliable zone damage events in the current parser.

## Prompt Contract

LLM system instruction:

```text
You are a PUBG coaching assistant.
Rewrite the supplied telemetry-backed coaching insights for Discord.
Do not invent facts.
Do not add advice that is not supported by the evidence.
Keep each insight under two short sentences.
Use direct, practical language.
```

LLM input should be compact JSON:

```json
{
  "insights": [
    {
      "playerName": "PlayerName",
      "category": "fight-reset",
      "matchTime": "18:42",
      "severity": "high",
      "confidence": "high",
      "evidence": [
        "Took 83 damage from PlayerX",
        "Re-peeked 6 seconds later",
        "Knocked by PlayerX"
      ],
      "recommendation": "Break line of sight, heal, or force a new angle before challenging again."
    }
  ]
}
```

Preferred LLM output shape:

```json
{
  "sections": [
    {
      "playerName": "PlayerName",
      "lines": [
        "18:42 - Fight reset: You took 83 damage, re-peeked 6s later, and got knocked by the same player. Break line of sight, heal, or force a new angle before challenging again."
      ]
    }
  ]
}
```

The code must validate the response before using it.

Validation rules:

- Output must parse as JSON if JSON mode is requested.
- Every returned section must map to a submitted player.
- Every line must be under the configured character limit.
- Returned text must not introduce player names, weapons, distances, timestamps, or damage values that were not present in the input payload.
- If validation fails, use template narration.

## Discord Integration

`DiscordBotService` should add the coaching section after the existing strategic or detailed analysis content, not before the core match result.

Implementation should respect Discord embed limits:

- Keep coaching in its own embed if the existing summary is near limits.
- Truncate safely if LLM text is too long.
- Prefer omitting lower-ranked insights over splitting a single insight awkwardly.

If telemetry analysis is unavailable, the existing basic summary remains unchanged.

## Error Handling

- `MatchCoachingService` errors are logged and coaching is omitted.
- OpenRouter timeout, HTTP error, rate limit, invalid JSON, or validation failure falls back to template narration.
- LLM errors are never thrown into `sendMatchSummary`.
- The final Discord post should succeed even when coaching fails.

## Configuration

Add config fields:

```typescript
llm: {
  coachingEnabled: boolean;
  provider: 'openrouter';
  openRouterApiKey?: string;
  openRouterModel: string;
  timeoutMs: number;
}
```

Defaults:

- `LLM_COACHING_ENABLED=false`
- `LLM_PROVIDER=openrouter`
- `OPENROUTER_MODEL` has no hard-coded production default unless the project owner chooses one
- `LLM_TIMEOUT_MS=8000`

If `LLM_COACHING_ENABLED=true` but `OPENROUTER_API_KEY` is missing, startup should log a clear warning and use template mode.

## Testing

Unit tests:

- `MatchCoachingService` emits re-peek insight from synthetic damage and knock events.
- `MatchCoachingService` omits low-confidence insights when required evidence is missing.
- Insight ranking chooses high-confidence death/knock-related insights first.
- `CoachingNarratorService` template mode formats insights within Discord limits.
- OpenRouter narrator falls back to template mode on timeout, invalid JSON, and unsupported content.
- OpenRouter narrator rejects output that invents evidence.

Integration tests:

- Existing match summary flow includes a coaching section when telemetry produces strong insights.
- Existing match summary flow still posts when LLM narration fails.
- Existing match summary flow omits coaching when telemetry is unavailable.

Verification commands should stay focused for this repo:

```powershell
npx jest test/unit/services/telemetry-processor.test.ts test/unit/services/match-monitor.service.test.ts --runInBand
npm run typecheck
git diff --check
```

Add new focused tests for the coaching service and narrator when implemented.

## Rollout

1. Implement deterministic coaching data structures and `MatchCoachingService`.
2. Add template narration and Discord section rendering.
3. Add OpenRouter-backed `CoachingNarratorService` behind configuration.
4. Add fallback and validation tests.
5. Enable LLM coaching only after deterministic template output is verified.

This allows the coaching feature to ship safely with useful deterministic output first, then improve wording through OpenRouter without risking match summary delivery.
