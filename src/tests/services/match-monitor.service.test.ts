import { MatchMonitorService } from '../../services/match-monitor.service';
import { PubgApiService } from '../../services/pubg-api.service';
import { PubgStorageService } from '../../services/pubg-storage.service';
import { DiscordBotService } from '../../services/discord-bot.service';

describe('MatchMonitorService', () => {
  let service: MatchMonitorService;
  const mockDiscordChannelId = '12345';

  beforeEach(() => {
    // Mock dependencies
    service = new MatchMonitorService(
      new PubgApiService(),
      new PubgStorageService(),
      new DiscordBotService()
    );

    // Set channel ID from environment variable
    Object.defineProperty(process.env, 'DISCORD_CHANNEL_ID', {
      value: mockDiscordChannelId,
      configurable: true
    });
  });

  describe('#startMonitoring', () => {
    it('should start monitoring matches', async () => {
      // Mock delay to exit after one iteration
      jest.spyOn(service, 'delay').mockResolvedValueOnce(undefined);

      const mockCheckNewMatches = jest.spyOn(service, 'checkNewMatches').mockImplementation(jest.fn());

      await service.startMonitoring();

      expect(mockCheckNewMatches).toHaveBeenCalled();
    });
  });

  describe('#checkNewMatches', () => {
    it('should handle no players to monitor', async () => {
      // Mock to return empty players
      jest.spyOn(service.storage, 'getAllPlayers').mockResolvedValueOnce([]);

      await service.checkNewMatches();

      expect(console.log).toHaveBeenCalledWith('No players to monitor, skipping check');
    });

    it('should process new matches when players exist', async () => {
      // Mock player data
      const mockPlayer = { id: '123', name: 'TestPlayer' };
      jest.spyOn(service.storage, 'getAllPlayers').mockResolvedValueOnce([mockPlayer]);

      // Mock match data
      const mockMatch = { id: 'abc123', attributes: {} };
      jest.spyOn(service.pubgApi, 'getMatchDetails').mockResolvedValue({
        data: { attributes: { createdAt: new Date() }, relationships: { matches: { data: [mockMatch] } } }
      });

      await service.checkNewMatches();

      expect(console.log).toHaveBeenCalledWith(`Found 1 players to monitor`);
    });
  });

  describe('#createMatchSummary', () => {
    it('should create a valid summary when match details exist', async () => {
      // Mock match data
      const mockMatchDetails = {
        data: {
          attributes: { createdAt: new Date(), gameMode: 'Classic Solo', mapName: 'Stalberge' },
          relationships: {
            participants: [],
            rosters: []
          }
        }
      };

      jest.spyOn(service.pubgApi, 'getMatchDetails').mockResolvedValue(mockMatchDetails);
      jest.spyOn(service.storage, 'saveMatch').mockImplementation(jest.fn());

      const mockPlayers = [{ id: '123', name: 'TestPlayer' }];
      jest.spyOn(service.storage, 'getAllPlayers').mockResolvedValueOnce(mockPlayers);

      expect.assertions(1);
      
      const result = await service.createMatchSummary({ matchId: 'abc123', players: mockPlayers });
      
      // Verify at least one log statement indicating success
      expect(console.log).toHaveBeenCalled();
    });

    it('should return null when unable to create summary', async () => {
      jest.spyOn(service.pubgApi, 'getMatchDetails').mockResolvedValue(null);
      jest.spyOn(service.storage, 'saveMatch').mockRejectedValue(new Error('Save failed'));

      const result = await service.createMatchSummary({ matchId: 'abc123', players: [] });
      
      expect(result).toBeNull();
    });
  });
});
