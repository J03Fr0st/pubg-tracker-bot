import { PubgApiService } from "../../../services/pubg-api.service";
import { config } from "dotenv";

// Load environment variables for tests
config();

describe("PubgApiService Integration Tests", () => {
  let pubgApiService: PubgApiService;

  beforeAll(() => {
    const apiKey = process.env.PUBG_API_KEY;
    if (!apiKey) {
      throw new Error(
        "PUBG_API_KEY environment variable is required for integration tests"
      );
    }
    pubgApiService = new PubgApiService(apiKey);
    jest.setTimeout(120000);
  }, 20000); // Increase timeout to 10 seconds

  // Add a delay between tests to respect rate limiting
  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 6000)); // 6 second delay
  }, 20000); // Increase timeout to 10 seconds

  describe("getPlayer", () => {
    it("should fetch player data from PUBG API", async () => {
      // Using a known PUBG player for testing
      const playerName = process.env.PUBG_TEST_PLAYER_NAME || "J03Fr0st";

      const result = await pubgApiService.getPlayer(playerName);

      expect(result).toBeDefined();
      expect(result.data).toBeInstanceOf(Array);
      expect(result.data[0]).toMatchObject({
        type: "player",
        attributes: {
          name: expect.any(String),
          shardId: expect.any(String),
        },
      });
    }, 20000); // Increase timeout to 10 seconds

    it("should handle non-existent player gracefully", async () => {
      const nonExistentPlayer = "thisplayershouldnotexist12345678";

      await expect(
        pubgApiService.getPlayer(nonExistentPlayer)
      ).rejects.toThrow();
    }, 20000); // Increase timeout to 10 seconds
  });

  describe("getPlayerStats", () => {
    it("should fetch player stats from PUBG API", async () => {
      // First get a real player ID
      const playerName = process.env.PUBG_TEST_PLAYER_NAME || "J03Fr0st";
      const result = await pubgApiService.getStatsForPlayers([playerName]);

      expect(result).toBeDefined();
    }, 20000); // Increase timeout to 10 seconds

    it("should handle invalid player ID gracefully", async () => {
      const invalidPlayerId = "invalid-player-id";

      await expect(
        pubgApiService.getStatsForPlayers([invalidPlayerId])
      ).rejects.toThrow();
    });
  });  

  describe("getMatchDetails", () => {
    it("should retrieve match details for a valid match ID", async () => {
      // Arrange
      const playerName = process.env.PUBG_TEST_PLAYER_NAME || "J03Fr0st";
      const playerResponse = await pubgApiService.getPlayer(playerName);
      const matchId = playerResponse.data[0].relationships.matches.data[0].id;

      // Act
      const matchDetails = await pubgApiService.getMatchDetails(matchId);

      // Assert
      expect(matchDetails).toBeDefined();
      expect(matchDetails.data).toBeDefined();
      expect(matchDetails.data.id).toBe(matchId);
      expect(matchDetails.data.attributes).toBeDefined();
      expect(matchDetails.data.attributes.gameMode).toBeDefined();
      expect(matchDetails.data.attributes.duration).toBeGreaterThan(0);
    });

    it("should throw an error for invalid match ID", async () => {
      // Arrange
      const invalidMatchId = "invalid-match-id";

      // Act & Assert
      await expect(
        pubgApiService.getMatchDetails(invalidMatchId)
      ).rejects.toThrow("PUBG API Error");
    });
  });
});
