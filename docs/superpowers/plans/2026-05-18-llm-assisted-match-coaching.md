# LLM-Assisted Match Coaching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a telemetry-backed coaching section to the existing Discord match summary, with deterministic rules deciding the advice and optional OpenRouter narration improving the wording.

**Architecture:** Create focused coaching types, a deterministic `MatchCoachingService`, a `CoachingNarratorService` with template fallback, and an OpenRouter client behind a small interface. Wire the narrator into `DiscordBotService.createMatchSummaryEmbeds()` after telemetry analysis succeeds, while preserving the current basic-summary fallback behavior.

**Tech Stack:** TypeScript, Jest, discord.js `EmbedBuilder`, `@j03fr0st/pubg-ts` telemetry types, Node 20 global `fetch`, dotenv-backed `appConfig`.

---

## File Structure

- Create `src/types/coaching.types.ts`
  - Owns `CoachingInsight`, `CoachingNarration`, LLM payload, LLM response, and provider interfaces.
- Create `src/services/match-coaching.service.ts`
  - Converts `MatchAnalysis` and tracked player names into ranked deterministic `CoachingInsight[]`.
  - Starts with high-confidence rules using existing `PlayerAnalysis.damageEvents`, `deathEvents`, and `knockedDownEvents`.
- Create `src/services/coaching-narrator.service.ts`
  - Owns template narration, LLM fallback handling, and response validation.
- Create `src/services/openrouter-coaching-llm-client.service.ts`
  - Encapsulates OpenRouter HTTP requests, timeout handling, and response parsing.
- Modify `src/config/config.ts`
  - Adds optional `llm` config without making local startup require OpenRouter credentials.
- Modify `src/services/discord-bot.service.ts`
  - Instantiates coaching services and adds a `Coaching` embed after enhanced player embeds.
  - Keeps telemetry and Discord send failures isolated.
- Create `test/unit/services/match-coaching.service.test.ts`
  - Tests deterministic coaching rules and ranking.
- Create `test/unit/services/coaching-narrator.service.test.ts`
  - Tests template output, LLM fallback, and validation.
- Create `test/unit/services/openrouter-coaching-llm-client.service.test.ts`
  - Tests OpenRouter request shape, timeout, HTTP failure, and response parsing.
- Modify `test/integration/telemetry-discord-flow.integration.test.ts`
  - Verifies the existing match summary flow includes coaching when telemetry yields a strong insight and still posts when narration fails.
- Modify `.env.example`
  - Documents optional LLM coaching variables.

---

### Task 1: Deterministic Coaching Types And Re-Peek Rule

**Files:**
- Create: `src/types/coaching.types.ts`
- Create: `src/services/match-coaching.service.ts`
- Create: `test/unit/services/match-coaching.service.test.ts`

- [ ] **Step 1: Write the failing deterministic coaching tests**

Create `test/unit/services/match-coaching.service.test.ts`:

