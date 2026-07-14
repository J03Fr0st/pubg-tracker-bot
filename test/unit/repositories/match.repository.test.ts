import prisma from '../../../src/data/prisma.client';
import { MatchRepository } from '../../../src/data/repositories/match.repository';
import { MatchInterpreter } from '../../../src/services/match-interpreter.service';
import { makeMatchResponse } from '../../fixtures/match-response.fixture';

jest.mock('../../../src/data/prisma.client', () => ({
  __esModule: true,
  default: {
    match: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    roster: { create: jest.fn(), deleteMany: jest.fn() },
    participant: { create: jest.fn(), deleteMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('MatchRepository', () => {
  const repo = new MatchRepository();
  const interpreter = new MatchInterpreter();

  beforeEach(() => jest.clearAllMocks());

  it('saves a match with participants and rosters', async () => {
    (mockPrisma.$transaction as jest.Mock).mockImplementation((fn) => fn(mockPrisma));
    (mockPrisma.match.upsert as jest.Mock).mockResolvedValue({ matchId: 'match-xyz' });
    (mockPrisma.roster.create as jest.Mock)
      .mockResolvedValueOnce({ id: 'stored-roster-1' })
      .mockResolvedValueOnce({ id: 'stored-roster-2' });
    (mockPrisma.participant.create as jest.Mock).mockResolvedValue({});
    const interpreted = interpreter.interpret(makeMatchResponse());

    await repo.saveMatch(interpreted);

    expect(mockPrisma.match.upsert).toHaveBeenCalledWith({
      where: { matchId: 'match-xyz' },
      update: {},
      create: expect.objectContaining({
        matchId: 'match-xyz',
        playedAt: new Date('2026-07-14T08:00:00.000Z'),
        telemetryUrl: 'https://telemetry.example.com/match.json',
      }),
    });
    expect(mockPrisma.roster.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.participant.create).toHaveBeenCalledTimes(3);
  });

  it('atomically replaces child rows when the same match is saved again', async () => {
    const participantDeleteMany = mockPrisma.participant.deleteMany as jest.Mock;
    const rosterDeleteMany = mockPrisma.roster.deleteMany as jest.Mock;
    const rosterCreate = mockPrisma.roster.create as jest.Mock;
    (mockPrisma.$transaction as jest.Mock).mockImplementation((fn) => fn(mockPrisma));
    (mockPrisma.match.upsert as jest.Mock).mockResolvedValue({ matchId: 'match-xyz' });
    (mockPrisma.participant.deleteMany as jest.Mock).mockResolvedValue({ count: 3 });
    (mockPrisma.roster.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });
    (mockPrisma.roster.create as jest.Mock)
      .mockResolvedValueOnce({ id: 'first-roster-1' })
      .mockResolvedValueOnce({ id: 'first-roster-2' })
      .mockResolvedValueOnce({ id: 'second-roster-1' })
      .mockResolvedValueOnce({ id: 'second-roster-2' });
    (mockPrisma.participant.create as jest.Mock).mockResolvedValue({});
    const interpreted = interpreter.interpret(makeMatchResponse());

    await repo.saveMatch(interpreted);
    await repo.saveMatch(interpreted);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    expect(mockPrisma.participant.deleteMany).toHaveBeenCalledTimes(2);
    expect(mockPrisma.participant.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { matchId: 'match-xyz' },
    });
    expect(mockPrisma.roster.deleteMany).toHaveBeenCalledTimes(2);
    expect(mockPrisma.roster.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { matchId: 'match-xyz' },
    });
    expect(mockPrisma.roster.create).toHaveBeenCalledTimes(4);
    expect(mockPrisma.participant.create).toHaveBeenCalledTimes(6);
    expect(participantDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      rosterDeleteMany.mock.invocationCallOrder[0]
    );
    expect(rosterDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      rosterCreate.mock.invocationCallOrder[0]
    );
    expect(participantDeleteMany.mock.invocationCallOrder[1]).toBeGreaterThan(
      (mockPrisma.participant.create as jest.Mock).mock.invocationCallOrder[2]
    );
    expect(participantDeleteMany.mock.invocationCallOrder[1]).toBeLessThan(
      rosterDeleteMany.mock.invocationCallOrder[1]
    );
    expect(rosterDeleteMany.mock.invocationCallOrder[1]).toBeLessThan(
      rosterCreate.mock.invocationCallOrder[2]
    );
  });

  it('finds a match by matchId', async () => {
    (mockPrisma.match.findUnique as jest.Mock).mockResolvedValue({ matchId: 'match-xyz' });
    const result = await repo.findMatch('match-xyz');
    expect(result?.matchId).toBe('match-xyz');
  });
});
