import type { PubgClient } from '@j03fr0st/pubg-ts';
import { MatchRepository } from '../../../src/data/repositories/match.repository';
import { PlayerRepository } from '../../../src/data/repositories/player.repository';
import { ProcessedMatchRepository } from '../../../src/data/repositories/processed-match.repository';
import type { DiscordBotService } from '../../../src/services/discord-bot.service';
import { MatchInterpreter } from '../../../src/services/match-interpreter.service';
import {
  type MatchMonitorDependencies,
  MatchMonitorService,
} from '../../../src/services/match-monitor.service';
import { makeMatchResponse } from '../../fixtures/match-response.fixture';

jest.mock('../../../src/data/repositories/match.repository');
jest.mock('../../../src/data/repositories/player.repository');
jest.mock('../../../src/data/repositories/processed-match.repository');

const monitoredPlayer = {
  id: 'player-1',
  pubgId: 'account-player-1',
  name: 'Player1',
  shardId: 'steam',
  patchVersion: '36.1.1',
  titleId: 'bluehole-pubg',
  lastMatchAt: null,
  createdAt: new Date('2026-07-14T08:00:00.000Z'),
  updatedAt: new Date('2026-07-14T08:00:00.000Z'),
};

function makePlayerResponse(matchIds: string[]) {
  return {
    data: {
      id: 'account-player-1',
      type: 'player',
      attributes: { name: 'Player1' },
      relationships: {
        matches: { data: matchIds.map((id) => ({ id, type: 'match' })) },
      },
    },
  };
}

function makeResponse(matchId: string, createdAt = '2026-07-14T08:00:00.000Z') {
  const response = makeMatchResponse('account-player-1');
  response.data.id = matchId;
  response.data.attributes.createdAt = createdAt;
  return response;
}

function createDependencies(
  matchIds: string[],
  options: Partial<MatchMonitorDependencies['options']> = {}
) {
  const prisma = {} as never;
  const pubgClient = {
    players: {
      getPlayerById: jest.fn().mockResolvedValue(makePlayerResponse(matchIds)),
    },
    matches: {
      getMatch: jest.fn().mockImplementation(async (matchId: string) => makeResponse(matchId)),
    },
  };
  const playerRepository = new PlayerRepository(prisma) as jest.Mocked<PlayerRepository>;
  playerRepository.getAllPlayers.mockResolvedValue([monitoredPlayer]);
  playerRepository.savePlayer.mockResolvedValue(monitoredPlayer);
  const processedMatchRepository = new ProcessedMatchRepository(
    prisma
  ) as jest.Mocked<ProcessedMatchRepository>;
  processedMatchRepository.getProcessedMatches.mockResolvedValue([]);
  processedMatchRepository.addProcessedMatch.mockResolvedValue();
  const matchRepository = new MatchRepository(prisma) as jest.Mocked<MatchRepository>;
  matchRepository.saveMatch.mockResolvedValue();
  const discordBot = {
    sendMatchSummary: jest.fn().mockResolvedValue(undefined),
    validateChannelAccess: jest.fn().mockResolvedValue(undefined),
  };
  const dependencies: MatchMonitorDependencies = {
    discordBot: discordBot as unknown as DiscordBotService,
    pubgClient: pubgClient as unknown as PubgClient,
    playerRepository,
    processedMatchRepository,
    matchRepository,
    matchInterpreter: new MatchInterpreter(),
    options: {
      checkIntervalMs: options.checkIntervalMs ?? 60_000,
      channelId: options.channelId ?? 'channel-123',
      maxMatchesToProcess: options.maxMatchesToProcess ?? 5,
    },
  };

  return {
    dependencies,
    discordBot,
    pubgClient,
    playerRepository,
    processedMatchRepository,
    matchRepository,
  };
}

