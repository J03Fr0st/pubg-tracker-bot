import { Prisma } from '../../generated/prisma/client';
import prisma from '../prisma.client';

export class TelemetryRepository {
  public async saveTelemetry(
    matchId: string,
    rawEvents: unknown[],
    playerAnalyses: Record<string, unknown>
  ): Promise<void> {
    await prisma.matchTelemetry.upsert({
      where: { matchId },
      update: {
        rawEvents: rawEvents as Prisma.InputJsonValue,
        playerAnalyses: playerAnalyses as Prisma.InputJsonValue,
      },
      create: {
        matchId,
        rawEvents: rawEvents as Prisma.InputJsonValue,
        playerAnalyses: playerAnalyses as Prisma.InputJsonValue,
      },
    });
  }

  public async getCachedAnalyses(
    matchId: string
  ): Promise<Record<string, unknown> | null> {
    const row = await prisma.matchTelemetry.findUnique({
      where: { matchId },
      select: { playerAnalyses: true },
    });
    if (!row) return null;
    return row.playerAnalyses as Record<string, unknown>;
  }
}
