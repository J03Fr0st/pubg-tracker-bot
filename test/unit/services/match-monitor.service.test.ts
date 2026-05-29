import { PlayerRepository } from '../../../src/data/repositories/player.repository';
import { MatchMonitorService } from '../../../src/services/match-monitor.service';

jest.mock('@j03fr0st/pubg-ts', () => ({
  PubgClient: jest.fn(() => ({})),
}));

describe('MatchMonitorService', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('fails startup when Discord channel access validation fails', async () => {
    const validationError = new Error('missing ViewChannel');
    const getAllPlayersSpy = jest
      .spyOn(PlayerRepository.prototype, 'getAllPlayers')
      .mockResolvedValue([]);
    const discordBot = {
      validateChannelAccess: jest.fn().mockRejectedValue(validationError),
    };

    const service = new MatchMonitorService(discordBot as any, 'api-key' as any);

    await expect(service.startMonitoring()).rejects.toThrow('missing ViewChannel');
    expect(discordBot.validateChannelAccess).toHaveBeenCalledTimes(1);
    expect(getAllPlayersSpy).not.toHaveBeenCalled();
    getAllPlayersSpy.mockRestore();
  });
});