describe('MatchMonitorService', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid maxMatchesToProcess %s',
    (maxMatchesToProcess) => {
      const harness = createDependencies([], { maxMatchesToProcess });

      expect(() => new MatchMonitorService(harness.dependencies)).toThrow(
        'maxMatchesToProcess must be a positive finite integer'
      );
    }
  );

  it('refreshes by stored account ID and passes account IDs to the automatic summary', async () => {
    const harness = createDependencies(['match-xyz']);
    const createSummary = jest.spyOn(harness.dependencies.matchInterpreter, 'createSummary');
    const service = new MatchMonitorService(harness.dependencies);

    await service.checkNow();

    expect(harness.pubgClient.players.getPlayerById).toHaveBeenCalledWith('account-player-1');
    expect(createSummary).toHaveBeenCalledWith(expect.objectContaining({ matchId: 'match-xyz' }), [
      'account-player-1',
    ]);
    expect(harness.pubgClient.matches.getMatch).toHaveBeenCalledTimes(1);
    expect(harness.matchRepository.saveMatch).toHaveBeenCalledWith(
      expect.objectContaining({ matchId: 'match-xyz' })
    );
    expect(harness.discordBot.sendMatchSummary).toHaveBeenCalledWith(
      'channel-123',
      expect.objectContaining({
        matchId: 'match-xyz',
        rosterParticipants: expect.any(Array),
        monitoredPlayers: expect.any(Array),
        lobbyParticipants: expect.any(Array),
      })
    );
    expect(harness.processedMatchRepository.addProcessedMatch).toHaveBeenCalledWith('match-xyz');
  });

  it('processes no more than the configured maximum in one check cycle', async () => {
    jest.useFakeTimers();
    const harness = createDependencies(['match-1', 'match-2', 'match-3', 'match-4'], {
      checkIntervalMs: 10_000,
      channelId: 'configured-channel',
      maxMatchesToProcess: 2,
    });
    const service = new MatchMonitorService(harness.dependencies);

    const check = service.checkNow();
    await jest.runAllTimersAsync();
    await check;

    expect(harness.pubgClient.matches.getMatch).toHaveBeenCalledTimes(2);
    expect(harness.discordBot.sendMatchSummary).toHaveBeenCalledTimes(2);
    expect(harness.discordBot.sendMatchSummary).toHaveBeenCalledWith(
      'configured-channel',
      expect.any(Object)
    );
    expect(harness.processedMatchRepository.addProcessedMatch).toHaveBeenCalledTimes(2);
  });

  it('logs persistence failure but still sends, marks, and continues with later matches', async () => {
    jest.useFakeTimers();
    const harness = createDependencies(['match-save-failed', 'match-saved']);
    harness.pubgClient.matches.getMatch
      .mockResolvedValueOnce(makeResponse('match-save-failed'))
      .mockResolvedValueOnce(makeResponse('match-saved', '2026-07-14T08:01:00.000Z'));
    harness.matchRepository.saveMatch
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce();
    const service = new MatchMonitorService(harness.dependencies);

    const check = service.checkNow();
    await jest.runAllTimersAsync();
    await check;

    expect(harness.pubgClient.matches.getMatch).toHaveBeenCalledTimes(2);
    expect(harness.matchRepository.saveMatch).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to save match match-save-failed to DB: Error: database unavailable'
    );
    expect(harness.discordBot.sendMatchSummary).toHaveBeenCalledTimes(2);
    expect(harness.discordBot.sendMatchSummary).toHaveBeenCalledWith(
      'channel-123',
      expect.objectContaining({ matchId: 'match-save-failed' })
    );
    expect(harness.discordBot.sendMatchSummary).toHaveBeenCalledWith(
      'channel-123',
      expect.objectContaining({ matchId: 'match-saved' })
    );
    expect(harness.processedMatchRepository.addProcessedMatch).toHaveBeenCalledTimes(2);
    expect(harness.processedMatchRepository.addProcessedMatch).toHaveBeenCalledWith(
      'match-save-failed'
    );
    expect(harness.processedMatchRepository.addProcessedMatch).toHaveBeenCalledWith('match-saved');
  });

  it('retries an unprocessed match after marker failure with one fetch per cycle', async () => {
    let processed = false;
    const harness = createDependencies(['match-xyz']);
    harness.processedMatchRepository.getProcessedMatches.mockImplementation(async () =>
      processed ? ['match-xyz'] : []
    );
    harness.processedMatchRepository.addProcessedMatch
      .mockRejectedValueOnce(new Error('marker unavailable'))
      .mockImplementationOnce(async () => {
        processed = true;
      });
    const service = new MatchMonitorService(harness.dependencies);

    await service.checkNow();

    expect(processed).toBe(false);
    expect(harness.processedMatchRepository.addProcessedMatch).toHaveBeenCalledTimes(1);

    await service.checkNow();

    expect(processed).toBe(true);
    expect(harness.pubgClient.matches.getMatch).toHaveBeenCalledTimes(2);
    expect(harness.matchRepository.saveMatch).toHaveBeenCalledTimes(2);
    expect(harness.discordBot.sendMatchSummary).toHaveBeenCalledTimes(2);
    expect(harness.processedMatchRepository.addProcessedMatch).toHaveBeenCalledTimes(2);
  });

  it('fails startup when Discord channel access validation fails', async () => {
    const harness = createDependencies([]);
    const validationError = new Error('missing ViewChannel');
    harness.discordBot.validateChannelAccess.mockRejectedValue(validationError);
    const service = new MatchMonitorService(harness.dependencies);

    await expect(service.startMonitoring()).rejects.toThrow('missing ViewChannel');
    expect(harness.discordBot.validateChannelAccess).toHaveBeenCalledWith('channel-123');
    expect(harness.playerRepository.getAllPlayers).not.toHaveBeenCalled();
  });
});