```typescript
import type { LogPlayerKillV2, LogPlayerTakeDamage } from '@j03fr0st/pubg-ts';
import { MatchCoachingService } from '../../../src/services/match-coaching.service';
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

function makeMatchAnalysis(analysis: PlayerAnalysis): MatchAnalysis {
  return {
    matchId: 'match-123',
    playerAnalyses: new Map([[analysis.playerName, analysis]]),
    processingTimeMs: 1,
    totalEventsProcessed: 3,
  };
}

describe('MatchCoachingService', () => {
  it('emits a high-confidence fight-reset insight when the same attacker punishes a re-peek', () => {
    const damage = {
      _D: '2024-01-01T10:18:36.000Z',
      _T: 'LogPlayerTakeDamage',
      attacker: { name: 'EnemyOne' },
      victim: { name: 'TestPlayer' },
      damage: 83,
      damageCauserName: 'WeapBerylM762_C',
    } as LogPlayerTakeDamage;

    const death = {
      _D: '2024-01-01T10:18:42.000Z',
      _T: 'LogPlayerKillV2',
      killer: { name: 'EnemyOne' },
      victim: { name: 'TestPlayer' },
      damageCauserName: 'WeapBerylM762_C',
      distance: 4200,
    } as LogPlayerKillV2;

    const service = new MatchCoachingService();
    const insights = service.analyzeMatch(
      makeMatchAnalysis(
        makeAnalysis({
          deathEvents: [death],
          damageEvents: [],
          knockedDownEvents: [],
          totalDamageTaken: 83,
        })
      ),
      ['TestPlayer'],
      [damage]
    );

    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({
      playerName: 'TestPlayer',
      category: 'fight-reset',
      severity: 'high',
      confidence: 'high',
      matchTimeSeconds: 1122,
    });
    expect(insights[0].evidence).toContain('Took 83 damage from EnemyOne');
    expect(insights[0].evidence).toContain('Died to EnemyOne 6s later');
    expect(insights[0].recommendation).toContain('Break line of sight');
  });

  it('does not emit a re-peek insight when the attacker is different', () => {
    const damage = {
      _D: '2024-01-01T10:18:36.000Z',
      _T: 'LogPlayerTakeDamage',
      attacker: { name: 'EnemyOne' },
      victim: { name: 'TestPlayer' },
      damage: 83,
    } as LogPlayerTakeDamage;

    const death = {
      _D: '2024-01-01T10:18:42.000Z',
      _T: 'LogPlayerKillV2',
      killer: { name: 'EnemyTwo' },
      victim: { name: 'TestPlayer' },
    } as LogPlayerKillV2;

    const service = new MatchCoachingService();
    const insights = service.analyzeMatch(
      makeMatchAnalysis(makeAnalysis({ deathEvents: [death] })),
      ['TestPlayer'],
      [damage]
    );

    expect(insights).toHaveLength(0);
  });

  it('returns at most three insights ranked by severity and confidence', () => {
    const service = new MatchCoachingService();
    const matchStartTime = new Date('2024-01-01T10:00:00.000Z');

    const analyses = new Map<string, PlayerAnalysis>();
    const damageEvents: LogPlayerTakeDamage[] = [];

    for (const [index, name] of ['Alpha', 'Bravo', 'Charlie', 'Delta'].entries()) {
      const damage = {
        _D: `2024-01-01T10:10:0${index}.000Z`,
        _T: 'LogPlayerTakeDamage',
        attacker: { name: `Enemy${index}` },
        victim: { name },
        damage: 90 - index,
      } as LogPlayerTakeDamage;
      const death = {
        _D: `2024-01-01T10:10:1${index}.000Z`,
        _T: 'LogPlayerKillV2',
        killer: { name: `Enemy${index}` },
        victim: { name },
      } as LogPlayerKillV2;

      damageEvents.push(damage);
      analyses.set(name, makeAnalysis({ playerName: name, matchStartTime, deathEvents: [death] }));
    }

    const insights = service.analyzeMatch(
      {
        matchId: 'match-123',
        playerAnalyses: analyses,
        processingTimeMs: 1,
        totalEventsProcessed: 8,
      },
      ['Alpha', 'Bravo', 'Charlie', 'Delta'],
      damageEvents
    );

    expect(insights).toHaveLength(3);
    expect(insights.map((insight) => insight.playerName)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });
});
```

- [ ] **Step 2: Run the new unit test to verify it fails**

Run:

```powershell
npx jest test/unit/services/match-coaching.service.test.ts --runInBand
```

Expected: FAIL because `src/services/match-coaching.service.ts` does not exist.

- [ ] **Step 3: Add coaching types**

Create `src/types/coaching.types.ts`:

```typescript
export type CoachingCategory =
  | 'fight-reset'
  | 'team-spacing'
  | 'damage-conversion'
  | 'weapon-range'
  | 'rotation'
  | 'survival';

export type CoachingRating = 'low' | 'medium' | 'high';

export interface CoachingInsight {
  playerName: string;
  category: CoachingCategory;
  timestamp: Date;
  matchTimeSeconds: number;
  severity: CoachingRating;
  confidence: CoachingRating;
  evidence: string[];
  recommendation: string;
}

export interface CoachingNarrationSection {
  playerName: string;
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

- [ ] **Step 4: Implement the first deterministic service**

Create `src/services/match-coaching.service.ts`:

```typescript
import type { LogPlayerKillV2, LogPlayerTakeDamage } from '@j03fr0st/pubg-ts';
import type { MatchAnalysis, PlayerAnalysis } from '../types/analytics-results.types';
import type { CoachingInsight, CoachingRating } from '../types/coaching.types';

const MAX_INSIGHTS = 3;
const HEAVY_DAMAGE_THRESHOLD = 60;
const REPEEK_WINDOW_SECONDS = 20;

export class MatchCoachingService {
  public analyzeMatch(
    matchAnalysis: MatchAnalysis,
    trackedPlayerNames: string[],
    damageEvents: LogPlayerTakeDamage[] = []
  ): CoachingInsight[] {
    const insights: CoachingInsight[] = [];

    for (const playerName of trackedPlayerNames) {
      const analysis = matchAnalysis.playerAnalyses.get(playerName);
      if (!analysis) {
        continue;
      }

      const repeekInsight = this.findRepeekAfterDamageInsight(analysis, damageEvents);
      if (repeekInsight) {
        insights.push(repeekInsight);
      }
    }

    return insights.sort((left, right) => this.score(right) - this.score(left)).slice(0, MAX_INSIGHTS);
  }

