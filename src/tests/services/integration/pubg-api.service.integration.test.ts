import { PubgApiService } from "../../../services/pubg-api.service";
import { config } from "dotenv";
import mongoose from 'mongoose';

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

    try {
      const mongoUri = process.env.MONGODB_URI;
      if (!mongoUri) {
        throw new Error("MONGODB_URI environment variable is required for integration tests");
      }
      mongoose.connect(`${mongoUri}`);
      console.log('Connected to MongoDB Test Database');
    } catch (error) {
      console.error('Error connecting to MongoDB Test Database:', error);
      process.exit(1);
    }

    jest.setTimeout(120000);
  }, 20000);

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 6000));
  }, 20000);

  describe("getPlayer", () => {
    it("should fetch player data from PUBG API", async () => {
      // Arrange
      const playerName = process.env.PUBG_TEST_PLAYER_NAME || "J03Fr0st";

      // Act
      const playerData = await pubgApiService.getPlayer(playerName);

      // Assert
      expect(playerData).toBeDefined();
      expect(playerData.data).toBeInstanceOf(Array);
      expect(playerData.data[0]).toMatchObject({
        type: "player",
        attributes: {
          name: expect.any(String),
          shardId: expect.any(String),
        },
      });
    }, 20000);

    it("should handle non-existent player gracefully", async () => {
      // Arrange
      const nonExistentPlayer = "thisplayershouldnotexist12345678";

      // Act & Assert
      await expect(
        pubgApiService.getPlayer(nonExistentPlayer)
      ).rejects.toThrow();
    }, 20000);
  });

  describe("getPlayerStats", () => {
    it("should fetch player stats from PUBG API", async () => {
      // Arrange
      const playerName = process.env.PUBG_TEST_PLAYER_NAME || "J03Fr0st";

      // Act
      const playerStats = await pubgApiService.getStatsForPlayers([playerName]);

      // Assert
      expect(playerStats).toBeDefined();
    }, 20000);

    it("should handle invalid player ID gracefully", async () => {
      // Arrange
      const invalidPlayerId = "invalid-player-id";

      // Act & Assert
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
