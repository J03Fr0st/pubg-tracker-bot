import prisma from '../prisma.client';

export class ProcessedMatchRepository {
  public async getProcessedMatches(): Promise<string[]> {
    const matches = await prisma.processedMatch.findMany({ select: { matchId: true } });
    return matches.map((m) => m.matchId);
  }

  public async addProcessedMatch(matchId: string): Promise<void> {
    await prisma.processedMatch.create({ data: { matchId } });
  }

  public async removeProcessedMatch(matchId: string): Promise<boolean> {
    try {
      await prisma.processedMatch.delete({ where: { matchId } });
      return true;
    } catch (err: any) {
      if (err?.code === 'P2025') return false;
      throw err;
    }
  }

  public async removeLastProcessedMatch(): Promise<string | null> {
    const last = await prisma.processedMatch.findFirst({
      orderBy: { processedAt: 'desc' },
      select: { matchId: true },
    });
    if (!last) return null;
    await prisma.processedMatch.delete({ where: { matchId: last.matchId } });
    return last.matchId;
  }

  public async getLastProcessedMatch(): Promise<{ matchId: string; processedAt: Date } | null> {
    const last = await prisma.processedMatch.findFirst({
      orderBy: { processedAt: 'desc' },
      select: { matchId: true, processedAt: true },
    });
    return last ?? null;
  }
}