  private findRepeekAfterDamageInsight(
    analysis: PlayerAnalysis,
    damageEvents: LogPlayerTakeDamage[]
  ): CoachingInsight | null {
    const decisiveDeaths = [...analysis.deathEvents, ...analysis.knockedDownEvents];

    for (const death of decisiveDeaths) {
      const deathTime = this.getEventTime(death);
      const attackerName = this.getDecisiveAttackerName(death);
      if (!deathTime || !attackerName) {
        continue;
      }

      const matchingDamage = damageEvents
        .filter((event) => this.getVictimName(event) === analysis.playerName)
        .filter((event) => this.getAttackerName(event) === attackerName)
        .filter((event) => event.damage >= HEAVY_DAMAGE_THRESHOLD)
        .map((event) => ({ event, secondsBeforeDeath: (deathTime.getTime() - this.getEventTime(event)!.getTime()) / 1000 }))
        .filter((entry) => entry.secondsBeforeDeath >= 0 && entry.secondsBeforeDeath <= REPEEK_WINDOW_SECONDS)
        .sort((left, right) => left.secondsBeforeDeath - right.secondsBeforeDeath)[0];

      if (!matchingDamage) {
        continue;
      }

      const matchTimeSeconds = Math.max(
        0,
        Math.round((deathTime.getTime() - analysis.matchStartTime.getTime()) / 1000)
      );
      const seconds = Math.round(matchingDamage.secondsBeforeDeath);
      const damage = Math.round(matchingDamage.event.damage);
      const outcome = death._T === 'LogPlayerMakeGroggy' ? 'Got knocked' : 'Died';

      return {
        playerName: analysis.playerName,
        category: 'fight-reset',
        timestamp: deathTime,
        matchTimeSeconds,
        severity: 'high',
        confidence: 'high',
        evidence: [
          `Took ${damage} damage from ${attackerName}`,
          `${outcome} to ${attackerName} ${seconds}s later`,
        ],
        recommendation:
          'Break line of sight, heal, or force a new angle before challenging the same player again.',
      };
    }

    return null;
  }

