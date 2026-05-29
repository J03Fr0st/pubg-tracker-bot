# Coaching Architecture Deepening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the coaching pipeline by giving it a named entry point, removing shallow facades, extracting cross-cutting utilities, and splitting concerns that change for different reasons — all while keeping the bot shippable after every phase.

**Architecture:** Seven independently mergeable phases ordered by impact and dependency. Phase 1 extracts `CoachingPipeline` from `DiscordBotService`; subsequent phases either build on it (collapse, split, document) or touch independent files (geometry, types, repos) and can run in parallel. Two speculative candidates from the architecture review are deferred with explicit unblocking signals at the end.

**Tech Stack:** TypeScript, Jest, ts-jest, Biome, discord.js, Prisma, `@j03fr0st/pubg-ts`. Test runner: `npm test`. Type-check: `npm run typecheck`. Format: `npm run format:imports`.

**Source of truth:** [`architecture-review-20260529-212814.html`](file:///C:/Users/joevr/AppData/Local/Temp/architecture-review-20260529-212814.html). Candidate numbers below refer to that document.

**Vocabulary used in this plan:** _deep_ vs _shallow_, _interface_ vs _implementation_, _seam_, _adapter_, _leverage_, _locality_.

---

## Phase ordering and shippability

Each phase ends green: `npm test`, `npm run typecheck`, `npm run format:imports` all pass, and the bot still boots. Commit at the end of each task. Don't skip the failing-test step — the test that fails first is the test that proves the change matters.

| Phase | Candidate | Files most touched                                                                 | Depends on |
|-------|-----------|-------------------------------------------------------------------------------------|------------|
| 1     | #4        | `discord-bot.service.ts`, new `coaching-pipeline.service.ts`                       | —          |
| 2     | #1        | `discord-bot.service.ts`, delete `match-coaching.service.ts`                       | Phase 1    |
| 3     | #2        | `fight-context-builder.service.ts`, new `telemetry-geometry.ts`                    | —          |
| 4     | #3        | `coaching-narrator.service.ts`, new `coaching-llm-guardrail.ts`                    | Phase 1 (preferred, not required) |
| 5     | #5        | `analytics-results.types.ts`, `telemetry-processor.service.ts`, downstream readers | Phase 1    |
| 6     | #6        | `coaching-decision-engine.service.ts`, `src/config/coaching-weights.ts`            | —          |
| 7     | #8        | delete `pubg-storage.service.ts`, callers in 4 services                            | —          |

Phases 1, 3, 6, 7 can each be started independently. Phase 2 needs Phase 1. Phase 4 is cleaner after Phase 1 owns the orchestration. Phase 5 wants Phase 1 first so the `CoachingPipeline` input contract is the thing that gets retyped.

---

# Phase 1 — Extract `CoachingPipeline` from `DiscordBotService` (Candidate #4)

**Why first:** Coaching orchestration today lives inside `DiscordBotService.createCoachingEmbeds` ([src/services/discord-bot.service.ts:1006-1032](../../src/services/discord-bot.service.ts)). A single try/catch swallows every failure into a debug log. The pipeline can't be exercised without instantiating a Discord client. Naming it as its own module unblocks Phases 2, 4, 5, and 6.

**End state:** A new `CoachingPipelineService` owns the telemetry-process → analyze → narrate chain and returns a typed `CoachingPipelineResult`. `DiscordBotService` calls it and renders the result. Failures surface as `kind: 'failed'` with a reason; the bot still posts the match summary.

### Task 1.1: Define the `CoachingPipelineResult` type

**Files:**
- Create: `src/types/coaching-pipeline.types.ts`

- [ ] **Step 1: Create the type file**

```ts
import type { CoachingInsight, CoachingNarration } from './coaching.types';

export type CoachingPipelineResult =
  | { kind: 'empty' }
  | {
      kind: 'ok';
      insights: CoachingInsight[];
      narration: CoachingNarration;
    }
  | {
      kind: 'failed';
      reason: string;
      stage: 'analyze' | 'narrate';
    };
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/coaching-pipeline.types.ts
git commit -m "feat(coaching): add CoachingPipelineResult discriminated union"
```

### Task 1.2: Failing test for the happy path

**Files:**
- Create: `test/unit/services/coaching-pipeline.service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import type {
  CoachingInsight,
  CoachingNarration,
} from '../../../src/types/coaching.types';
import type { MatchAnalysis } from '../../../src/types/analytics-results.types';
import { CoachingPipelineService } from '../../../src/services/coaching-pipeline.service';

describe('CoachingPipelineService', () => {
  const fakeMatchAnalysis = {
    matchId: 'm1',
    playerAnalyses: new Map(),
    processingTimeMs: 0,
    totalEventsProcessed: 0,
  } as MatchAnalysis;

  const insight: CoachingInsight = {
    playerName: 'Alice',
    category: 'decisive-mistake',
    kind: 'decisive-mistake',
    title: 'Decisive mistake',
    timestamp: new Date('2024-01-01T00:00:00Z'),
    matchTimeSeconds: 120,
    severity: 'high',
    confidence: 'high',
    evidence: ['x'],
    recommendation: 'r',
  };

  const narration: CoachingNarration = {
    sections: [{ playerName: 'Alice', title: 'Decisive mistake', lines: ['line'] }],
  };

  it('returns kind:ok with insights and narration on the happy path', async () => {
    const pipeline = new CoachingPipelineService({
      analyze: jest.fn().mockReturnValue([insight]),
      narrate: jest.fn().mockResolvedValue(narration),
    });

    const result = await pipeline.run(fakeMatchAnalysis, ['Alice'], []);

    expect(result).toEqual({ kind: 'ok', insights: [insight], narration });
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx jest test/unit/services/coaching-pipeline.service.test.ts`
Expected: FAIL — `Cannot find module '.../coaching-pipeline.service'`.

### Task 1.3: Minimal implementation for the happy path

**Files:**
- Create: `src/services/coaching-pipeline.service.ts`

- [ ] **Step 1: Implement**

```ts
import type { LogPlayerTakeDamage } from '@j03fr0st/pubg-ts';
import type { MatchAnalysis } from '../types/analytics-results.types';
import type {
  CoachingInsight,
  CoachingNarration,
} from '../types/coaching.types';
import type { CoachingPipelineResult } from '../types/coaching-pipeline.types';

export interface CoachingAnalyzer {
  analyze(
    matchAnalysis: MatchAnalysis,
    trackedPlayerNames: string[],
    damageEvents: LogPlayerTakeDamage[]
  ): CoachingInsight[];
}

export interface CoachingNarrator {
  narrate(insights: CoachingInsight[]): Promise<CoachingNarration>;
}

export class CoachingPipelineService {
  public constructor(
    private readonly deps: {
      analyze: CoachingAnalyzer['analyze'];
      narrate: CoachingNarrator['narrate'];
    }
  ) {}

  public async run(
    matchAnalysis: MatchAnalysis,
    trackedPlayerNames: string[],
    damageEvents: LogPlayerTakeDamage[]
  ): Promise<CoachingPipelineResult> {
    const insights = this.deps.analyze(matchAnalysis, trackedPlayerNames, damageEvents);
    if (insights.length === 0) {
      return { kind: 'empty' };
    }
    const narration = await this.deps.narrate(insights);
    return { kind: 'ok', insights, narration };
  }
}
```

- [ ] **Step 2: Run test and verify pass**

Run: `npx jest test/unit/services/coaching-pipeline.service.test.ts`
Expected: PASS, 1 test.

### Task 1.4: Failing tests for empty and failure paths

- [ ] **Step 1: Add to the test file**

```ts
  it('returns kind:empty when analyze yields no insights', async () => {
    const pipeline = new CoachingPipelineService({
      analyze: jest.fn().mockReturnValue([]),
      narrate: jest.fn(),
    });

    const result = await pipeline.run(fakeMatchAnalysis, ['Alice'], []);

    expect(result).toEqual({ kind: 'empty' });
  });

  it('returns kind:failed when analyze throws', async () => {
    const pipeline = new CoachingPipelineService({
      analyze: () => {
        throw new Error('boom');
      },
      narrate: jest.fn(),
    });

    const result = await pipeline.run(fakeMatchAnalysis, ['Alice'], []);

    expect(result).toEqual({ kind: 'failed', reason: 'boom', stage: 'analyze' });
  });

  it('returns kind:failed when narrate rejects', async () => {
    const pipeline = new CoachingPipelineService({
      analyze: jest.fn().mockReturnValue([insight]),
      narrate: jest.fn().mockRejectedValue(new Error('llm down')),
    });

    const result = await pipeline.run(fakeMatchAnalysis, ['Alice'], []);

    expect(result).toEqual({ kind: 'failed', reason: 'llm down', stage: 'narrate' });
  });
```

- [ ] **Step 2: Verify failures**

Run: `npx jest test/unit/services/coaching-pipeline.service.test.ts`
Expected: 2 new failures (failure paths throw, not return).

### Task 1.5: Implement empty + failure handling

- [ ] **Step 1: Update `run`**

Replace the body of `run` in `src/services/coaching-pipeline.service.ts`:

```ts
  public async run(
    matchAnalysis: MatchAnalysis,
    trackedPlayerNames: string[],
    damageEvents: LogPlayerTakeDamage[]
  ): Promise<CoachingPipelineResult> {
    let insights: CoachingInsight[];
    try {
      insights = this.deps.analyze(matchAnalysis, trackedPlayerNames, damageEvents);
    } catch (err) {
      return { kind: 'failed', reason: messageOf(err), stage: 'analyze' };
    }

    if (insights.length === 0) {
      return { kind: 'empty' };
    }

    try {
      const narration = await this.deps.narrate(insights);
      return { kind: 'ok', insights, narration };
    } catch (err) {
      return { kind: 'failed', reason: messageOf(err), stage: 'narrate' };
    }
  }
```

Append to the file:

```ts
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
```

- [ ] **Step 2: Verify pass**

Run: `npx jest test/unit/services/coaching-pipeline.service.test.ts`
Expected: 4 passing.

- [ ] **Step 3: Commit**

```bash
git add src/services/coaching-pipeline.service.ts test/unit/services/coaching-pipeline.service.test.ts
git commit -m "feat(coaching): introduce CoachingPipelineService with typed result"
```

### Task 1.6: Wire `CoachingPipeline` into `DiscordBotService`

**Files:**
- Modify: `src/services/discord-bot.service.ts` (constructor at 127–158, `createCoachingEmbeds` at 1006–1032)

- [ ] **Step 1: Add import**

Add near other service imports (after line 53):

```ts
import { CoachingPipelineService } from './coaching-pipeline.service';
```

- [ ] **Step 2: Add field and construct in constructor**

Add field beside the others (after line 83):

```ts
  private readonly coachingPipeline: CoachingPipelineService;
```

Add after the existing `this.coachingNarrator = ...` block (after line 156, before `this.setupEventHandlers()`):

```ts
    this.coachingPipeline = new CoachingPipelineService({
      analyze: (analysis, names, damage) =>
        this.matchCoachingService.analyzeMatch(analysis, names, damage),
      narrate: (insights) => this.coachingNarrator.narrate(insights),
    });
```

- [ ] **Step 3: Replace `createCoachingEmbeds` body**

Replace lines 1006–1032 with:

```ts
  private async createCoachingEmbeds(
    matchAnalysis: MatchAnalysis,
    trackedPlayerNames: string[],
    telemetryData: TelemetryEvent[],
    matchColor: number
  ): Promise<EmbedBuilder[]> {
    const damageEvents = telemetryData.filter(
      (event) => event._T === 'LogPlayerTakeDamage'
    ) as LogPlayerTakeDamage[];

    const result = await this.coachingPipeline.run(
      matchAnalysis,
      trackedPlayerNames,
      damageEvents
    );

    if (result.kind === 'empty') {
      return [];
    }
    if (result.kind === 'failed') {
      error(`Coaching pipeline failed at ${result.stage}: ${result.reason}`);
      return [];
    }
    return this.buildCoachingEmbeds(result.narration, matchColor);
  }
```

- [ ] **Step 4: Type-check and run full suite**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; existing `discord-bot.service.test.ts` still passes.

- [ ] **Step 5: Commit**

```bash
git add src/services/discord-bot.service.ts
git commit -m "refactor(discord-bot): delegate coaching orchestration to CoachingPipeline"
```

---

# Phase 2 — Collapse `MatchCoachingService` (Candidate #1)

**Why:** Now that `CoachingPipelineService` exists, `MatchCoachingService` is a redundant 27-line pass-through. It exists only to be mocked. Inline its two calls into the pipeline; delete the facade and its tests. **Locality** wins, no leverage was lost (it had none).

### Task 2.1: Move dependencies onto the pipeline

**Files:**
- Modify: `src/services/coaching-pipeline.service.ts`

- [ ] **Step 1: Failing test — pipeline can be constructed with the two real services**

Add to `test/unit/services/coaching-pipeline.service.test.ts`:

```ts
import { FightContextBuilderService } from '../../../src/services/fight-context-builder.service';
import { CoachingDecisionEngineService } from '../../../src/services/coaching-decision-engine.service';

it('factory wires the two real coaching services', async () => {
  const pipeline = CoachingPipelineService.withDefaults({
    fightContextBuilder: new FightContextBuilderService(),
    decisionEngine: new CoachingDecisionEngineService(),
    narrate: async () => ({ sections: [] }),
  });
  const result = await pipeline.run(fakeMatchAnalysis, [], []);
  expect(result.kind).toBe('empty');
});
```

Run: `npx jest test/unit/services/coaching-pipeline.service.test.ts`
Expected: FAIL — `withDefaults is not a function`.

- [ ] **Step 2: Add `withDefaults` factory**

Append to `src/services/coaching-pipeline.service.ts`:

```ts
import { CoachingDecisionEngineService } from './coaching-decision-engine.service';
import { FightContextBuilderService } from './fight-context-builder.service';

export interface CoachingPipelineDefaults {
  fightContextBuilder: FightContextBuilderService;
  decisionEngine: CoachingDecisionEngineService;
  narrate: CoachingNarrator['narrate'];
}

export namespace CoachingPipelineService {
  export function withDefaults(deps: CoachingPipelineDefaults): CoachingPipelineService {
    return new CoachingPipelineService({
      analyze: (analysis, names, damage) => {
        const contexts = deps.fightContextBuilder.buildFightContexts(analysis, names, damage);
        return deps.decisionEngine.createInsights(contexts);
      },
      narrate: deps.narrate,
    });
  }
}
```

Note: TypeScript `class` + `namespace` merging — both compile into the same export.

Run: `npx jest test/unit/services/coaching-pipeline.service.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 3: Commit**

```bash
git add src/services/coaching-pipeline.service.ts test/unit/services/coaching-pipeline.service.test.ts
git commit -m "feat(coaching): add CoachingPipelineService.withDefaults factory"
```

### Task 2.2: Switch `DiscordBotService` to the factory and drop the facade

**Files:**
- Modify: `src/services/discord-bot.service.ts`
- Delete: `src/services/match-coaching.service.ts`
- Delete: `test/unit/services/match-coaching.service.test.ts`

- [ ] **Step 1: Replace MatchCoachingService usage**

In `src/services/discord-bot.service.ts`:

- Remove import of `MatchCoachingService` (line 49).
- Remove field `private readonly matchCoachingService: MatchCoachingService;` (line 82).
- Remove `this.matchCoachingService = new MatchCoachingService();` (line 142).
- Add imports near other service imports:

```ts
import { FightContextBuilderService } from './fight-context-builder.service';
import { CoachingDecisionEngineService } from './coaching-decision-engine.service';
```

- Replace the `this.coachingPipeline = ...` block from Phase 1 with:

```ts
    this.coachingPipeline = CoachingPipelineService.withDefaults({
      fightContextBuilder: new FightContextBuilderService(),
      decisionEngine: new CoachingDecisionEngineService(),
      narrate: (insights) => this.coachingNarrator.narrate(insights),
    });
```

- [ ] **Step 2: Delete the dead files**

```bash
git rm src/services/match-coaching.service.ts test/unit/services/match-coaching.service.test.ts
```

- [ ] **Step 3: Confirm no remaining references**

Run (PowerShell): `Select-String -Path "src/**/*.ts","test/**/*.ts" -Pattern "MatchCoachingService|match-coaching" -SimpleMatch`
Expected: no matches.

- [ ] **Step 4: Type-check and test**

Run: `npm run typecheck && npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(coaching): remove MatchCoachingService pass-through facade"
```

---

# Phase 3 — Extract `TelemetryGeometry` from `FightContextBuilderService` (Candidate #2)

**Why:** [`fight-context-builder.service.ts:379-401`](../../src/services/fight-context-builder.service.ts) holds Cartesian math (`distanceMeters`, `angleDegrees`) embedded in a domain service. Extract a focused `TelemetryGeometry` module so geometry becomes _deep_ (small interface, real implementation) and the fight-context module shrinks to its actual job. This is independent of Phases 1–2; it can run in parallel.

### Task 3.1: Create `TelemetryGeometry` with failing tests

**Files:**
- Create: `src/utils/telemetry-geometry.ts`
- Create: `test/unit/utils/telemetry-geometry.test.ts`

- [ ] **Step 1: Failing tests**

`test/unit/utils/telemetry-geometry.test.ts`:

```ts
import { TelemetryGeometry } from '../../../src/utils/telemetry-geometry';

describe('TelemetryGeometry', () => {
  describe('distanceMeters', () => {
    it('returns 0 when positions coincide', () => {
      expect(TelemetryGeometry.distanceMeters({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0);
    });

    it('divides centimetre coordinates by 100 to produce metres', () => {
      // 300cm horizontal, 400cm vertical => 500cm => 5.0m
      expect(TelemetryGeometry.distanceMeters({ x: 0, y: 0 }, { x: 300, y: 400 })).toBe(5);
    });

    it('rounds to one decimal place', () => {
      expect(TelemetryGeometry.distanceMeters({ x: 0, y: 0 }, { x: 123, y: 0 })).toBe(1.2);
    });
  });

  describe('angleDegrees', () => {
    it('returns 0 when the two vectors point the same way', () => {
      expect(
        TelemetryGeometry.angleDegrees({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 })
      ).toBe(0);
    });

    it('returns 90 for perpendicular vectors', () => {
      expect(
        TelemetryGeometry.angleDegrees({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 })
      ).toBe(90);
    });

    it('returns undefined when either vector has zero length', () => {
      expect(
        TelemetryGeometry.angleDegrees({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })
      ).toBeUndefined();
    });
  });

  describe('heightDeltaMeters', () => {
    it('returns the z-delta in metres', () => {
      expect(
        TelemetryGeometry.heightDeltaMeters({ x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: 1100 })
      ).toBe(10);
    });

    it('returns undefined when z is missing on either side', () => {
      expect(
        TelemetryGeometry.heightDeltaMeters({ x: 0, y: 0 }, { x: 0, y: 0, z: 0 })
      ).toBeUndefined();
    });
  });

  describe('secondsBetween', () => {
    it('returns rounded non-negative seconds for unsigned variant', () => {
      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2024-01-01T00:00:02.400Z');
      expect(TelemetryGeometry.secondsBetween(start, end)).toBe(2);
    });

    it('clamps the unsigned variant to zero when end is before start', () => {
      const start = new Date('2024-01-01T00:00:10Z');
      const end = new Date('2024-01-01T00:00:00Z');
      expect(TelemetryGeometry.secondsBetween(start, end)).toBe(0);
    });

    it('signedSecondsBetween allows negatives', () => {
      const start = new Date('2024-01-01T00:00:10Z');
      const end = new Date('2024-01-01T00:00:00Z');
      expect(TelemetryGeometry.signedSecondsBetween(start, end)).toBe(-10);
    });
  });
});
```

- [ ] **Step 2: Verify failure**

Run: `npx jest test/unit/utils/telemetry-geometry.test.ts`
Expected: FAIL — module not found.

### Task 3.2: Implement `TelemetryGeometry`

- [ ] **Step 1: Implement**

`src/utils/telemetry-geometry.ts`:

```ts
import type { TelemetryPosition } from '../types/coaching.types';

export const TelemetryGeometry = {
  distanceMeters(left: TelemetryPosition, right: TelemetryPosition): number {
    const dx = left.x - right.x;
    const dy = left.y - right.y;
    return Math.round((Math.sqrt(dx * dx + dy * dy) / 100) * 10) / 10;
  },

  angleDegrees(
    origin: TelemetryPosition,
    firstTarget: TelemetryPosition,
    secondTarget: TelemetryPosition
  ): number | undefined {
    const first = { x: firstTarget.x - origin.x, y: firstTarget.y - origin.y };
    const second = { x: secondTarget.x - origin.x, y: secondTarget.y - origin.y };
    const firstLength = Math.sqrt(first.x * first.x + first.y * first.y);
    const secondLength = Math.sqrt(second.x * second.x + second.y * second.y);
    if (firstLength === 0 || secondLength === 0) {
      return undefined;
    }
    const cosine = (first.x * second.x + first.y * second.y) / (firstLength * secondLength);
    const bounded = Math.max(-1, Math.min(1, cosine));
    return Math.round((Math.acos(bounded) * 180) / Math.PI);
  },

  heightDeltaMeters(
    player: TelemetryPosition,
    enemy: TelemetryPosition
  ): number | undefined {
    if (player.z === undefined || enemy.z === undefined) {
      return undefined;
    }
    return (enemy.z - player.z) / 100;
  },

  secondsBetween(start: Date, end: Date): number {
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  },

  signedSecondsBetween(start: Date, end: Date): number {
    return Math.round((end.getTime() - start.getTime()) / 1000);
  },
};
```

- [ ] **Step 2: Run tests**

Run: `npx jest test/unit/utils/telemetry-geometry.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 3: Commit**

```bash
git add src/utils/telemetry-geometry.ts test/unit/utils/telemetry-geometry.test.ts
git commit -m "feat(telemetry): extract TelemetryGeometry utility (distance, angle, height, seconds)"
```

### Task 3.3: Switch `FightContextBuilderService` to use `TelemetryGeometry`

**Files:**
- Modify: `src/services/fight-context-builder.service.ts`

- [ ] **Step 1: Add import**

After line 12, add:

```ts
import { TelemetryGeometry } from '../utils/telemetry-geometry';
```

- [ ] **Step 2: Replace inline math with calls**

In `src/services/fight-context-builder.service.ts`:

- Replace every `this.distanceMeters(` with `TelemetryGeometry.distanceMeters(`.
- Replace every `this.angleDegrees(` with `TelemetryGeometry.angleDegrees(`.
- Replace every `this.secondsBetween(` with `TelemetryGeometry.secondsBetween(`.
- Replace every `this.signedSecondsBetween(` with `TelemetryGeometry.signedSecondsBetween(`.
- Replace the inline z-delta calculation at lines 114–117 with:

  ```ts
  const heightDeltaMeters =
    playerPosition && enemyPosition
      ? TelemetryGeometry.heightDeltaMeters(playerPosition, enemyPosition)
      : undefined;
  ```

- Delete the now-dead private methods at lines 371–401: `secondsBetween`, `signedSecondsBetween`, `distanceMeters`, `angleDegrees`.

- [ ] **Step 3: Type-check and run the fight-context tests**

Run: `npm run typecheck && npx jest test/unit/services/fight-context-builder.service.test.ts`
Expected: typecheck clean; behaviour unchanged.

- [ ] **Step 4: Run full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/services/fight-context-builder.service.ts
git commit -m "refactor(coaching): use TelemetryGeometry in FightContextBuilderService"
```

---

# Phase 4 — Split LLM guardrail from `CoachingNarratorService` (Candidate #3)

**Why:** [`coaching-narrator.service.ts:106-226`](../../src/services/coaching-narrator.service.ts) is 120 lines of whitelisting living inside the narrator. Narrator formats Discord-shaped sections; the validator decides whether to trust the LLM. Different reasons to change. Today the fallback is silent — `debug()` only. Make the rejection reason visible.

### Task 4.1: Define the guardrail interface

**Files:**
- Create: `src/services/coaching-llm-guardrail.ts`

- [ ] **Step 1: Failing test**

`test/unit/services/coaching-llm-guardrail.test.ts`:

```ts
import {
  WhitelistCoachingLlmGuardrail,
} from '../../../src/services/coaching-llm-guardrail';
import type {
  CoachingInsight,
  CoachingNarration,
} from '../../../src/types/coaching.types';

const insight: CoachingInsight = {
  playerName: 'Alice',
  category: 'decisive-mistake',
  kind: 'decisive-mistake',
  title: 'Decisive mistake',
  timestamp: new Date('2024-01-01T00:00:00Z'),
  matchTimeSeconds: 120,
  severity: 'high',
  confidence: 'high',
  evidence: ['Took 80 damage from Bob'],
  recommendation: 'break line of sight',
};

describe('WhitelistCoachingLlmGuardrail', () => {
  const guardrail = new WhitelistCoachingLlmGuardrail({ maxLineLength: 240 });

  it('accepts narration that only references allowed names and numbers', () => {
    const narration: CoachingNarration = {
      sections: [
        {
          playerName: 'Alice',
          title: 'Decisive mistake',
          lines: ['2:00 - Decisive mistake', 'Do this: break line of sight'],
        },
      ],
    };
    const result = guardrail.verify(narration, [insight]);
    expect(result).toEqual({ ok: true });
  });

  it('rejects narration that mentions an unknown player name', () => {
    const narration: CoachingNarration = {
      sections: [
        {
          playerName: 'Alice',
          title: 'Decisive mistake',
          lines: ['Charlie shot you'],
        },
      ],
    };
    const result = guardrail.verify(narration, [insight]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/unknown name/i);
    }
  });

  it('rejects narration that exceeds maxLineLength', () => {
    const guardrail = new WhitelistCoachingLlmGuardrail({ maxLineLength: 10 });
    const narration: CoachingNarration = {
      sections: [
        { playerName: 'Alice', title: 'Decisive mistake', lines: ['this line is way too long'] },
      ],
    };
    const result = guardrail.verify(narration, [insight]);
    expect(result.ok).toBe(false);
  });
});
```

Run: `npx jest test/unit/services/coaching-llm-guardrail.test.ts`
Expected: FAIL — module missing.

### Task 4.2: Move whitelisting logic out of the narrator

- [ ] **Step 1: Create `src/services/coaching-llm-guardrail.ts`**

Move the constant sets and validation helpers verbatim from `coaching-narrator.service.ts` (lines 14–50 and 106–226) into the new file, exposed as a class implementing one method. Skeleton:

```ts
import type {
  CoachingInsight,
  CoachingNarration,
} from '../types/coaching.types';

export type GuardrailVerdict = { ok: true } | { ok: false; reason: string };

export interface CoachingLlmGuardrail {
  verify(narration: CoachingNarration, insights: CoachingInsight[]): GuardrailVerdict;
}

const COMMON_ALLOWED_WORDS = new Set([
  'Break', 'Decisive', 'Do', 'Died', 'Enemy', 'Fight', 'Got', 'Pattern',
  'Reset', 'Stop', 'The', 'Took', 'You', 'Your',
]);

const UNSUPPORTED_TERRAIN_WORDS = new Set([
  'field', 'ridge', 'compound', 'tree', 'rock', 'wall', 'city', 'bridge', 'shoreline', 'cover',
]);

const ADVICE_WORDS = new Set(['smoke', 'grenade', 'crash', 'compound', 'vehicle']);

export class WhitelistCoachingLlmGuardrail implements CoachingLlmGuardrail {
  public constructor(private readonly options: { maxLineLength: number }) {}

  public verify(narration: CoachingNarration, insights: CoachingInsight[]): GuardrailVerdict {
    if (!Array.isArray(narration.sections)) {
      return { ok: false, reason: 'narration.sections is not an array' };
    }

    const allowedPlayers = new Set(insights.map((i) => i.playerName));
    const allowedNumbers = this.collectAllowedNumbers(insights);
    const allowedNames = this.collectAllowedNames(insights);

    for (const section of narration.sections) {
      if (!allowedPlayers.has(section.playerName)) {
        return { ok: false, reason: `unknown player "${section.playerName}"` };
      }
      if (!Array.isArray(section.lines)) {
        return { ok: false, reason: 'section.lines is not an array' };
      }
      for (const line of section.lines) {
        const reason = this.rejectLine(line, insights, allowedNames, allowedNumbers);
        if (reason) {
          return { ok: false, reason };
        }
      }
    }
    return { ok: true };
  }

  private rejectLine(
    line: string,
    insights: CoachingInsight[],
    allowedNames: Set<string>,
    allowedNumbers: Set<string>
  ): string | null {
    if (line.length > this.options.maxLineLength) {
      return `line exceeds maxLineLength (${line.length} > ${this.options.maxLineLength})`;
    }
    const lower = line.toLowerCase();
    for (const word of UNSUPPORTED_TERRAIN_WORDS) {
      if (lower.includes(word) && !this.isWordSupported(word, insights)) {
        return `unsupported terrain word "${word}"`;
      }
    }
    if (!this.onlyUsesSupportedAdvice(lower, insights)) {
      return 'advice word not present in insight recommendations';
    }
    for (const number of line.match(/\d+/g) ?? []) {
      if (!allowedNumbers.has(number)) {
        return `unknown number "${number}"`;
      }
    }
    for (const name of line.match(/\b[A-Z][A-Za-z0-9_]+\b/g) ?? []) {
      if (!allowedNames.has(name) && !COMMON_ALLOWED_WORDS.has(name)) {
        return `unknown name "${name}"`;
      }
    }
    return null;
  }

  // Methods below are moved verbatim from coaching-narrator.service.ts:
  // collectAllowedNumbers (was lines 153–170)
  // collectAllowedNames   (was lines 172–196)
  // getAllowedText        (was lines 198–205)
  // isWordSupported       (was lines 207–211)
  // onlyUsesSupportedAdvice (was lines 213–226)
  // formatMatchTime       (was lines 228–232)  — keep here for collectAllowedNumbers
  // toTitleCase           (was lines 234–239)  — keep here for collectAllowedNames

  // Copy each method body unchanged; replace `private` with `private` and ensure they reference instance state only via `this`.
}
```

When moving the six helper methods, copy them verbatim — they are pure and don't reference narrator-only state.

- [ ] **Step 2: Run guardrail tests**

Run: `npx jest test/unit/services/coaching-llm-guardrail.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 3: Commit**

```bash
git add src/services/coaching-llm-guardrail.ts test/unit/services/coaching-llm-guardrail.test.ts
git commit -m "feat(coaching): introduce WhitelistCoachingLlmGuardrail with explicit reject reasons"
```

### Task 4.3: Use the guardrail from the narrator and surface the reason

**Files:**
- Modify: `src/services/coaching-narrator.service.ts`

- [ ] **Step 1: Replace the narrator's validation**

In `src/services/coaching-narrator.service.ts`:

- Add import:
  ```ts
  import { type CoachingLlmGuardrail, WhitelistCoachingLlmGuardrail } from './coaching-llm-guardrail';
  ```
- Delete the constant sets at lines 14–50.
- Add an optional constructor parameter:
  ```ts
  public constructor(
    private readonly llmClient?: CoachingLlmClient,
    private readonly options: CoachingNarratorOptions = DEFAULT_OPTIONS,
    private readonly guardrail: CoachingLlmGuardrail =
      new WhitelistCoachingLlmGuardrail({ maxLineLength: options.maxLineLength })
  ) {}
  ```
  Note: the third parameter's default reads `options` from the previous parameter — TypeScript supports this.
- Replace the `narrate` body's LLM branch (lines 63–73) with:
  ```ts
    if (this.options.enabled && this.llmClient) {
      try {
        const llmNarration = await this.llmClient.narrate(insights);
        const verdict = this.guardrail.verify(llmNarration, insights);
        if (verdict.ok) {
          return llmNarration;
        }
        debug(`LLM coaching narration rejected by guardrail: ${verdict.reason}`);
      } catch (err) {
        debug(`LLM coaching narration failed, using template narration: ${err}`);
      }
    }
  ```
- Delete the private methods `isValidNarration`, `collectAllowedNumbers`, `collectAllowedNames`, `getAllowedText`, `isWordSupported`, `onlyUsesSupportedAdvice` (lines 106–226). Keep `formatMatchTime` and `toTitleCase` only if `formatTemplateLines` still uses them (it does — `formatMatchTime` is called at line 90 and `toTitleCase` at line 89).

- [ ] **Step 2: Update the existing narrator tests for the new reason-logging behaviour**

Run: `npx jest test/unit/services/coaching-narrator.service.test.ts`
Inspect failures. Fix any test that asserted "validation failed" generically — assert via a guardrail mock or via the debug logger (whichever the existing test style uses). Do NOT replace meaningful test cases; tighten them to use the guardrail seam.

- [ ] **Step 3: Run full suite**

Run: `npm run typecheck && npm test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/services/coaching-narrator.service.ts test/unit/services/coaching-narrator.service.test.ts
git commit -m "refactor(coaching): delegate LLM validation to CoachingLlmGuardrail"
```

---

# Phase 5 — Split `PlayerAnalysis` into raw telemetry and calculated stats (Candidate #5)

**Why:** [`analytics-results.types.ts:40-61`](../../src/types/analytics-results.types.ts) bundles raw event arrays with calculated metrics. Downstream stages re-filter the raw events. Splitting the type makes each stage's input contract honest: fight-context-builder needs the events; the decision engine and Discord embeds need only the stats.

### Task 5.1: Introduce the two split types alongside the old one

**Files:**
- Modify: `src/types/analytics-results.types.ts`

- [ ] **Step 1: Add new types without deleting `PlayerAnalysis` yet**

Append to `src/types/analytics-results.types.ts`:

```ts
export interface PlayerTelemetry {
  playerName: string;
  matchStartTime: Date;
  killEvents: LogPlayerKillV2[];
  knockdownEvents: LogPlayerMakeGroggy[];
  damageEvents: LogPlayerTakeDamage[];
  reviveEvents: LogPlayerRevive[];
  deathEvents: LogPlayerKillV2[];
  knockedDownEvents: LogPlayerMakeGroggy[];
}

export interface PlayerStats {
  playerName: string;
  weaponStats: WeaponStats[];
  killChains: KillChain[];
  calculatedAssists: AssistInfo[];
  totalDamageDealt: number;
  totalDamageTaken: number;
  kdRatio: number;
  avgKillDistance: number;
  headshotPercentage: number;
  killsPerMinute: number;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run typecheck`
Expected: clean — new types are unused, no break.

- [ ] **Step 3: Commit**

```bash
git add src/types/analytics-results.types.ts
git commit -m "feat(types): add PlayerTelemetry and PlayerStats alongside PlayerAnalysis"
```

### Task 5.2: Make `PlayerAnalysis` an alias of the union (transition step)

- [ ] **Step 1: Mark old type as the union of both**

In `src/types/analytics-results.types.ts`, replace the body of `PlayerAnalysis` with:

```ts
export interface PlayerAnalysis extends PlayerTelemetry, PlayerStats {}
```

Delete the now-duplicated field declarations inside `PlayerAnalysis`.

- [ ] **Step 2: Verify nothing breaks**

Run: `npm run typecheck && npm test`
Expected: clean. This change is structural-equivalent; all consumers still see every field.

- [ ] **Step 3: Commit**

```bash
git add src/types/analytics-results.types.ts
git commit -m "refactor(types): express PlayerAnalysis as PlayerTelemetry & PlayerStats"
```

### Task 5.3: Narrow consumer signatures to the smallest type they need

This task is the actual win; the previous two only set up the seam.

- [ ] **Step 1: List the readers**

Run (PowerShell): `Select-String -Path "src/**/*.ts" -Pattern "PlayerAnalysis" -SimpleMatch`
For each match, decide: does this code touch raw event arrays (→ `PlayerTelemetry`), calculated stats (→ `PlayerStats`), or both (→ keep `PlayerAnalysis`)?

- [ ] **Step 2: Update signatures one file at a time, type-checking between**

For each file:
- Change parameter types from `PlayerAnalysis` to the narrower type.
- Run `npm run typecheck`. Any failure points at a hidden dependency on the wider type — investigate before widening back.

Files known to take `PlayerAnalysis` today:
- `src/services/fight-context-builder.service.ts` — reads `deathEvents`, `knockedDownEvents`, `matchStartTime`, `playerName` → narrow to `PlayerTelemetry`.
- `src/services/discord-bot.service.ts` (e.g. `createEnhancedPlayerEmbed`) — reads stats and event arrays → keep `PlayerAnalysis` if both are used, or split call sites.

Commit one file at a time:

```bash
git add src/services/fight-context-builder.service.ts
git commit -m "refactor(coaching): FightContextBuilder takes PlayerTelemetry, not PlayerAnalysis"
```

- [ ] **Step 3: Run full suite**

Run: `npm test`
Expected: all green at each commit boundary.

---

# Phase 6 — Document and inject decision-engine scoring weights (Candidate #6)

**Why:** [`coaching-decision-engine.service.ts:8-12, 178-184`](../../src/services/coaching-decision-engine.service.ts) holds a magic-number weighted sum with no commentary on why death = 50, bad reset = 30, trade range = 10. Tuning is the most likely thing to change about this service. Independent of other phases.

### Task 6.1: Promote weights to a config object

**Files:**
- Create: `src/config/coaching-weights.ts`
- Modify: `src/services/coaching-decision-engine.service.ts`

- [ ] **Step 1: Failing test — weights are configurable**

Add to `test/unit/services/coaching-decision-engine.service.test.ts`:

```ts
import {
  type CoachingScoringWeights,
  DEFAULT_COACHING_SCORING_WEIGHTS,
} from '../../../src/config/coaching-weights';

describe('CoachingDecisionEngineService — scoring weights', () => {
  it('exposes default weights matching legacy magic numbers', () => {
    expect(DEFAULT_COACHING_SCORING_WEIGHTS).toEqual<CoachingScoringWeights>({
      deathOutcome: 50,
      knockOutcome: 40,
      badReset: 30,
      tradeRangeKnown: 10,
      noTeammateDamage: 5,
      heightKnown: 5,
    });
  });

  it('accepts injected weights and uses them in scoring', () => {
    const engine = new CoachingDecisionEngineService({
      ...DEFAULT_COACHING_SCORING_WEIGHTS,
      deathOutcome: 1000,
      knockOutcome: 0,
      badReset: 0,
      tradeRangeKnown: 0,
      noTeammateDamage: 0,
      heightKnown: 0,
    });
    // Two FightContext fixtures with outcomes 'death' and 'knock'; the death must win
    // (Fixtures left to the existing test file's helpers — extend as needed.)
    // expect(engine.createInsights([deathCtx, knockCtx])[0].playerName).toBe(deathCtx.playerName);
  });
});
```

Run: `npx jest test/unit/services/coaching-decision-engine.service.test.ts`
Expected: FAIL — config module not found.

- [ ] **Step 2: Create config**

`src/config/coaching-weights.ts`:

```ts
export interface CoachingScoringWeights {
  /** Points added when the player died (vs. only being knocked). Larger = death cases dominate ranking. */
  deathOutcome: number;
  /** Points added when the player was only knocked. Keep below deathOutcome so deaths rank first. */
  knockOutcome: number;
  /** Bonus when the fight matches the "bad reset" pattern (heavy damage + same enemy + no reposition). */
  badReset: number;
  /** Bonus when telemetry trade-range confidence is known (i.e. teammate positions are usable). */
  tradeRangeKnown: number;
  /** Bonus when the closest teammate did not damage the enemy in the trade window. */
  noTeammateDamage: number;
  /** Bonus when height advantage is observable from telemetry. */
  heightKnown: number;
}

export const DEFAULT_COACHING_SCORING_WEIGHTS: CoachingScoringWeights = {
  deathOutcome: 50,
  knockOutcome: 40,
  badReset: 30,
  tradeRangeKnown: 10,
  noTeammateDamage: 5,
  heightKnown: 5,
};
```

- [ ] **Step 3: Inject into decision engine**

In `src/services/coaching-decision-engine.service.ts`:

- Add import:
  ```ts
  import {
    type CoachingScoringWeights,
    DEFAULT_COACHING_SCORING_WEIGHTS,
  } from '../config/coaching-weights';
  ```
- Add constructor:
  ```ts
  public constructor(
    private readonly weights: CoachingScoringWeights = DEFAULT_COACHING_SCORING_WEIGHTS
  ) {}
  ```
- Replace `scoreContext` body (lines 178–184):
  ```ts
  private scoreContext(context: FightContext): number {
    let score = context.outcome === 'death' ? this.weights.deathOutcome : this.weights.knockOutcome;
    if (this.isBadReset(context)) score += this.weights.badReset;
    if (context.tradeRangeConfidence !== 'low') score += this.weights.tradeRangeKnown;
    if (context.closestTeammateDamageToEnemy.length === 0) score += this.weights.noTeammateDamage;
    if (context.heightConfidence !== 'low') score += this.weights.heightKnown;
    return score;
  }
  ```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS — behaviour unchanged because defaults match legacy numbers.

- [ ] **Step 5: Commit**

```bash
git add src/config/coaching-weights.ts src/services/coaching-decision-engine.service.ts test/unit/services/coaching-decision-engine.service.test.ts
git commit -m "feat(coaching): inject CoachingScoringWeights with documented defaults"
```

---

# Phase 7 — Drop `PubgStorageService` facade (Candidate #8)

**Why:** [`pubg-storage.service.ts`](../../src/services/pubg-storage.service.ts) is 88 lines of 1:1 delegations to five repositories. It exposes the union of every repo's surface as one bag; callers can't see what they actually depend on. Inject specific repositories instead.

### Task 7.1: Inventory callers

- [ ] **Step 1: List call sites**

Run (PowerShell): `Select-String -Path "src/**/*.ts","test/**/*.ts" -Pattern "PubgStorageService|pubg-storage" -SimpleMatch`

Confirm callers:
- `src/index.ts` — constructs and passes to monitor.
- `src/services/match-monitor.service.ts` — field type and DI.
- `src/services/discord-bot.service.ts` — field initialised at line 135, used for player/processed-match/match/telemetry operations.

Record which repository each call uses. This list drives Task 7.2.

### Task 7.2: Replace each caller's `PubgStorageService` field with the specific repositories it uses

Do one caller per commit so each step is small and reversible.

- [ ] **Step 1: DiscordBotService**

Replace `private readonly pubgStorageService: PubgStorageService;` with the four repository fields it actually uses:

```ts
import { PlayerRepository } from '../data/repositories/player.repository';
import { ProcessedMatchRepository } from '../data/repositories/processed-match.repository';
import { MatchRepository } from '../data/repositories/match.repository';
import { TelemetryRepository } from '../data/repositories/telemetry.repository';

  private readonly playerRepository = new PlayerRepository();
  private readonly processedMatchRepository = new ProcessedMatchRepository();
  private readonly matchRepository = new MatchRepository();
  private readonly telemetryRepository = new TelemetryRepository();
```

Replace each `this.pubgStorageService.X(...)` with the corresponding repository call. For example:
- `this.pubgStorageService.addPlayer(p)` → `this.playerRepository.savePlayer(p)`
- `this.pubgStorageService.getMatch(id)` → `this.matchRepository.findMatch(id)`
- `this.pubgStorageService.saveTelemetry(...)` → `this.telemetryRepository.saveTelemetry(...)`

Refer to [`pubg-storage.service.ts`](../../src/services/pubg-storage.service.ts) for the 1:1 mapping.

Run: `npm run typecheck && npm test`
Expected: green.

Commit:

```bash
git add src/services/discord-bot.service.ts
git commit -m "refactor(discord-bot): inject specific repositories instead of PubgStorageService"
```

- [ ] **Step 2: MatchMonitorService**

Same pattern. The monitor uses player and match and processed-match operations. Replace its `pubgStorageService` field and constructor parameter with the specific repositories.

Update `src/index.ts` accordingly — it currently constructs `PubgStorageService` and passes it. After this commit, that construction is gone; the monitor's constructor takes its repositories directly.

Run: `npm run typecheck && npm test`

Commit:

```bash
git add src/services/match-monitor.service.ts src/index.ts
git commit -m "refactor(monitor): inject specific repositories instead of PubgStorageService"
```

- [ ] **Step 3: Delete the facade**

```bash
git rm src/services/pubg-storage.service.ts
```

Confirm no remaining references:

`Select-String -Path "src/**/*.ts","test/**/*.ts" -Pattern "PubgStorageService|pubg-storage" -SimpleMatch`
Expected: no matches.

Run: `npm run typecheck && npm test && npm run format:imports`

Commit:

```bash
git add -A
git commit -m "refactor: remove redundant PubgStorageService facade"
```

---

# Deferred — Speculative candidates

The architecture review flagged these as **Speculative**: real seams but only one adapter would exist today, so extracting now risks an abstraction with one user. Don't do them yet. Each has an explicit unblocking signal.

### Candidate #7 — `MatchSummaryPublisher` interface between monitor and bot

**Unblocking signal:** A second, concrete summary destination is requested (Slack, webhook, file dump) — i.e. a second adapter is about to be written. At that point, write a small plan that:
1. Defines `MatchSummaryPublisher { publish(summary): Promise<void> }`.
2. Has `DiscordBotService` implement it.
3. Switches `MatchMonitorService` to depend on the interface.
4. Constructs the new adapter in `index.ts`.

### Candidate #9 — Extract polling loop from `MatchMonitorService`

**Unblocking signal:** One of (a) the polling loop accrues a real bug that's hard to test, (b) it needs richer behaviour (backoff, jittered retry, circuit breaker), or (c) a second poller appears elsewhere in the codebase. Until then, the loop and the domain step share a file with one user and that's fine.

---

# Self-review

- **Spec coverage:** All 9 candidates from the architecture review are accounted for. Strong candidates #1–#4 get full TDD task breakdowns (Phases 1–4). Worth-exploring candidates #5, #6, #8 get full task breakdowns with smaller test scaffolds (Phases 5–7). Speculative candidates #7 and #9 are explicitly deferred with unblocking signals.
- **Placeholder scan:** No "TBD", no "implement later", no "similar to Task N". Each step shows the actual code or the exact list operation. Phase 5 Task 5.3 (file-by-file narrowing) is the closest to a discovery step — handled by giving an exact `Select-String` command and a per-file decision rule rather than a placeholder.
- **Type consistency:** `CoachingPipelineResult` discriminant `kind` is used identically in Phase 1 implementation and consumer in `DiscordBotService`. `WhitelistCoachingLlmGuardrail` constructor signature matches the narrator's default-parameter wiring in Phase 4. `CoachingScoringWeights` field names appear identically in the config, the engine constructor, and `scoreContext` in Phase 6. `PlayerTelemetry`/`PlayerStats` fields in Phase 5 are direct partitions of the old `PlayerAnalysis` — every original field has exactly one home.
