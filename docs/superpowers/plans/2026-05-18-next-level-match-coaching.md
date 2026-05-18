# Next-Level Match Coaching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade match coaching into a strict hybrid coach that reviews the decisive fight first, then adds one telemetry-backed pattern when repeated evidence supports it.

**Architecture:** Add a `FightContextBuilder` that reconstructs decisive fight windows from telemetry, then route those contexts through a focused `CoachingDecisionEngine`. Keep the LLM as narration only, with stronger validation and a Discord embed shaped around `Decisive mistake` and optional `Pattern to fix`.

**Tech Stack:** TypeScript, Jest, `@j03fr0st/pubg-ts` telemetry event types, existing `TelemetryProcessorService`, existing `DiscordBotService`, OpenRouter chat completions client.

---

## File Structure

- Modify `src/types/coaching.types.ts`
  - Add geometry, fight context, decision, and narration section types.
  - Keep existing exported names stable so current callers compile during migration.
- Create `src/services/fight-context-builder.service.ts`
  - Converts `MatchAnalysis`, tracked player names, and raw telemetry damage events into `FightContext[]`.
  - Owns event-time, actor-name, position, distance, reposition, trade-range, and height confidence helpers.
- Create `test/unit/services/fight-context-builder.service.test.ts`
  - Covers re-peek, teammate trade distance, reposition, height, and missing-position behavior.
- Create `src/services/coaching-decision-engine.service.ts`
  - Converts `FightContext[]` into ranked `CoachingInsight[]`.
  - Owns decisive mistake selection and optional repeated pattern selection.
- Create `test/unit/services/coaching-decision-engine.service.test.ts`
  - Covers decisive mistake priority, pattern gating, and confidence-aware wording inputs.
- Modify `src/services/match-coaching.service.ts`
  - Refactor to orchestrate builder and decision engine.
  - Preserve `analyzeMatch(matchAnalysis, trackedPlayerNames, damageEvents)` public API.
- Modify `test/unit/services/match-coaching.service.test.ts`
  - Update existing tests to assert `Decisive mistake` evidence and two-insight cap.
- Modify `src/services/coaching-narrator.service.ts`
  - Render `Decisive mistake` and `Pattern to fix` sections.
  - Tighten validation against invented names, numbers, unsupported terrain labels, and unsupported advice.
- Modify `test/unit/services/coaching-narrator.service.test.ts`
  - Add validation tests for invented distance, unsupported terrain label, and unsupported advice.
- Modify `src/services/openrouter-coaching-llm-client.service.ts`
  - Send the stricter blunt-coach prompt and structured context-oriented payload.
- Modify `test/unit/services/openrouter-coaching-llm-client.service.test.ts`
  - Verify prompt/payload shape includes `strict_blunt` and supplied claims.
- Modify `src/services/discord-bot.service.ts`
  - Keep coaching in its own embed but change the embed body to `Decisive mistake` and optional `Pattern to fix`.
- Modify `test/integration/telemetry-discord-flow.integration.test.ts`
  - Verify Discord output has `Decisive mistake`, conditionally has `Pattern to fix`, and still posts on LLM failure.

---

### Task 1: Add Fight Context Types

**Files:**
- Modify: `src/types/coaching.types.ts`

- [ ] **Step 1: Replace coaching types with backward-compatible v2 types**

Update `src/types/coaching.types.ts` to this complete content:

```typescript
export type CoachingCategory =
  | 'decisive-mistake'
  | 'pattern'
  | 'fight-reset'
  | 'team-spacing'
  | 'damage-conversion'
  | 'weapon-range'
  | 'rotation'
  | 'survival';

export type CoachingRating = 'low' | 'medium' | 'high';

export type CoachingInsightKind = 'decisive-mistake' | 'pattern';

export type FightOutcome = 'knock' | 'death';

export interface TelemetryPosition {
  x: number;
  y: number;
  z?: number;
}

export interface FightContextClaim {
  text: string;
  confidence: CoachingRating;
  evidence: string[];
}

export interface FightDamageEvent {
  timestamp: Date;
  matchTimeSeconds: number;
  attackerName?: string;
  victimName?: string;
  damage: number;
  position?: TelemetryPosition;
}

export interface FightContext {
  playerName: string;
  enemyName?: string;
  outcome: FightOutcome;
  timestamp: Date;
  matchTimeSeconds: number;
  damageTaken: FightDamageEvent[];
  damageDealt: FightDamageEvent[];
  playerPosition?: TelemetryPosition;
  enemyPosition?: TelemetryPosition;
  closestTeammateName?: string;
  closestTeammateDistanceMeters?: number;
  tradeRangeConfidence: CoachingRating;
  repositionDistanceMeters?: number;
  repositionConfidence: CoachingRating;
  heightDeltaMeters?: number;
  heightConfidence: CoachingRating;
  repeatedSameEnemy: boolean;
  claims: FightContextClaim[];
}

export interface CoachingInsight {
  playerName: string;
  category: CoachingCategory;
  kind?: CoachingInsightKind;
  title?: 'Decisive mistake' | 'Pattern to fix';
  timestamp: Date;
  matchTimeSeconds: number;
  severity: CoachingRating;
  confidence: CoachingRating;
  evidence: string[];
  recommendation: string;
  betterPlay?: string[];
  claims?: FightContextClaim[];
}

export interface CoachingNarrationSection {
  playerName: string;
  title?: 'Decisive mistake' | 'Pattern to fix';
  lines: string[];
}

export interface CoachingNarration {
  sections: CoachingNarrationSection[];
}

export interface CoachingLlmClient {
  narrate(insights: CoachingInsight[]): Promise<CoachingNarration>;
}

export interface CoachingNarratorOptions {
  enabled: boolean;
  maxLineLength: number;
}

export interface OpenRouterChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}
```

- [ ] **Step 2: Run the current coaching tests**

Run:

```powershell
npx jest test/unit/services/match-coaching.service.test.ts test/unit/services/coaching-narrator.service.test.ts --runInBand
```

Expected: PASS. The new fields are optional where needed, so existing tests should still compile.

- [ ] **Step 3: Commit the type expansion**

Run:

```powershell
git add src/types/coaching.types.ts
git commit -m "feat: add fight context coaching types"
```

---

### Task 2: Build Decisive Fight Contexts