  private getEventTime(event: { _D?: string }): Date | null {
    if (!event._D) {
      return null;
    }

    const parsed = new Date(event._D);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private getAttackerName(event: LogPlayerTakeDamage): string | null {
    return event.attacker?.name ?? null;
  }

  private getVictimName(event: LogPlayerTakeDamage): string | null {
    return event.victim?.name ?? null;
  }

  private getDecisiveAttackerName(event: LogPlayerKillV2 | { attacker?: { name?: string } }): string | null {
    if ('killer' in event) {
      return event.killer?.name ?? null;
    }

    return event.attacker?.name ?? null;
  }

  private score(insight: CoachingInsight): number {
    return this.ratingScore(insight.severity) * 10 + this.ratingScore(insight.confidence);
  }

  private ratingScore(rating: CoachingRating): number {
    if (rating === 'high') return 3;
    if (rating === 'medium') return 2;
    return 1;
  }
}
```

- [ ] **Step 5: Run the deterministic service test**

Run:

```powershell
npx jest test/unit/services/match-coaching.service.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit deterministic coaching service**

Run:

```powershell
git add src/types/coaching.types.ts src/services/match-coaching.service.ts test/unit/services/match-coaching.service.test.ts
git commit -m "feat: add deterministic match coaching insights"
```

---

### Task 2: Template Narration And Validation

**Files:**
- Modify: `src/types/coaching.types.ts`
- Create: `src/services/coaching-narrator.service.ts`
- Create: `test/unit/services/coaching-narrator.service.test.ts`

- [ ] **Step 1: Write failing narrator tests**

Create `test/unit/services/coaching-narrator.service.test.ts`:

```typescript
import { CoachingNarratorService } from '../../../src/services/coaching-narrator.service';
import type { CoachingInsight, CoachingLlmClient } from '../../../src/types/coaching.types';

const insight: CoachingInsight = {
  playerName: 'TestPlayer',
  category: 'fight-reset',
  timestamp: new Date('2024-01-01T10:18:42.000Z'),
  matchTimeSeconds: 1122,
  severity: 'high',
  confidence: 'high',
  evidence: ['Took 83 damage from EnemyOne', 'Died to EnemyOne 6s later'],
  recommendation: 'Break line of sight, heal, or force a new angle before challenging the same player again.',
};

describe('CoachingNarratorService', () => {
  it('formats deterministic template narration when LLM is disabled', async () => {
    const service = new CoachingNarratorService(undefined, {
      enabled: false,
      maxLineLength: 240,
    });

    const narration = await service.narrate([insight]);

    expect(narration.sections).toHaveLength(1);
    expect(narration.sections[0].playerName).toBe('TestPlayer');
    expect(narration.sections[0].lines[0]).toContain('18:42 - Fight reset');
    expect(narration.sections[0].lines[0]).toContain('Took 83 damage from EnemyOne');
  });

  it('uses valid LLM narration when enabled', async () => {
    const llmClient: CoachingLlmClient = {
      narrate: jest.fn().mockResolvedValue({
        sections: [
          {
            playerName: 'TestPlayer',
            lines: [
              '18:42 - Fight reset: You took 83 damage and died 6s later to the same player. Break line of sight and heal before challenging again.',
            ],
          },
        ],
      }),
    };
    const service = new CoachingNarratorService(llmClient, {
      enabled: true,
      maxLineLength: 240,
    });

    const narration = await service.narrate([insight]);

    expect(llmClient.narrate).toHaveBeenCalledWith([insight]);
    expect(narration.sections[0].lines[0]).toContain('You took 83 damage');
  });

  it('falls back to template narration when LLM throws', async () => {
    const llmClient: CoachingLlmClient = {
      narrate: jest.fn().mockRejectedValue(new Error('OpenRouter timeout')),
    };
    const service = new CoachingNarratorService(llmClient, {
      enabled: true,
      maxLineLength: 240,
    });

    const narration = await service.narrate([insight]);

    expect(narration.sections[0].lines[0]).toContain('Took 83 damage from EnemyOne');
  });

  it('rejects LLM narration that invents a new player name', async () => {
    const llmClient: CoachingLlmClient = {
      narrate: jest.fn().mockResolvedValue({
        sections: [
          {
            playerName: 'TestPlayer',
            lines: ['18:42 - Fight reset: EnemyTwo punished your re-peek. Heal before re-engaging.'],
          },
        ],
      }),
    };
    const service = new CoachingNarratorService(llmClient, {
      enabled: true,
      maxLineLength: 240,
    });

    const narration = await service.narrate([insight]);

    expect(narration.sections[0].lines[0]).toContain('Took 83 damage from EnemyOne');
    expect(narration.sections[0].lines[0]).not.toContain('EnemyTwo');
  });
});
```

- [ ] **Step 2: Run the narrator test to verify it fails**

Run:

```powershell
npx jest test/unit/services/coaching-narrator.service.test.ts --runInBand
```

Expected: FAIL because `src/services/coaching-narrator.service.ts` does not exist.

- [ ] **Step 3: Implement template and guarded LLM narration**

Create `src/services/coaching-narrator.service.ts`:

```typescript
import type {
  CoachingInsight,
  CoachingLlmClient,
  CoachingNarration,
  CoachingNarratorOptions,
} from '../types/coaching.types';
import { debug } from '../utils/logger';

export class CoachingNarratorService {
  public constructor(
    private readonly llmClient?: CoachingLlmClient,
    private readonly options: CoachingNarratorOptions = { enabled: false, maxLineLength: 240 }
  ) {}

  public async narrate(insights: CoachingInsight[]): Promise<CoachingNarration> {
    if (insights.length === 0) {
      return { sections: [] };
    }

    if (this.options.enabled && this.llmClient) {
      try {
        const llmNarration = await this.llmClient.narrate(insights);
        if (this.isValidNarration(llmNarration, insights)) {
          return llmNarration;
        }
        debug('LLM coaching narration failed validation, using template narration');
      } catch (err) {
        debug(`LLM coaching narration failed, using template narration: ${err}`);
      }
    }

    return this.createTemplateNarration(insights);
  }

  private createTemplateNarration(insights: CoachingInsight[]): CoachingNarration {
    const sectionsByPlayer = new Map<string, string[]>();

    for (const insight of insights) {
      const lines = sectionsByPlayer.get(insight.playerName) ?? [];
      lines.push(this.formatTemplateLine(insight));
      sectionsByPlayer.set(insight.playerName, lines);
    }

    return {
      sections: Array.from(sectionsByPlayer.entries()).map(([playerName, lines]) => ({
        playerName,
        lines,
      })),
    };
  }

  private formatTemplateLine(insight: CoachingInsight): string {
    const label = this.toTitleCase(insight.category);
    const matchTime = this.formatMatchTime(insight.matchTimeSeconds);
    const evidence = insight.evidence.join('; ');
    const line = `${matchTime} - ${label}: ${evidence}. ${insight.recommendation}`;

    if (line.length <= this.options.maxLineLength) {
      return line;
    }

    return `${line.slice(0, this.options.maxLineLength - 1)}…`;
  }

  private isValidNarration(narration: CoachingNarration, insights: CoachingInsight[]): boolean {
    if (!Array.isArray(narration.sections)) {
      return false;
    }

    const allowedPlayers = new Set(insights.map((insight) => insight.playerName));
    const allowedNumbers = new Set(
      insights.flatMap((insight) => [
        String(insight.matchTimeSeconds),
        this.formatMatchTime(insight.matchTimeSeconds),
        ...insight.evidence.flatMap((text) => text.match(/\d+/g) ?? []),
      ])
    );
    const allowedNames = new Set<string>();
    for (const insight of insights) {
      allowedNames.add(insight.playerName);
      for (const evidence of insight.evidence) {
        for (const token of evidence.match(/\b[A-Z][A-Za-z0-9_]+\b/g) ?? []) {
          allowedNames.add(token);
        }
      }
    }

    return narration.sections.every((section) => {
      if (!allowedPlayers.has(section.playerName) || !Array.isArray(section.lines)) {
        return false;
      }

      return section.lines.every((line) => {
        if (line.length > this.options.maxLineLength) {
          return false;
        }

        for (const number of line.match(/\d+/g) ?? []) {
          if (!allowedNumbers.has(number)) {
            return false;
          }
        }

        for (const name of line.match(/\b[A-Z][A-Za-z0-9_]+\b/g) ?? []) {
          if (!allowedNames.has(name) && !['Fight', 'Reset', 'Break'].includes(name)) {
            return false;
          }
        }

        return true;
      });
    });
  }

  private formatMatchTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  private toTitleCase(category: string): string {
    return category
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
```

- [ ] **Step 4: Run the narrator tests**

Run:

```powershell
npx jest test/unit/services/coaching-narrator.service.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Run deterministic coaching and narrator tests together**

Run:

```powershell
npx jest test/unit/services/match-coaching.service.test.ts test/unit/services/coaching-narrator.service.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit narration service**

Run:

```powershell
git add src/types/coaching.types.ts src/services/coaching-narrator.service.ts test/unit/services/coaching-narrator.service.test.ts
git commit -m "feat: add coaching narration fallback"
```

---

### Task 3: LLM Configuration And OpenRouter Client

**Files:**
- Modify: `src/config/config.ts`
- Create: `src/services/openrouter-coaching-llm-client.service.ts`
- Create: `test/unit/services/openrouter-coaching-llm-client.service.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing OpenRouter client tests**

Create `test/unit/services/openrouter-coaching-llm-client.service.test.ts`:

```typescript
import { OpenRouterCoachingLlmClient } from '../../../src/services/openrouter-coaching-llm-client.service';
import type { CoachingInsight } from '../../../src/types/coaching.types';

const insight: CoachingInsight = {
  playerName: 'TestPlayer',
  category: 'fight-reset',
  timestamp: new Date('2024-01-01T10:18:42.000Z'),
  matchTimeSeconds: 1122,
  severity: 'high',
  confidence: 'high',
  evidence: ['Took 83 damage from EnemyOne', 'Died to EnemyOne 6s later'],
  recommendation: 'Break line of sight, heal, or force a new angle before challenging the same player again.',
};

describe('OpenRouterCoachingLlmClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('posts telemetry-backed insights to OpenRouter chat completions', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sections: [
                  {
                    playerName: 'TestPlayer',
                    lines: [
                      '18:42 - Fight reset: You took 83 damage and died 6s later to EnemyOne. Break line of sight before re-challenging.',
                    ],
                  },
                ],
              }),
            },
          },
        ],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new OpenRouterCoachingLlmClient({
      apiKey: 'key-123',
      model: 'anthropic/claude-sonnet-4',
      timeoutMs: 8000,
    });

    const result = await client.narrate([insight]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer key-123',
          'Content-Type': 'application/json',
        }),
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('anthropic/claude-sonnet-4');
    expect(body.messages[0].content).toContain('Do not invent facts');
    expect(body.messages[1].content).toContain('Took 83 damage from EnemyOne');
    expect(result.sections[0].playerName).toBe('TestPlayer');
  });

  it('throws on non-2xx OpenRouter responses', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    }) as unknown as typeof fetch;

    const client = new OpenRouterCoachingLlmClient({
      apiKey: 'key-123',
      model: 'anthropic/claude-sonnet-4',
      timeoutMs: 8000,
    });

    await expect(client.narrate([insight])).rejects.toThrow('OpenRouter request failed: 429 rate limited');
  });

  it('throws when OpenRouter returns invalid JSON content', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'plain text' } }],
      }),
    }) as unknown as typeof fetch;

    const client = new OpenRouterCoachingLlmClient({
      apiKey: 'key-123',
      model: 'anthropic/claude-sonnet-4',
      timeoutMs: 8000,
    });

    await expect(client.narrate([insight])).rejects.toThrow('OpenRouter coaching response was not valid JSON');
  });
});
```

- [ ] **Step 2: Run the OpenRouter test to verify it fails**

Run:

```powershell
npx jest test/unit/services/openrouter-coaching-llm-client.service.test.ts --runInBand
```

Expected: FAIL because `src/services/openrouter-coaching-llm-client.service.ts` does not exist.

- [ ] **Step 3: Add LLM config fields**

Modify `src/config/config.ts`.

Add to `AppConfig` after `monitoring`:

```typescript
  // LLM coaching configuration
  llm: {
    coachingEnabled: boolean;
    provider: 'openrouter';
    openRouterApiKey?: string;
    openRouterModel?: string;
    timeoutMs: number;
  };
