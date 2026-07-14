import type { TelemetryEvent } from '@j03fr0st/pubg-ts';
import type { Prisma, PrismaClient } from '../../../generated/prisma/client';
import type { KillChain, MatchAnalysis, PlayerAnalysis } from '../../types/analytics-results.types';
import type { TelemetryCacheReadResult } from '../../types/telemetry-cache.types';

interface StoredTelemetryAnalysisV1 {
  version: 1;
  matchId: string;
  processingTimeMs: number;
  totalEventsProcessed: number;
  players: Record<string, StoredPlayerAnalysis>;
}

interface StoredPlayerAnalysis extends Omit<PlayerAnalysis, 'matchStartTime' | 'killChains'> {
  matchStartTime: string;
  killChains: Array<Omit<KillChain, 'startTime'> & { startTime: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDate(value: unknown, field: string): Date | string {
  if (typeof value !== 'string') return `${field} must be a string`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? `invalid ${field}` : date;
}

function hydratePlayer(value: unknown): PlayerAnalysis | string {
  if (!isRecord(value)) return 'player analysis must be an object';
  if (typeof value.playerName !== 'string') return 'playerName must be a string';
  const matchStartTime = parseDate(value.matchStartTime, 'matchStartTime');
  if (typeof matchStartTime === 'string') return matchStartTime;

  const arrayFields = [
    'killEvents',
    'knockdownEvents',
    'damageEvents',
    'reviveEvents',
    'deathEvents',
    'knockedDownEvents',
    'weaponStats',
    'calculatedAssists',
  ] as const;
  for (const field of arrayFields) {
    if (!Array.isArray(value[field])) return `${field} must be an array`;
  }
  const rawKillChains = value.killChains;
  if (!Array.isArray(rawKillChains)) return 'killChains must be an array';

  const finiteNumberFields = [
    'totalDamageDealt',
    'totalDamageTaken',
    'kdRatio',
    'avgKillDistance',
    'headshotPercentage',
    'killsPerMinute',
  ] as const;
  for (const field of finiteNumberFields) {
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) {
      return `${field} must be a finite number`;
    }
  }

  const killChains: KillChain[] = [];
  for (const rawChain of rawKillChains) {
    if (!isRecord(rawChain)) return 'kill chain must be an object';
    if (!Array.isArray(rawChain.kills)) return 'kill chain kills must be an array';
    if (!Array.isArray(rawChain.weaponsUsed)) {
      return 'kill chain weaponsUsed must be an array';
    }
    if (!rawChain.weaponsUsed.every((weapon) => typeof weapon === 'string')) {
      return 'kill chain weaponsUsed must contain strings';
    }
    if (typeof rawChain.duration !== 'number' || !Number.isFinite(rawChain.duration)) {
      return 'kill chain duration must be a finite number';
    }
    if (
      typeof rawChain.averageTimeBetweenKills !== 'number' ||
      !Number.isFinite(rawChain.averageTimeBetweenKills)
    ) {
      return 'kill chain averageTimeBetweenKills must be a finite number';
    }
    const startTime = parseDate(rawChain.startTime, 'kill chain startTime');
    if (typeof startTime === 'string') return startTime;
    killChains.push({ ...rawChain, startTime } as unknown as KillChain);
  }

  return { ...value, matchStartTime, killChains } as unknown as PlayerAnalysis;
}

export class TelemetryRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async saveTelemetry(
    rawEvents: TelemetryEvent[],
    matchAnalysis: MatchAnalysis
  ): Promise<void> {
    const players = Object.fromEntries(
      [...matchAnalysis.playerAnalyses].map(([name, analysis]) => [
        name,
        {
          ...analysis,
          matchStartTime: analysis.matchStartTime.toISOString(),
          killChains: analysis.killChains.map((chain) => ({
            ...chain,
            startTime: chain.startTime.toISOString(),
          })),
        },
      ])
    );
    const stored: StoredTelemetryAnalysisV1 = {
      version: 1,
      matchId: matchAnalysis.matchId,
      processingTimeMs: matchAnalysis.processingTimeMs,
      totalEventsProcessed: matchAnalysis.totalEventsProcessed,
      players,
    };

    await this.prisma.matchTelemetry.upsert({
      where: { matchId: matchAnalysis.matchId },
      update: {
        rawEvents: rawEvents as unknown as Prisma.InputJsonValue,
        playerAnalyses: stored as unknown as Prisma.InputJsonValue,
      },
      create: {
        matchId: matchAnalysis.matchId,
        rawEvents: rawEvents as unknown as Prisma.InputJsonValue,
        playerAnalyses: stored as unknown as Prisma.InputJsonValue,
      },
    });
  }

  public async getTelemetry(matchId: string): Promise<TelemetryCacheReadResult> {
    const row = await this.prisma.matchTelemetry.findUnique({
      where: { matchId },
      select: { rawEvents: true, playerAnalyses: true },
    });
    if (!row) return { kind: 'miss' };
    if (!Array.isArray(row.rawEvents)) {
      return { kind: 'corrupt', reason: 'rawEvents must be an array' };
    }
    if (!row.rawEvents.every((event) => isRecord(event) && typeof event._T === 'string')) {
      return { kind: 'corrupt', reason: 'rawEvents entries must contain a string _T' };
    }
    if (!isRecord(row.playerAnalyses)) {
      return { kind: 'corrupt', reason: 'playerAnalyses must be an object' };
    }

    const stored = row.playerAnalyses;
    const version = typeof stored.version === 'number' ? stored.version : undefined;
    if (version !== undefined && version !== 1) {
      return { kind: 'corrupt', reason: `unsupported telemetry cache version ${String(version)}` };
    }
    const versioned = version === 1;
    const players = versioned ? stored.players : stored;
    if (!isRecord(players)) {
      return { kind: 'corrupt', reason: 'players must be an object' };
    }

    let hydratedMatchId = matchId;
    let processingTimeMs = 0;
    let totalEventsProcessed = row.rawEvents.length;
    if (versioned) {
      if (typeof stored.matchId !== 'string') {
        return { kind: 'corrupt', reason: 'matchId must be a string' };
      }
      if (
        typeof stored.processingTimeMs !== 'number' ||
        !Number.isFinite(stored.processingTimeMs)
      ) {
        return { kind: 'corrupt', reason: 'processingTimeMs must be a finite number' };
      }
      if (
        typeof stored.totalEventsProcessed !== 'number' ||
        !Number.isFinite(stored.totalEventsProcessed)
      ) {
        return { kind: 'corrupt', reason: 'totalEventsProcessed must be a finite number' };
      }
      hydratedMatchId = stored.matchId;
      processingTimeMs = stored.processingTimeMs;
      totalEventsProcessed = stored.totalEventsProcessed;
    }

    const playerAnalyses = new Map<string, PlayerAnalysis>();
    for (const [name, rawPlayer] of Object.entries(players)) {
      const player = hydratePlayer(rawPlayer);
      if (typeof player === 'string') return { kind: 'corrupt', reason: player };
      playerAnalyses.set(name, player);
    }

    return {
      kind: 'hit',
      rawEvents: row.rawEvents as unknown as TelemetryEvent[],
      matchAnalysis: {
        matchId: hydratedMatchId,
        processingTimeMs,
        totalEventsProcessed,
        playerAnalyses,
      },
    };
  }
}