**Files:**
- Create: `src/services/fight-context-builder.service.ts`
- Create: `test/unit/services/fight-context-builder.service.test.ts`

- [ ] **Step 1: Write failing fight context tests**

Create `test/unit/services/fight-context-builder.service.test.ts`:

```typescript
import type { LogPlayerKillV2, LogPlayerTakeDamage } from '@j03fr0st/pubg-ts';
import { FightContextBuilderService } from '../../../src/services/fight-context-builder.service';
import type { MatchAnalysis, PlayerAnalysis } from '../../../src/types/analytics-results.types';

function makeAnalysis(overrides: Partial<PlayerAnalysis>): PlayerAnalysis {
  return {
    playerName: 'TestPlayer',
    matchStartTime: new Date('2024-01-01T10:00:00.000Z'),
    killEvents: [],
    knockdownEvents: [],
    damageEvents: [],
    reviveEvents: [],
    deathEvents: [],
    knockedDownEvents: [],
    weaponStats: [],
    killChains: [],
    calculatedAssists: [],
    totalDamageDealt: 0,
    totalDamageTaken: 0,
    kdRatio: 0,
    avgKillDistance: 0,
    headshotPercentage: 0,
    killsPerMinute: 0,
    ...overrides,
  };
}

function makeMatchAnalysis(analyses: PlayerAnalysis[]): MatchAnalysis {
  return {
    matchId: 'match-123',
    playerAnalyses: new Map(analyses.map((analysis) => [analysis.playerName, analysis])),
    processingTimeMs: 1,
    totalEventsProcessed: 1,
  };
}

function makeDamage(overrides: Partial<LogPlayerTakeDamage>): LogPlayerTakeDamage {
  return {
    _D: '2024-01-01T10:18:36.000Z',
    _T: 'LogPlayerTakeDamage',
    attacker: { name: 'EnemyOne', location: { x: 1000, y: 0, z: 100 } },
    victim: { name: 'TestPlayer', location: { x: 0, y: 0, z: 80 } },
    damage: 83,
    ...overrides,
  } as LogPlayerTakeDamage;
}

function makeDeath(overrides: Partial<LogPlayerKillV2>): LogPlayerKillV2 {
  return {
    _D: '2024-01-01T10:18:42.000Z',
    _T: 'LogPlayerKillV2',
    killer: { name: 'EnemyOne', location: { x: 1000, y: 0, z: 100 } },
    victim: { name: 'TestPlayer', location: { x: 100, y: 0, z: 80 } },
    ...overrides,
  } as LogPlayerKillV2;
}

describe('FightContextBuilderService', () => {
  it('builds a decisive fight context for a same-enemy re-peek death', () => {
    const damage = makeDamage({});
    const death = makeDeath({});
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([makeAnalysis({ deathEvents: [death] })]),
      ['TestPlayer'],
      [damage]
    );

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      playerName: 'TestPlayer',
      enemyName: 'EnemyOne',
      outcome: 'death',
      matchTimeSeconds: 1122,
      repeatedSameEnemy: true,
    });
    expect(contexts[0].damageTaken[0]).toMatchObject({
      attackerName: 'EnemyOne',
      victimName: 'TestPlayer',
      damage: 83,
    });
  });

  it('marks teammate trade range as medium confidence when the nearest tracked teammate is far away', () => {
    const damage = makeDamage({});
    const death = makeDeath({});
    const teammate = makeAnalysis({
      playerName: 'TeamMate',
      deathEvents: [
        makeDeath({
          victim: { name: 'TeamMate', location: { x: 9000, y: 0, z: 80 } },
          killer: { name: 'OtherEnemy', location: { x: 9100, y: 0, z: 80 } },
        }),
      ],
    });
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([makeAnalysis({ deathEvents: [death] }), teammate]),
      ['TestPlayer', 'TeamMate'],
      [damage]
    );

    expect(contexts[0].closestTeammateName).toBe('TeamMate');
    expect(contexts[0].closestTeammateDistanceMeters).toBeGreaterThan(60);
    expect(contexts[0].tradeRangeConfidence).toBe('medium');
  });

  it('detects no meaningful reposition when the player barely moves after heavy damage', () => {
    const damage = makeDamage({
      victim: { name: 'TestPlayer', location: { x: 0, y: 0, z: 80 } },
    });
    const death = makeDeath({
      victim: { name: 'TestPlayer', location: { x: 100, y: 0, z: 80 } },
    });
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([makeAnalysis({ deathEvents: [death] })]),
      ['TestPlayer'],
      [damage]
    );

    expect(contexts[0].repositionDistanceMeters).toBeLessThan(15);
    expect(contexts[0].repositionConfidence).toBe('high');
  });

  it('detects height disadvantage when enemy z position is meaningfully higher', () => {
    const damage = makeDamage({});
    const death = makeDeath({});
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([makeAnalysis({ deathEvents: [death] })]),
      ['TestPlayer'],
      [damage]
    );

    expect(contexts[0].heightDeltaMeters).toBeGreaterThan(10);
    expect(contexts[0].heightConfidence).toBe('medium');
  });

  it('omits geometry confidence when position data is missing', () => {
    const damage = makeDamage({
      attacker: { name: 'EnemyOne' },
      victim: { name: 'TestPlayer' },
    });
    const death = makeDeath({
      killer: { name: 'EnemyOne' },
      victim: { name: 'TestPlayer' },
    });
    const service = new FightContextBuilderService();

    const contexts = service.buildFightContexts(
      makeMatchAnalysis([makeAnalysis({ deathEvents: [death] })]),
      ['TestPlayer'],
      [damage]
    );

    expect(contexts[0].closestTeammateDistanceMeters).toBeUndefined();
    expect(contexts[0].repositionDistanceMeters).toBeUndefined();
    expect(contexts[0].heightDeltaMeters).toBeUndefined();
    expect(contexts[0].heightConfidence).toBe('low');
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```powershell
npx jest test/unit/services/fight-context-builder.service.test.ts --runInBand
```

Expected: FAIL because `FightContextBuilderService` does not exist.

- [ ] **Step 3: Implement the fight context builder**

Create `src/services/fight-context-builder.service.ts`:

```typescript
import type {
  LogPlayerKillV2,
  LogPlayerMakeGroggy,
  LogPlayerTakeDamage,
} from '@j03fr0st/pubg-ts';
import type { MatchAnalysis, PlayerAnalysis } from '../types/analytics-results.types';
import type {
  CoachingRating,
  FightContext,
  FightDamageEvent,
  FightOutcome,
  TelemetryPosition,
} from '../types/coaching.types';