```

Add this helper after `getNumericEnv`:

```typescript
function getBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}
```

Add to `appConfig` after `monitoring`:

```typescript
  llm: {
    coachingEnabled: getBooleanEnv('LLM_COACHING_ENABLED', false),
    provider: 'openrouter',
    openRouterApiKey: process.env.OPENROUTER_API_KEY,
    openRouterModel: process.env.OPENROUTER_MODEL,
    timeoutMs: getNumericEnv('LLM_TIMEOUT_MS', 8000),
  },
```

Add to `validateConfig()` before `success('Configuration validated successfully')`:

```typescript
  if (appConfig.llm.coachingEnabled && !appConfig.llm.openRouterApiKey) {
    warn('LLM coaching is enabled but OPENROUTER_API_KEY is missing; coaching will use template narration');
  }

  if (appConfig.llm.timeoutMs <= 0) {
    throw new Error('LLM timeout must be greater than 0');
  }
```

- [ ] **Step 4: Implement OpenRouter client**

Create `src/services/openrouter-coaching-llm-client.service.ts`:

```typescript
import type {
  CoachingInsight,
  CoachingLlmClient,
  CoachingNarration,
  OpenRouterChatResponse,
} from '../types/coaching.types';

interface OpenRouterCoachingLlmClientOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';

