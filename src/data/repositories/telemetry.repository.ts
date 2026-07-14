import type { TelemetryEvent } from '@j03fr0st/pubg-ts';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  KillChain,
  MatchAnalysis,
  PlayerAnalysis,
} from '../../types/analytics-results.types';
import type { TelemetryCacheReadResult } from '../../types/telemetry-cache.types';
import prisma from '../prisma.client';

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

export class TelemetryRepository {
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

    await prisma.matchTelemetry.upsert({
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
    const row = await prisma.matchTelemetry.findUnique({
      where: { matchId },
      select: { rawEvents: true, playerAnalyses: true },
    });
    if (!row) return { kind: 'miss' };
    return { kind: 'corrupt', reason: 'telemetry cache hydration is not implemented' };
  }

  public async getCachedAnalyses(matchId: string): Promise<Record<string, unknown> | null> {
    const row = await prisma.matchTelemetry.findUnique({
      where: { matchId },
      select: { playerAnalyses: true },
    });
    if (!row) return null;
    const stored = row.playerAnalyses;
    if (
      typeof stored === 'object' &&
      stored !== null &&
      !Array.isArray(stored) &&
      stored.version === 1 &&
      typeof stored.players === 'object' &&
      stored.players !== null &&
      !Array.isArray(stored.players)
    ) {
      return stored.players as Record<string, unknown>;
    }
    return stored as Record<string, unknown>;
  }
}