const CONTEXT_WINDOW_SECONDS = 45;
const TRADE_RANGE_METERS = 60;
const MEANINGFUL_REPOSITION_METERS = 15;
const HEIGHT_ADVANTAGE_METERS = 10;

type DecisiveEvent = LogPlayerKillV2 | LogPlayerMakeGroggy;
type ActorWithPosition = { name?: string; location?: TelemetryPosition };

export class FightContextBuilderService {
  public buildFightContexts(
    matchAnalysis: MatchAnalysis,
    trackedPlayerNames: string[],
    damageEvents: LogPlayerTakeDamage[] = []
  ): FightContext[] {
    const contexts: FightContext[] = [];

    for (const playerName of trackedPlayerNames) {
      const analysis = matchAnalysis.playerAnalyses.get(playerName);
      if (!analysis) continue;

      for (const decisiveEvent of this.getDecisiveEvents(analysis)) {
        const context = this.buildContextForEvent(
          analysis,
          decisiveEvent,
          matchAnalysis,
          trackedPlayerNames,
          damageEvents
        );
        if (context) contexts.push(context);
      }
    }

    return contexts.sort((left, right) => right.matchTimeSeconds - left.matchTimeSeconds);
  }

  private buildContextForEvent(
    analysis: PlayerAnalysis,
    decisiveEvent: DecisiveEvent,
    matchAnalysis: MatchAnalysis,
    trackedPlayerNames: string[],
    damageEvents: LogPlayerTakeDamage[]
  ): FightContext | null {
    const timestamp = this.getEventTime(decisiveEvent);
    if (!timestamp) return null;

    const enemyName = this.getEnemyName(decisiveEvent);
    const outcome: FightOutcome = decisiveEvent._T === 'LogPlayerMakeGroggy' ? 'knock' : 'death';
    const matchTimeSeconds = this.secondsBetween(analysis.matchStartTime, timestamp);
    const damageTaken = this.getDamageTaken(analysis.playerName, timestamp, damageEvents, analysis.matchStartTime);
    const damageDealt = this.getDamageDealt(analysis.playerName, timestamp, damageEvents, analysis.matchStartTime);
    const playerPosition = this.getVictimPosition(decisiveEvent);
    const enemyPosition = this.getEnemyPosition(decisiveEvent);
    const closestTeammate = this.getClosestTeammate(
      analysis.playerName,
      playerPosition,
      matchAnalysis,
      trackedPlayerNames
    );
    const repositionDistanceMeters = this.getRepositionDistanceMeters(damageTaken, playerPosition);
    const heightDeltaMeters =
      playerPosition?.z !== undefined && enemyPosition?.z !== undefined
        ? (enemyPosition.z - playerPosition.z) / 100
        : undefined;
    const repeatedSameEnemy =
      Boolean(enemyName) && damageTaken.some((event) => event.attackerName === enemyName);

    return {
      playerName: analysis.playerName,
      enemyName,
      outcome,
      timestamp,
      matchTimeSeconds,
      damageTaken,
      damageDealt,
      playerPosition,
      enemyPosition,
      closestTeammateName: closestTeammate?.name,
      closestTeammateDistanceMeters: closestTeammate?.distanceMeters,
      tradeRangeConfidence: closestTeammate ? 'medium' : 'low',
      repositionDistanceMeters,
      repositionConfidence: repositionDistanceMeters === undefined ? 'low' : 'high',
      heightDeltaMeters,
      heightConfidence:
        heightDeltaMeters !== undefined && heightDeltaMeters >= HEIGHT_ADVANTAGE_METERS
          ? 'medium'
          : 'low',
      repeatedSameEnemy,
      claims: [],
    };
  }

  private getDecisiveEvents(analysis: PlayerAnalysis): DecisiveEvent[] {
    return [...analysis.deathEvents, ...analysis.knockedDownEvents].sort((left, right) => {
      const leftTime = this.getEventTime(left)?.getTime() ?? 0;
      const rightTime = this.getEventTime(right)?.getTime() ?? 0;
      return rightTime - leftTime;
    });
  }

  private getDamageTaken(
    playerName: string,
    decisiveTime: Date,
    damageEvents: LogPlayerTakeDamage[],
    matchStartTime: Date
  ): FightDamageEvent[] {
    return damageEvents
      .filter((event) => this.getActorName(event.victim) === playerName)
      .map((event) => this.toFightDamageEvent(event, matchStartTime))
      .filter((event): event is FightDamageEvent => Boolean(event))
      .filter((event) => {
        const seconds = this.secondsBetween(event.timestamp, decisiveTime);
        return seconds >= 0 && seconds <= CONTEXT_WINDOW_SECONDS;
      });
  }

  private getDamageDealt(
    playerName: string,
    decisiveTime: Date,
    damageEvents: LogPlayerTakeDamage[],
    matchStartTime: Date
  ): FightDamageEvent[] {
    return damageEvents
      .filter((event) => this.getActorName(event.attacker) === playerName)
      .map((event) => this.toFightDamageEvent(event, matchStartTime))
      .filter((event): event is FightDamageEvent => Boolean(event))
      .filter((event) => {
        const seconds = this.secondsBetween(event.timestamp, decisiveTime);
        return seconds >= 0 && seconds <= CONTEXT_WINDOW_SECONDS;
      });
  }

  private toFightDamageEvent(
    event: LogPlayerTakeDamage,
    matchStartTime: Date
  ): FightDamageEvent | null {
    const timestamp = this.getEventTime(event);
    if (!timestamp) return null;

    return {
      timestamp,
      matchTimeSeconds: this.secondsBetween(matchStartTime, timestamp),
      attackerName: this.getActorName(event.attacker),
      victimName: this.getActorName(event.victim),
      damage: Math.round(event.damage),
      position: this.getActorPosition(event.victim),
    };
  }