export class OpenRouterCoachingLlmClient implements CoachingLlmClient {
  public constructor(private readonly options: OpenRouterCoachingLlmClientOptions) {}

  public async narrate(insights: CoachingInsight[]): Promise<CoachingNarration> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.options.timeoutMs);

    try {
      const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            {
              role: 'system',
              content:
                'You are a PUBG coaching assistant. Rewrite the supplied telemetry-backed coaching insights for Discord. Do not invent facts. Do not add advice that is not supported by the evidence. Keep each insight under two short sentences. Return only valid JSON.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                insights: insights.map((insight) => ({
                  playerName: insight.playerName,
                  category: insight.category,
                  matchTime: this.formatMatchTime(insight.matchTimeSeconds),
                  severity: insight.severity,
                  confidence: insight.confidence,
                  evidence: insight.evidence,
                  recommendation: insight.recommendation,
                })),
              }),
            },
          ],
          response_format: {
            type: 'json_object',
          },
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenRouter request failed: ${response.status} ${text}`);
      }

      const json = (await response.json()) as OpenRouterChatResponse;
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('OpenRouter coaching response did not include message content');
      }

      try {
        return JSON.parse(content) as CoachingNarration;
      } catch {
        throw new Error('OpenRouter coaching response was not valid JSON');
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private formatMatchTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}
```

- [ ] **Step 5: Update `.env.example`**

Append to `.env.example`:

```env
# Optional LLM-assisted coaching narration
LLM_COACHING_ENABLED=false
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=
OPENROUTER_MODEL=anthropic/claude-sonnet-4
LLM_TIMEOUT_MS=8000
```

- [ ] **Step 6: Run OpenRouter and typecheck verification**

Run:

```powershell
npx jest test/unit/services/openrouter-coaching-llm-client.service.test.ts --runInBand
npm run typecheck
```

Expected: both commands pass.

- [ ] **Step 7: Commit OpenRouter support**

Run:

```powershell
git add src/config/config.ts src/services/openrouter-coaching-llm-client.service.ts test/unit/services/openrouter-coaching-llm-client.service.test.ts .env.example
git commit -m "feat: add openrouter coaching narration client"
```

---

### Task 4: Discord Match Summary Integration

**Files:**
- Modify: `src/services/discord-bot.service.ts`
- Modify: `test/integration/telemetry-discord-flow.integration.test.ts`

- [ ] **Step 1: Write failing integration tests for coaching embed behavior**

Add these tests inside `describe('sendMatchSummary with telemetry processing', () => { ... })` in `test/integration/telemetry-discord-flow.integration.test.ts`:

```typescript
    it('should append a coaching embed when telemetry produces a strong coaching insight', async () => {
      const mockSummary: DiscordMatchGroupSummary = {
        matchId: 'test-match-coaching',
        mapName: 'Erangel',
        gameMode: 'squad',
        playedAt: '2024-01-01T10:00:00.000Z',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-coaching',
        players: [
          {
            name: 'TestPlayer1',
            stats: createPlayerStats({
              kills: 0,
              DBNOs: 0,
              damageDealt: 0,
              longestKill: 0,
              timeSurvived: 1122,
              winPlace: 5,
              name: 'TestPlayer1',
            }),
          },
        ],
      };

      const coachingTelemetry = [
        {
          _D: '2024-01-01T10:18:36.000Z',
          _T: 'LogPlayerTakeDamage',
          attacker: { name: 'EnemyOne' },
          victim: { name: 'TestPlayer1' },
          damage: 83,
          damageCauserName: 'WeapBerylM762_C',
        },
        {
          _D: '2024-01-01T10:18:42.000Z',
          _T: 'LogPlayerKillV2',
          killer: { name: 'EnemyOne' },
          victim: { name: 'TestPlayer1' },
          damageCauserName: 'WeapBerylM762_C',
          distance: 4200,
        },
      ];

      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.telemetry.getTelemetryData.mockResolvedValue(coachingTelemetry);

      const mockChannel = {
        send: jest.fn().mockResolvedValue({ id: 'sent_message_id' }),
      };
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await discordBotService.sendMatchSummary('test-channel-id', mockSummary);

      const serializedEmbeds = mockChannel.send.mock.calls
        .flatMap((call) => call[0].embeds)
        .map((embed) => embed.toJSON());

      expect(serializedEmbeds.some((embed) => embed.title === 'Coaching')).toBe(true);
      expect(JSON.stringify(serializedEmbeds)).toContain('Fight Reset');
      expect(JSON.stringify(serializedEmbeds)).toContain('Took 83 damage from EnemyOne');
    });

    it('should still post match summary when coaching narration fails', async () => {
      const mockSummary: DiscordMatchGroupSummary = {
        matchId: 'test-match-coaching-fallback',
        mapName: 'Erangel',
        gameMode: 'squad',
        playedAt: '2024-01-01T10:00:00.000Z',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-coaching-fallback',
        players: [
          {
            name: 'TestPlayer1',
            stats: createPlayerStats({
              kills: 0,
              DBNOs: 0,
              damageDealt: 0,
              timeSurvived: 1122,
              winPlace: 5,
              name: 'TestPlayer1',
            }),
          },
        ],
      };

      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.telemetry.getTelemetryData.mockResolvedValue([
        {
          _D: '2024-01-01T10:18:36.000Z',
          _T: 'LogPlayerTakeDamage',
          attacker: { name: 'EnemyOne' },
          victim: { name: 'TestPlayer1' },
          damage: 83,
        },
        {
          _D: '2024-01-01T10:18:42.000Z',
          _T: 'LogPlayerKillV2',
          killer: { name: 'EnemyOne' },
          victim: { name: 'TestPlayer1' },
        },
      ]);

      (discordBotService as any).coachingNarrator = {
        narrate: jest.fn().mockRejectedValue(new Error('Narration failed')),
      };

      const mockChannel = {
        send: jest.fn().mockResolvedValue({ id: 'sent_message_id' }),
      };
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await expect(
        discordBotService.sendMatchSummary('test-channel-id', mockSummary)
      ).resolves.toBeUndefined();
      expect(mockChannel.send).toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run the integration test to verify it fails**

Run:

```powershell
npx jest test/integration/telemetry-discord-flow.integration.test.ts --runInBand
```

Expected: FAIL because `DiscordBotService` does not create coaching embeds yet.

- [ ] **Step 3: Add coaching services to `DiscordBotService` imports and fields**

Modify `src/services/discord-bot.service.ts`.

Add imports near the other service imports:

```typescript
import type { TelemetryEvent } from '@j03fr0st/pubg-ts';
import type { CoachingNarration } from '../types/coaching.types';
import { appConfig } from '../config/config';
import { CoachingNarratorService } from './coaching-narrator.service';
import { MatchCoachingService } from './match-coaching.service';
import { OpenRouterCoachingLlmClient } from './openrouter-coaching-llm-client.service';
```

If `TelemetryEvent` is already imported from `@j03fr0st/pubg-ts`, add it to the existing import block rather than creating a duplicate import.

Add fields beside `telemetryProcessor`:

```typescript
  private readonly matchCoachingService: MatchCoachingService;
  private coachingNarrator: CoachingNarratorService;
```

Add constructor initialization after `this.telemetryProcessor = new TelemetryProcessorService();`:

```typescript
    this.matchCoachingService = new MatchCoachingService();
    const llmClient =
      appConfig.llm.coachingEnabled && appConfig.llm.openRouterApiKey && appConfig.llm.openRouterModel
        ? new OpenRouterCoachingLlmClient({
            apiKey: appConfig.llm.openRouterApiKey,
            model: appConfig.llm.openRouterModel,
            timeoutMs: appConfig.llm.timeoutMs,
          })
        : undefined;
    this.coachingNarrator = new CoachingNarratorService(llmClient, {
      enabled: Boolean(llmClient),
      maxLineLength: 240,
    });
