import { PubgClient } from '@j03fr0st/pubg-ts';
import { MatchRepository } from '../../../src/data/repositories/match.repository';
import { PlayerRepository } from '../../../src/data/repositories/player.repository';
import { ProcessedMatchRepository } from '../../../src/data/repositories/processed-match.repository';
import type { DiscordBotService } from '../../../src/services/discord-bot.service';
import { MatchMonitorService } from '../../../src/services/match-monitor.service';
import { makeMatchResponse } from '../../fixtures/match-response.fixture';

jest.mock('@j03fr0st/pubg-ts', () => ({
  PubgClient: jest.fn(() => ({})),
}));

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

  it('fetches, persists, presents, and marks a new match once', async () => {
    const pubgClient = {
      players: {
        getPlayerByName: jest.fn().mockResolvedValue({
          data: {
            id: 'account-player-1',
            type: 'player',
            attributes: { name: 'Player1' },
            relationships: { matches: { data: [{ id: 'match-xyz', type: 'match' }] } },
          },
        }),
      },
      matches: { getMatch: jest.fn().mockResolvedValue(makeMatchResponse()) },
    };
    (PubgClient as jest.MockedClass<typeof PubgClient>).mockImplementation(
      () => pubgClient as never
    );
    jest
      .spyOn(PlayerRepository.prototype, 'getAllPlayers')
      .mockResolvedValue([{ id: 1, pubgId: 'account-player-1', name: 'Player1' } as never]);
    jest.spyOn(PlayerRepository.prototype, 'savePlayer').mockResolvedValue({} as never);
    jest.spyOn(ProcessedMatchRepository.prototype, 'getProcessedMatches').mockResolvedValue([]);
    const addProcessedMatch = jest
      .spyOn(ProcessedMatchRepository.prototype, 'addProcessedMatch')
      .mockResolvedValue();
    const saveMatch = jest.spyOn(MatchRepository.prototype, 'saveMatch').mockResolvedValue();
    const discordBot = {
      sendMatchSummary: jest.fn().mockResolvedValue(undefined),
    };
    const service = new MatchMonitorService(discordBot as never, 'api-key');

    await service.checkNow();

    expect(pubgClient.matches.getMatch).toHaveBeenCalledTimes(1);
    expect(saveMatch).toHaveBeenCalledWith(expect.objectContaining({ matchId: 'match-xyz' }));
    expect(discordBot.sendMatchSummary).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ matchId: 'match-xyz', players: expect.any(Array) })
    );
    expect(addProcessedMatch).toHaveBeenCalledWith('match-xyz');
  });

  it('skips a match that fails persistence and continues with later matches', async () => {
    jest.useFakeTimers();
    const failedResponse = makeMatchResponse();
    failedResponse.data.id = 'match-save-failed';
    const successfulResponse = makeMatchResponse();
    successfulResponse.data.id = 'match-saved';
    successfulResponse.data.attributes.createdAt = '2026-07-14T08:01:00.000Z';
    const pubgClient = {
      players: {
        getPlayerByName: jest.fn().mockResolvedValue({
          data: {
            id: 'account-player-1',
            type: 'player',
            attributes: { name: 'Player1' },
            relationships: {
              matches: {
                data: [
                  { id: 'match-save-failed', type: 'match' },
                  { id: 'match-saved', type: 'match' },
                ],
              },
            },
          },
        }),
      },
      matches: {
        getMatch: jest
          .fn()
          .mockResolvedValueOnce(failedResponse)
          .mockResolvedValueOnce(successfulResponse),
      },
    };
    (PubgClient as jest.MockedClass<typeof PubgClient>).mockImplementation(
      () => pubgClient as never
    );
    jest
      .spyOn(PlayerRepository.prototype, 'getAllPlayers')
      .mockResolvedValue([{ id: 1, pubgId: 'account-player-1', name: 'Player1' } as never]);
    jest.spyOn(PlayerRepository.prototype, 'savePlayer').mockResolvedValue({} as never);
    jest.spyOn(ProcessedMatchRepository.prototype, 'getProcessedMatches').mockResolvedValue([]);
    const addProcessedMatch = jest
      .spyOn(ProcessedMatchRepository.prototype, 'addProcessedMatch')
      .mockResolvedValue();
    const saveMatch = jest
      .spyOn(MatchRepository.prototype, 'saveMatch')
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce();
    const discordBot = {
      sendMatchSummary: jest.fn().mockResolvedValue(undefined),
    };
    const service = new MatchMonitorService(discordBot as never, 'api-key');

    const check = service.checkNow();
    await jest.runAllTimersAsync();
    await check;

    expect(pubgClient.matches.getMatch).toHaveBeenCalledTimes(2);
    expect(saveMatch).toHaveBeenCalledTimes(2);
    expect(discordBot.sendMatchSummary).toHaveBeenCalledTimes(1);
    expect(discordBot.sendMatchSummary).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ matchId: 'match-saved' })
    );
    expect(addProcessedMatch).toHaveBeenCalledTimes(1);
    expect(addProcessedMatch).toHaveBeenCalledWith('match-saved');
  });

  it('retries an unprocessed match after marker failure with one fetch per cycle', async () => {
    let processed = false;
    const pubgClient = {
      players: {
        getPlayerByName: jest.fn().mockResolvedValue({
          data: {
            id: 'account-player-1',
            type: 'player',
            attributes: { name: 'Player1' },
            relationships: { matches: { data: [{ id: 'match-xyz', type: 'match' }] } },
          },
        }),
      },
      matches: { getMatch: jest.fn().mockResolvedValue(makeMatchResponse()) },
    };
    (PubgClient as jest.MockedClass<typeof PubgClient>).mockImplementation(
      () => pubgClient as never
    );
    jest
      .spyOn(PlayerRepository.prototype, 'getAllPlayers')
      .mockResolvedValue([{ id: 1, pubgId: 'account-player-1', name: 'Player1' } as never]);
    jest.spyOn(PlayerRepository.prototype, 'savePlayer').mockResolvedValue({} as never);
    jest
      .spyOn(ProcessedMatchRepository.prototype, 'getProcessedMatches')
      .mockImplementation(async () => (processed ? ['match-xyz'] : []));
    const addProcessedMatch = jest
      .spyOn(ProcessedMatchRepository.prototype, 'addProcessedMatch')
      .mockRejectedValueOnce(new Error('marker unavailable'))
      .mockImplementationOnce(async () => {
        processed = true;
      });
    const saveMatch = jest.spyOn(MatchRepository.prototype, 'saveMatch').mockResolvedValue();
    const discordBot = {
      sendMatchSummary: jest.fn().mockResolvedValue(undefined),
    };
    const service = new MatchMonitorService(discordBot as never, 'api-key');

    await service.checkNow();

    expect(processed).toBe(false);
    expect(addProcessedMatch).toHaveBeenCalledTimes(1);

    await service.checkNow();

    expect(processed).toBe(true);
    expect(pubgClient.matches.getMatch).toHaveBeenCalledTimes(2);
    expect(saveMatch).toHaveBeenCalledTimes(2);
    expect(discordBot.sendMatchSummary).toHaveBeenCalledTimes(2);
    expect(addProcessedMatch).toHaveBeenCalledTimes(2);
  });

  it('fails startup when Discord channel access validation fails', async () => {
    const validationError = new Error('missing ViewChannel');
    const getAllPlayersSpy = jest
      .spyOn(PlayerRepository.prototype, 'getAllPlayers')
      .mockResolvedValue([]);
    const discordBot = {
      validateChannelAccess: jest.fn().mockRejectedValue(validationError),
    };

    const service = new MatchMonitorService(discordBot as unknown as DiscordBotService, 'api-key');

    await expect(service.startMonitoring()).rejects.toThrow('missing ViewChannel');
    expect(discordBot.validateChannelAccess).toHaveBeenCalledTimes(1);
    expect(getAllPlayersSpy).not.toHaveBeenCalled();
    getAllPlayersSpy.mockRestore();
  });
});