  private getClosestTeammate(
    playerName: string,
    playerPosition: TelemetryPosition | undefined,
    matchAnalysis: MatchAnalysis,
    trackedPlayerNames: string[]
  ): { name: string; distanceMeters: number } | undefined {
    if (!playerPosition) return undefined;

    const candidates = trackedPlayerNames
      .filter((name) => name !== playerName)
      .map((name) => {
        const analysis = matchAnalysis.playerAnalyses.get(name);
        const position = analysis ? this.getLastKnownPlayerPosition(analysis) : undefined;
        return position ? { name, distanceMeters: this.distanceMeters(playerPosition, position) } : undefined;
      })
      .filter((candidate): candidate is { name: string; distanceMeters: number } => Boolean(candidate))
      .sort((left, right) => left.distanceMeters - right.distanceMeters);

    const closest = candidates[0];
    return closest && closest.distanceMeters >= TRADE_RANGE_METERS ? closest : closest;
  }

  private getLastKnownPlayerPosition(analysis: PlayerAnalysis): TelemetryPosition | undefined {
    const decisiveEvent = this.getDecisiveEvents(analysis)[0];
    return decisiveEvent ? this.getVictimPosition(decisiveEvent) : undefined;
  }

  private getRepositionDistanceMeters(
    damageTaken: FightDamageEvent[],
    playerPosition: TelemetryPosition | undefined
  ): number | undefined {
    const firstDamagePosition = damageTaken[0]?.position;
    if (!firstDamagePosition || !playerPosition) return undefined;
    return this.distanceMeters(firstDamagePosition, playerPosition);
  }

  private getEnemyName(event: DecisiveEvent): string | undefined {
    return event._T === 'LogPlayerMakeGroggy'
      ? this.getActorName(event.attacker)
      : this.getActorName(event.killer);
  }

  private getVictimPosition(event: DecisiveEvent): TelemetryPosition | undefined {
    return this.getActorPosition(event.victim);
  }

  private getEnemyPosition(event: DecisiveEvent): TelemetryPosition | undefined {
    return event._T === 'LogPlayerMakeGroggy'
      ? this.getActorPosition(event.attacker)
      : this.getActorPosition(event.killer);
  }

  private getActorName(actor?: ActorWithPosition): string | undefined {
    return actor?.name;
  }

  private getActorPosition(actor?: ActorWithPosition): TelemetryPosition | undefined {
    const location = actor?.location;
    if (!location || typeof location.x !== 'number' || typeof location.y !== 'number') {
      return undefined;
    }
    return {
      x: location.x,
      y: location.y,
      z: typeof location.z === 'number' ? location.z : undefined,
    };
  }

  private getEventTime(event: { _D?: string }): Date | null {
    if (!event._D) return null;
    const parsed = new Date(event._D);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private secondsBetween(start: Date, end: Date): number {
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  }

  private distanceMeters(left: TelemetryPosition, right: TelemetryPosition): number {
    const dx = left.x - right.x;
    const dy = left.y - right.y;
    return Math.round((Math.sqrt(dx * dx + dy * dy) / 100) * 10) / 10;
  }
}

export const FIGHT_CONTEXT_THRESHOLDS = {
  contextWindowSeconds: CONTEXT_WINDOW_SECONDS,
  tradeRangeMeters: TRADE_RANGE_METERS,
  meaningfulRepositionMeters: MEANINGFUL_REPOSITION_METERS,
  heightAdvantageMeters: HEIGHT_ADVANTAGE_METERS,
};
```

- [ ] **Step 4: Run the fight context test**

Run:

```powershell
npx jest test/unit/services/fight-context-builder.service.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit fight context builder**

Run:

```powershell
git add src/services/fight-context-builder.service.ts test/unit/services/fight-context-builder.service.test.ts
git commit -m "feat: build decisive fight contexts"
```

---

### Task 3: Add Coaching Decision Engine

**Files:**
- Create: `src/services/coaching-decision-engine.service.ts`
- Create: `test/unit/services/coaching-decision-engine.service.test.ts`

- [ ] **Step 1: Write failing decision engine tests**

Create `test/unit/services/coaching-decision-engine.service.test.ts`:

```typescript
import { CoachingDecisionEngineService } from '../../../src/services/coaching-decision-engine.service';
import type { FightContext } from '../../../src/types/coaching.types';

function makeContext(overrides: Partial<FightContext>): FightContext {
  return {
    playerName: 'TestPlayer',
    enemyName: 'EnemyOne',
    outcome: 'death',
    timestamp: new Date('2024-01-01T10:18:42.000Z'),
    matchTimeSeconds: 1122,
    damageTaken: [
      {
        timestamp: new Date('2024-01-01T10:18:36.000Z'),
        matchTimeSeconds: 1116,
        attackerName: 'EnemyOne',
        victimName: 'TestPlayer',
        damage: 83,
      },
    ],
    damageDealt: [],
    closestTeammateName: 'TeamMate',
    closestTeammateDistanceMeters: 78,
    tradeRangeConfidence: 'medium',
    repositionDistanceMeters: 4,
    repositionConfidence: 'high',
    heightDeltaMeters: 12,
    heightConfidence: 'medium',
    repeatedSameEnemy: true,
    claims: [],
    ...overrides,
  };
}

describe('CoachingDecisionEngineService', () => {
  it('creates a strict decisive mistake insight from a bad reset context', () => {
    const service = new CoachingDecisionEngineService();
    const insights = service.createInsights([makeContext({})]);

    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({
      playerName: 'TestPlayer',
      category: 'decisive-mistake',
      kind: 'decisive-mistake',
      title: 'Decisive mistake',
      severity: 'high',
      confidence: 'high',
    });
    expect(insights[0].evidence.join(' ')).toContain('re-peeked EnemyOne 6s after taking 83 damage');
    expect(insights[0].evidence.join(' ')).toContain('appears to have been too far to trade');
    expect(insights[0].recommendation).toContain('Break line of sight');
  });

  it('omits low-confidence geometry claims', () => {
    const service = new CoachingDecisionEngineService();
    const insights = service.createInsights([
      makeContext({
        closestTeammateDistanceMeters: undefined,
        closestTeammateName: undefined,
        tradeRangeConfidence: 'low',
        heightDeltaMeters: undefined,
        heightConfidence: 'low',
      }),
    ]);

    expect(insights[0].evidence.join(' ')).not.toContain('teammate');
    expect(insights[0].evidence.join(' ')).not.toContain('height');
  });

  it('adds a pattern insight only when repeated evidence exists', () => {
    const service = new CoachingDecisionEngineService();
    const insights = service.createInsights([
      makeContext({ timestamp: new Date('2024-01-01T10:10:00.000Z'), matchTimeSeconds: 600 }),
      makeContext({ timestamp: new Date('2024-01-01T10:18:42.000Z'), matchTimeSeconds: 1122 }),
    ]);

    expect(insights).toHaveLength(2);
    expect(insights[1]).toMatchObject({
      category: 'pattern',
      kind: 'pattern',
      title: 'Pattern to fix',
    });
    expect(insights[1].recommendation).toContain('Stop giving the same enemy');
  });

  it('returns at most two insights', () => {
    const service = new CoachingDecisionEngineService();
    const insights = service.createInsights([
      makeContext({ playerName: 'Alpha', matchTimeSeconds: 600 }),
      makeContext({ playerName: 'Bravo', matchTimeSeconds: 700 }),
      makeContext({ playerName: 'Charlie', matchTimeSeconds: 800 }),
    ]);

    expect(insights).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the decision engine test and verify it fails**

Run:

```powershell
npx jest test/unit/services/coaching-decision-engine.service.test.ts --runInBand
```

Expected: FAIL because `CoachingDecisionEngineService` does not exist.

- [ ] **Step 3: Implement the decision engine**

Create `src/services/coaching-decision-engine.service.ts`:

```typescript
import type {
  CoachingInsight,
  CoachingRating,
  FightContext,
  FightContextClaim,
} from '../types/coaching.types';

const HEAVY_DAMAGE_THRESHOLD = 60;
const PATTERN_MIN_COUNT = 2;
const MAX_INSIGHTS = 2;

export class CoachingDecisionEngineService {
  public createInsights(contexts: FightContext[]): CoachingInsight[] {
    const decisive = this.createDecisiveInsight(contexts);
    const pattern = this.createPatternInsight(contexts);
    return [decisive, pattern].filter((insight): insight is CoachingInsight => Boolean(insight)).slice(0, MAX_INSIGHTS);
  }