```

- [ ] **Step 4: Add coaching embed helper methods**

Add these private methods near `createMatchSummaryEmbeds()`:

```typescript
  private async createCoachingEmbed(
    matchAnalysis: MatchAnalysis,
    trackedPlayerNames: string[],
    telemetryData: TelemetryEvent[],
    matchColor: number
  ): Promise<EmbedBuilder | null> {
    try {
      const damageEvents = telemetryData.filter(
        (event) => event._T === 'LogPlayerTakeDamage'
      ) as LogPlayerTakeDamage[];
      const insights = this.matchCoachingService.analyzeMatch(
        matchAnalysis,
        trackedPlayerNames,
        damageEvents
      );

      if (insights.length === 0) {
        return null;
      }

      const narration = await this.coachingNarrator.narrate(insights);
      return this.buildCoachingEmbed(narration, matchColor);
    } catch (err) {
      debug(`Coaching section failed, omitting coaching embed: ${err}`);
      return null;
    }
  }

  private buildCoachingEmbed(
    narration: CoachingNarration,
    matchColor: number
  ): EmbedBuilder | null {
    if (narration.sections.length === 0) {
      return null;
    }

    const description = narration.sections
      .map((section) => [`**${section.playerName}**`, ...section.lines.map((line) => `• ${line}`)].join('\n'))
      .join('\n\n');

    if (!description.trim()) {
      return null;
    }

    return new EmbedBuilder()
      .setTitle('Coaching')
      .setDescription(description.slice(0, 4096))
      .setColor(matchColor);
  }
```

- [ ] **Step 5: Wire coaching into live telemetry embed creation**

In the live telemetry branch of `createMatchSummaryEmbeds()`, after `enhancedPlayerEmbeds` is created and before the `return`, replace:

```typescript
      success(`Created enhanced embeds for ${enhancedPlayerEmbeds.length} players`);
      return [mainEmbed, ...enhancedPlayerEmbeds];
```

with:

```typescript
      const coachingEmbed = await this.createCoachingEmbed(
        matchAnalysis,
        trackedPlayerNames,
        telemetryData,
        matchColor
      );

      success(`Created enhanced embeds for ${enhancedPlayerEmbeds.length} players`);
      return coachingEmbed
        ? [mainEmbed, ...enhancedPlayerEmbeds, coachingEmbed]
        : [mainEmbed, ...enhancedPlayerEmbeds];
```

Do not add coaching to the cache branch in this task because cached analyses do not currently include raw damage events. Add cached coaching later only if `rawEvents` are loaded from `match_telemetry`.

- [ ] **Step 6: Run integration test**

Run:

```powershell
npx jest test/integration/telemetry-discord-flow.integration.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit Discord integration**

Run:

```powershell
git add src/services/discord-bot.service.ts test/integration/telemetry-discord-flow.integration.test.ts
git commit -m "feat: add coaching section to match summaries"
```

---

### Task 5: Final Verification And Cleanup

**Files:**
- Review all changed files from Tasks 1-4.

- [ ] **Step 1: Run focused service tests**

Run:

```powershell
npx jest test/unit/services/match-coaching.service.test.ts test/unit/services/coaching-narrator.service.test.ts test/unit/services/openrouter-coaching-llm-client.service.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run focused integration tests**

Run:

```powershell
npx jest test/integration/telemetry-discord-flow.integration.test.ts test/integration/match-monitoring-with-analysis.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript validation**

Run:

```powershell
npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Run whitespace validation**

Run:

```powershell
git diff --check
```

Expected: no output.

- [ ] **Step 5: Inspect final diff**

Run:

```powershell
git diff --stat
git diff -- src/types/coaching.types.ts src/services/match-coaching.service.ts src/services/coaching-narrator.service.ts src/services/openrouter-coaching-llm-client.service.ts src/config/config.ts src/services/discord-bot.service.ts
```

Expected: changes are limited to coaching types, coaching services, optional LLM config, Discord summary integration, focused tests, and `.env.example`.

- [ ] **Step 6: Commit final cleanup if Step 5 required edits**

If Step 5 found small cleanup edits, make them and run:

```powershell
git add src test .env.example
git commit -m "chore: polish match coaching integration"
```

If Step 5 found no cleanup edits, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage: deterministic rules are introduced with the high-confidence re-peek rule first; low-confidence rules remain out of v1 execution until telemetry evidence is available. LLM narration, validation, timeout fallback, config, Discord integration, and focused verification are all covered.
- Scope control: no slash command, no map rendering, no raw telemetry decision-making by the LLM.
- Test strategy: each new service is unit tested, and the existing Discord telemetry integration test proves the new section appears without breaking summary posting.
- Known follow-up: cached telemetry coaching requires raw event retrieval from `match_telemetry`; this plan deliberately keeps cached coaching out of v1 to avoid inventing damage evidence from persisted `PlayerAnalysis` alone.
