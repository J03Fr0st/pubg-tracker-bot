import { PubgApiService } from '../../services/pubg-api.service';
import { config } from 'dotenv';

// Load environment variables for tests
config();

describe('PubgApiService Integration Tests', () => {  
  let pubgApiService: PubgApiService;
  
  beforeAll(() => {
    const apiKey = process.env.PUBG_API_KEY;
    if (!apiKey) {
      throw new Error('PUBG_API_KEY environment variable is required for integration tests');
    }
    pubgApiService = new PubgApiService(apiKey);
    jest.setTimeout(60000);
  }, 10000); // Increase timeout to 10 seconds

  describe('getPlayer', () => {    
    it('should fetch player data from PUBG API', async () => {
      // Using a known PUBG player for testing
      const playerName = 'J03Fr0st';
      
      const result = await pubgApiService.getPlayer(playerName);
      
      expect(result).toBeDefined();
      expect(result.data).toBeInstanceOf(Array);
      expect(result.data[0]).toMatchObject({
        type: 'player',
        attributes: {
          name: expect.any(String),
          shardId: expect.any(String)
        }
      });
    }, 10000); // Increase timeout to 10 seconds

    it('should handle non-existent player gracefully', async () => {
      const nonExistentPlayer = 'thisplayershouldnotexist12345678';
      
      await expect(pubgApiService.getPlayer(nonExistentPlayer))
        .rejects
        .toThrow();
    }, 10000); // Increase timeout to 10 seconds
  });

  describe('getPlayerStats', () => {
    it('should fetch player stats from PUBG API', async () => {
      // First get a real player ID
      const playerName = 'J03Fr0st';
      const playerData = await pubgApiService.getPlayer(playerName);
      const playerId = playerData.data[0].id;
      
      const result = await pubgApiService.getPlayerStats(playerId);
      
      expect(result).toBeDefined();
      expect(result.data).toMatchObject({
        type: 'playerSeason',
        attributes: {
          gameModeStats: expect.any(Object)
        }
      });
    });

    it('should handle invalid player ID gracefully', async () => {
      const invalidPlayerId = 'invalid-player-id';
      
      await expect(pubgApiService.getPlayerStats(invalidPlayerId))
        .rejects
        .toThrow();
    });
  });

  // Add a delay between tests to respect rate limiting
  afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 6000)); // 6 second delay
  }, 10000); // Increase timeout to 10 seconds
}); 