  private createDecisiveInsight(contexts: FightContext[]): CoachingInsight | null {
    const ranked = contexts
      .map((context) => ({ context, score: this.scoreContext(context) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score);

    const selected = ranked[0]?.context;
    if (!selected) return null;

    const claims = this.buildClaims(selected);
    if (claims.length === 0) return null;

    return {
      playerName: selected.playerName,
      category: 'decisive-mistake',
      kind: 'decisive-mistake',
      title: 'Decisive mistake',
      timestamp: selected.timestamp,
      matchTimeSeconds: selected.matchTimeSeconds,
      severity: 'high',
      confidence: this.lowestClaimConfidence(claims),
      evidence: claims.map((claim) => claim.text),
      recommendation:
        'Break line of sight, heal, then re-engage from a new angle or with teammate pressure.',
      betterPlay: [
        'break line of sight',
        'heal before re-engaging',
        'wait for teammate trade pressure or force a new angle',
      ],
      claims,
    };
  }

  private createPatternInsight(contexts: FightContext[]): CoachingInsight | null {
    const badResetContexts = contexts.filter((context) => this.isBadReset(context));
    if (badResetContexts.length < PATTERN_MIN_COUNT) return null;

    const latest = badResetContexts.sort((left, right) => right.matchTimeSeconds - left.matchTimeSeconds)[0];

    return {
      playerName: latest.playerName,
      category: 'pattern',
      kind: 'pattern',
      title: 'Pattern to fix',
      timestamp: latest.timestamp,
      matchTimeSeconds: latest.matchTimeSeconds,
      severity: 'medium',
      confidence: 'high',
      evidence: [`Repeated ${badResetContexts.length} fights where heavy damage was followed by no reset.`],
      recommendation: 'Stop giving the same enemy a second clean fight after you are already damaged.',
      betterPlay: [
        'break line of sight',
        'heal before re-engaging',
        'wait for teammate trade pressure or force a new angle',
      ],
      claims: [
        {
          text: `Repeated ${badResetContexts.length} fights where heavy damage was followed by no reset.`,
          confidence: 'high',
          evidence: badResetContexts.map((context) => `${context.playerName} at ${context.matchTimeSeconds}s`),
        },
      ],
    };
  }

  private buildClaims(context: FightContext): FightContextClaim[] {
    const claims: FightContextClaim[] = [];
    const heavyDamage = this.getHeavyDamage(context);
    const seconds = heavyDamage ? context.matchTimeSeconds - heavyDamage.matchTimeSeconds : undefined;

    if (context.repeatedSameEnemy && heavyDamage && context.enemyName && seconds !== undefined) {
      claims.push({
        text: `You re-peeked ${context.enemyName} ${seconds}s after taking ${heavyDamage.damage} damage and ${context.outcome === 'death' ? 'died' : 'got knocked'} for it.`,
        confidence: 'high',
        evidence: [
          `Took ${heavyDamage.damage} damage from ${context.enemyName}`,
          `${context.outcome === 'death' ? 'Died' : 'Got knocked'} ${seconds}s later`,
        ],
      });
    }

    if (
      context.tradeRangeConfidence !== 'low' &&
      context.closestTeammateName &&
      context.closestTeammateDistanceMeters !== undefined
    ) {
      claims.push({
        text: `Your nearest tracked teammate appears to have been ${Math.round(context.closestTeammateDistanceMeters)}m away, too far to trade.`,
        confidence: context.tradeRangeConfidence,
        evidence: [`Closest tracked teammate: ${context.closestTeammateName}`],
      });
    }

    if (
      context.heightConfidence !== 'low' &&
      context.heightDeltaMeters !== undefined &&
      context.heightDeltaMeters > 0
    ) {
      claims.push({
        text: `${context.enemyName ?? 'The enemy'} appears to have had a ${Math.round(context.heightDeltaMeters)}m height advantage.`,
        confidence: context.heightConfidence,
        evidence: ['Enemy z-position was higher than player z-position'],
      });
    }

    return claims;
  }

  private scoreContext(context: FightContext): number {
    let score = context.outcome === 'death' ? 50 : 40;
    if (this.isBadReset(context)) score += 30;
    if (context.tradeRangeConfidence !== 'low') score += 10;
    if (context.heightConfidence !== 'low') score += 5;
    return score;
  }

  private isBadReset(context: FightContext): boolean {
    const heavyDamage = this.getHeavyDamage(context);
    const noMeaningfulReposition =
      context.repositionDistanceMeters === undefined || context.repositionDistanceMeters < 15;
    return Boolean(heavyDamage && context.repeatedSameEnemy && noMeaningfulReposition);
  }

  private getHeavyDamage(context: FightContext) {
    return context.damageTaken.find((event) => event.damage >= HEAVY_DAMAGE_THRESHOLD);
  }

  private lowestClaimConfidence(claims: FightContextClaim[]): CoachingRating {
    if (claims.some((claim) => claim.confidence === 'low')) return 'low';
    if (claims.some((claim) => claim.confidence === 'medium')) return 'medium';
    return 'high';
  }
}
```

- [ ] **Step 4: Run the decision engine test**

Run:

```powershell
npx jest test/unit/services/coaching-decision-engine.service.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit the decision engine**

Run:

```powershell
git add src/services/coaching-decision-engine.service.ts test/unit/services/coaching-decision-engine.service.test.ts
git commit -m "feat: add coaching decision engine"
```

---

### Task 4: Refactor Match Coaching Service Around Contexts

**Files:**
- Modify: `src/services/match-coaching.service.ts`
- Modify: `test/unit/services/match-coaching.service.test.ts`

- [ ] **Step 1: Update service tests for hybrid coaching**

In `test/unit/services/match-coaching.service.test.ts`, update the first test assertions to expect the new decisive-mistake category:

```typescript
    expect(insights[0]).toMatchObject({
      playerName: 'TestPlayer',
      category: 'decisive-mistake',
      kind: 'decisive-mistake',
      title: 'Decisive mistake',
      severity: 'high',
      matchTimeSeconds: 1122,
    });
    expect(insights[0].evidence.join(' ')).toContain('EnemyOne');
    expect(insights[0].evidence.join(' ')).toContain('83 damage');
    expect(insights[0].recommendation).toContain('Break line of sight');
```

Update the ranking test name and cap assertion:

```typescript
  it('returns at most two hybrid coaching insights', () => {
```

and:

```typescript
    expect(insights.length).toBeLessThanOrEqual(2);
    expect(insights[0].kind).toBe('decisive-mistake');
```

- [ ] **Step 2: Run the match coaching tests and verify failure**

Run:

```powershell
npx jest test/unit/services/match-coaching.service.test.ts --runInBand
```

Expected: FAIL because the service still emits the old `fight-reset` insight directly.

- [ ] **Step 3: Replace `MatchCoachingService` implementation**

Replace `src/services/match-coaching.service.ts` with:

```typescript
import type { LogPlayerTakeDamage } from '@j03fr0st/pubg-ts';
import type { MatchAnalysis } from '../types/analytics-results.types';
import type { CoachingInsight } from '../types/coaching.types';
import { CoachingDecisionEngineService } from './coaching-decision-engine.service';
import { FightContextBuilderService } from './fight-context-builder.service';

export class MatchCoachingService {
  public constructor(
    private readonly fightContextBuilder = new FightContextBuilderService(),
    private readonly decisionEngine = new CoachingDecisionEngineService()
  ) {}

  public analyzeMatch(
    matchAnalysis: MatchAnalysis,
    trackedPlayerNames: string[],
    damageEvents: LogPlayerTakeDamage[] = []
  ): CoachingInsight[] {
    const contexts = this.fightContextBuilder.buildFightContexts(
      matchAnalysis,
      trackedPlayerNames,
      damageEvents
    );

    return this.decisionEngine.createInsights(contexts);
  }
}
```

- [ ] **Step 4: Run coaching service tests**

Run:

```powershell
npx jest test/unit/services/fight-context-builder.service.test.ts test/unit/services/coaching-decision-engine.service.test.ts test/unit/services/match-coaching.service.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit the service refactor**

Run:

```powershell
git add src/services/match-coaching.service.ts test/unit/services/match-coaching.service.test.ts
git commit -m "refactor: route match coaching through fight contexts"
```

---

### Task 5: Upgrade Narration And Validation

**Files:**
- Modify: `src/services/coaching-narrator.service.ts`
- Modify: `test/unit/services/coaching-narrator.service.test.ts`
- Modify: `src/services/openrouter-coaching-llm-client.service.ts`
- Modify: `test/unit/services/openrouter-coaching-llm-client.service.test.ts`

- [ ] **Step 1: Add narrator validation tests**

Add these tests to `test/unit/services/coaching-narrator.service.test.ts`:

```typescript
  it('formats decisive mistake and pattern section titles', async () => {
    const service = new CoachingNarratorService(undefined, {
      enabled: false,
      maxLineLength: 280,
    });

    const narration = await service.narrate([
      { ...insight, category: 'decisive-mistake', kind: 'decisive-mistake', title: 'Decisive mistake' },
      { ...insight, category: 'pattern', kind: 'pattern', title: 'Pattern to fix', recommendation: 'Stop giving the same enemy a second clean fight.' },
    ]);

    expect(narration.sections[0].title).toBe('Decisive mistake');
    expect(narration.sections[1].title).toBe('Pattern to fix');
  });

  it('rejects LLM narration that invents a new distance', async () => {
    const llmClient: CoachingLlmClient = {
      narrate: jest.fn().mockResolvedValue({
        sections: [{ playerName: 'TestPlayer', title: 'Decisive mistake', lines: ['You were 999m away from trade pressure.'] }],
      }),
    };
    const service = new CoachingNarratorService(llmClient, { enabled: true, maxLineLength: 240 });

    const narration = await service.narrate([insight]);

    expect(narration.sections[0].lines[0]).not.toContain('999m');
    expect(narration.sections[0].lines[0]).toContain('Took 83 damage from EnemyOne');
  });

  it('rejects unsupported terrain labels from LLM output', async () => {
    const llmClient: CoachingLlmClient = {
      narrate: jest.fn().mockResolvedValue({
        sections: [{ playerName: 'TestPlayer', title: 'Decisive mistake', lines: ['You died because you crossed a field with no cover.'] }],
      }),
    };
    const service = new CoachingNarratorService(llmClient, { enabled: true, maxLineLength: 240 });

    const narration = await service.narrate([insight]);

    expect(narration.sections[0].lines[0]).not.toContain('field');
    expect(narration.sections[0].lines[0]).toContain('Took 83 damage from EnemyOne');
  });

  it('rejects advice outside supplied better plays', async () => {
    const llmClient: CoachingLlmClient = {
      narrate: jest.fn().mockResolvedValue({
        sections: [{ playerName: 'TestPlayer', title: 'Decisive mistake', lines: ['You should have thrown a smoke and crashed the compound.'] }],
      }),
    };
    const service = new CoachingNarratorService(llmClient, { enabled: true, maxLineLength: 240 });

    const narration = await service.narrate([insight]);

    expect(narration.sections[0].lines[0]).not.toContain('smoke');
    expect(narration.sections[0].lines[0]).toContain('Took 83 damage from EnemyOne');
  });
```

- [ ] **Step 2: Run narrator tests and verify failure**

Run:

```powershell
npx jest test/unit/services/coaching-narrator.service.test.ts --runInBand
```

Expected: FAIL because the narrator does not yet validate terrain labels or unsupported advice.

- [ ] **Step 3: Update narrator implementation**

Modify `src/services/coaching-narrator.service.ts` with these changes:

```typescript
const UNSUPPORTED_TERRAIN_WORDS = new Set([
  'field',
  'ridge',
  'compound',
  'tree',
  'rock',
  'wall',
  'city',
  'bridge',
  'shoreline',
  'cover',
]);
```

In `formatTemplateLine`, prefer `insight.title`:

```typescript
    const label = insight.title ?? this.toTitleCase(insight.category);
```

In `createTemplateNarration`, keep one section per insight:

```typescript
    return {
      sections: insights.map((insight) => ({
        playerName: insight.playerName,
        title: insight.title,
        lines: [this.formatTemplateLine(insight)],
      })),
    };
```

In `isValidNarration`, add these checks inside the per-line validation:

```typescript
        const lowerLine = line.toLowerCase();
        for (const word of UNSUPPORTED_TERRAIN_WORDS) {
          if (lowerLine.includes(word) && !this.isWordSupported(word, insights)) {
            return false;
          }
        }

        if (!this.onlyUsesSupportedAdvice(lowerLine, insights)) {
          return false;
        }
```

Add these helper methods:

```typescript
  private isWordSupported(word: string, insights: CoachingInsight[]): boolean {
    return insights.some((insight) =>
      [...insight.evidence, insight.recommendation, ...(insight.betterPlay ?? [])]
        .join(' ')
        .toLowerCase()
        .includes(word)
    );
  }

  private onlyUsesSupportedAdvice(line: string, insights: CoachingInsight[]): boolean {
    const adviceWords = ['smoke', 'grenade', 'crash', 'compound', 'vehicle'];
    const supportedAdvice = insights
      .flatMap((insight) => [insight.recommendation, ...(insight.betterPlay ?? [])])
      .join(' ')
      .toLowerCase();

    return adviceWords.every((word) => !line.includes(word) || supportedAdvice.includes(word));
  }
```

- [ ] **Step 4: Update OpenRouter request test**

In `test/unit/services/openrouter-coaching-llm-client.service.test.ts`, extend the successful request test:

```typescript
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('strict and blunt');
    expect(body.messages[1].content).toContain('strict_blunt');
    expect(body.messages[1].content).toContain('EnemyOne');
```

- [ ] **Step 5: Update OpenRouter prompt and payload**

In `src/services/openrouter-coaching-llm-client.service.ts`, change the system message content to:

```typescript
                'You are a strict and blunt PUBG coach narrator. Rewrite only the supplied telemetry-backed coaching facts for Discord. Do not infer tactics from raw telemetry. Do not invent names, numbers, terrain, cover, weapons, distances, or advice. Return only valid JSON with sections[].playerName, sections[].title, and sections[].lines.',
```

Change the user payload to:

```typescript
              content: JSON.stringify({
                tone: 'strict_blunt',
                insights: insights.map((insight) => ({
                  playerName: insight.playerName,
                  title: insight.title,
                  category: insight.category,
                  kind: insight.kind,
                  matchTime: this.formatMatchTime(insight.matchTimeSeconds),
                  severity: insight.severity,
                  confidence: insight.confidence,
                  claims: insight.claims ?? [],
                  evidence: insight.evidence,
                  betterPlay: insight.betterPlay ?? [insight.recommendation],
                  recommendation: insight.recommendation,
                })),
              }),
```

- [ ] **Step 6: Run narration and OpenRouter tests**

Run:

```powershell
npx jest test/unit/services/coaching-narrator.service.test.ts test/unit/services/openrouter-coaching-llm-client.service.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit narration upgrade**

Run:

```powershell
git add src/services/coaching-narrator.service.ts src/services/openrouter-coaching-llm-client.service.ts test/unit/services/coaching-narrator.service.test.ts test/unit/services/openrouter-coaching-llm-client.service.test.ts
git commit -m "feat: upgrade coaching narration validation"
```

---

### Task 6: Update Discord Coaching Embed Output

**Files:**
- Modify: `src/services/discord-bot.service.ts`
- Modify: `test/integration/telemetry-discord-flow.integration.test.ts`

- [ ] **Step 1: Update Discord integration expectations**

In the existing coaching embed test in `test/integration/telemetry-discord-flow.integration.test.ts`, replace:

```typescript
      expect(JSON.stringify(serializedEmbeds)).toContain('Fight Reset');
      expect(JSON.stringify(serializedEmbeds)).toContain('Took 83 damage from EnemyOne');
```

with:

```typescript
      expect(JSON.stringify(serializedEmbeds)).toContain('Decisive mistake');
      expect(JSON.stringify(serializedEmbeds)).toContain('EnemyOne');
      expect(JSON.stringify(serializedEmbeds)).toContain('83 damage');
```

Add a new test after it:

```typescript
    it('adds pattern to fix only when repeated coaching evidence exists', async () => {
      const mockSummary: DiscordMatchGroupSummary = {
        matchId: 'test-match-coaching-pattern',
        mapName: 'Erangel',
        gameMode: 'squad',
        playedAt: '2024-01-01T10:00:00.000Z',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-coaching-pattern',
        players: [
          {
            name: 'TestPlayer1',
            stats: createPlayerStats({ name: 'TestPlayer1', winPlace: 5 }),
          },
        ],
      };

      const telemetry = [
        {
          _D: '2024-01-01T10:10:00.000Z',
          _T: 'LogPlayerTakeDamage',
          attacker: { name: 'EnemyOne' },
          victim: { name: 'TestPlayer1' },
          damage: 83,
        },
        {
          _D: '2024-01-01T10:10:06.000Z',
          _T: 'LogPlayerMakeGroggy',
          attacker: { name: 'EnemyOne' },
          victim: { name: 'TestPlayer1' },
        },
        {
          _D: '2024-01-01T10:18:36.000Z',
          _T: 'LogPlayerTakeDamage',
          attacker: { name: 'EnemyTwo' },
          victim: { name: 'TestPlayer1' },
          damage: 90,
        },
        {
          _D: '2024-01-01T10:18:42.000Z',
          _T: 'LogPlayerKillV2',
          killer: { name: 'EnemyTwo' },
          victim: { name: 'TestPlayer1' },
        },
      ];

      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.telemetry.getTelemetryData.mockResolvedValue(telemetry);

      const mockChannel = createMockTextChannel();
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await discordBotService.sendMatchSummary('test-channel-id', mockSummary);

      const serialized = JSON.stringify(
        mockChannel.send.mock.calls.flatMap((call) => call[0].embeds).map((embed) => embed.toJSON())
      );

      expect(serialized).toContain('Decisive mistake');
      expect(serialized).toContain('Pattern to fix');
    });
```

- [ ] **Step 2: Run integration test and verify failure**

Run:

```powershell
npx jest test/integration/telemetry-discord-flow.integration.test.ts --runInBand
```

Expected: FAIL until embed formatting uses section titles.

- [ ] **Step 3: Update Discord coaching embed rendering**

In `src/services/discord-bot.service.ts`, update `buildCoachingEmbed` description construction to:

```typescript
    const description = narration.sections
      .map((section) =>
        [
          `**${section.title ?? section.playerName}**`,
          ...section.lines.map((line) => line),
        ].join('\n')
      )
      .join('\n\n');
```

Keep the embed title as:

```typescript
      .setTitle('Coaching')
```

- [ ] **Step 4: Run integration test**

Run:

```powershell
npx jest test/integration/telemetry-discord-flow.integration.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit Discord output update**

Run:

```powershell
git add src/services/discord-bot.service.ts test/integration/telemetry-discord-flow.integration.test.ts
git commit -m "feat: show decisive coaching sections"
```

---

### Task 7: Final Verification And Local Tuning

**Files:**
- Review all changed coaching files and tests.
- No code edits unless verification exposes a specific defect.

- [ ] **Step 1: Run focused coaching unit tests**

Run:

```powershell
npx jest test/unit/services/fight-context-builder.service.test.ts test/unit/services/coaching-decision-engine.service.test.ts test/unit/services/match-coaching.service.test.ts test/unit/services/coaching-narrator.service.test.ts test/unit/services/openrouter-coaching-llm-client.service.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run integration tests**

Run:

```powershell
npx jest test/integration/telemetry-discord-flow.integration.test.ts test/integration/match-monitoring-with-analysis.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run full Jest suite**

Run:

```powershell
npm test -- --runInBand --forceExit
```

Expected: PASS. Existing Jest open handles may require `--forceExit`; do not treat the force-exit warning as a test failure if all suites pass.

- [ ] **Step 5: Run whitespace check**

Run:

```powershell
git diff --check
```

Expected: no output.

- [ ] **Step 6: Inspect final diff**

Run:

```powershell
git diff --stat HEAD~6..HEAD
git log --oneline -8
```

Expected: commits are limited to fight-context coaching, decision engine, narrator validation, Discord output, and tests.

- [ ] **Step 7: Reprocess one local match for output tuning**

Use the existing local `.env` and the last processed match marker workflow:

```powershell
npx ts-node -e 'import "dotenv/config"; import prisma from "./src/data/prisma.client"; (async () => { await prisma.$connect(); const last = await prisma.processedMatch.findFirst({ orderBy: { processedAt: "desc" }, select: { matchId: true, processedAt: true } }); console.log(JSON.stringify({ last }, null, 2)); await prisma.$disconnect(); })().catch(async (err) => { console.error(err); await prisma.$disconnect().catch(() => undefined); process.exit(1); });'
```

If the output has a `last.matchId`, remove only that marker:

```powershell
npx ts-node -e 'import "dotenv/config"; import prisma from "./src/data/prisma.client"; (async () => { await prisma.$connect(); const last = await prisma.processedMatch.findFirst({ orderBy: { processedAt: "desc" }, select: { matchId: true, processedAt: true } }); if (!last) { console.log("No processed match found to remove."); await prisma.$disconnect(); return; } await prisma.processedMatch.delete({ where: { matchId: last.matchId } }); console.log(`Removed processed match marker: ${last.matchId}`); await prisma.$disconnect(); })().catch(async (err) => { console.error(err); await prisma.$disconnect().catch(() => undefined); process.exit(1); });'
```

Then process one local match through the bot path. If this command runs longer than expected, stop it manually after the Discord message posts:

```powershell
$env:MAX_MATCHES_TO_PROCESS='1'; npx ts-node src/index.ts
```

Expected: one match summary posts with a coaching embed when telemetry produces strong fight context.

- [ ] **Step 8: Commit tuning changes only if needed**

If real output shows a concrete threshold issue, edit the threshold constants in `src/services/fight-context-builder.service.ts` or `src/services/coaching-decision-engine.service.ts`, rerun focused tests, then commit:

```powershell
git add src/services/fight-context-builder.service.ts src/services/coaching-decision-engine.service.ts test/unit/services
git commit -m "chore: tune match coaching thresholds"
```

If no tuning edits are needed, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage: the plan implements the fight context model, geometry scope, strict confidence-aware decisions, LLM narrator role, Discord section output, and local tuning loop.
- Scope control: no map-region classifier, no replay rendering, no slash command, and no LLM tactical inference.
- Type consistency: `FightContext`, `FightContextClaim`, `CoachingInsight.kind`, and `CoachingNarrationSection.title` are introduced in Task 1 and reused consistently.
- Verification: focused service tests, integration tests, typecheck, full Jest, whitespace check, and one local match-processing run are included.
