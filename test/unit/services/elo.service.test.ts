import { EloService, type RosterData } from '../../../src/services/elo.service';
import { EloRepository } from '../../../src/data/repositories/elo.repository';

jest.mock('../../../src/data/repositories/elo.repository');

describe('EloService', () => {
  let service: EloService;

  beforeEach(() => {
    service = new EloService();
  });

  describe('calculateActualScore', () => {
    it('returns 1.0 for 1st place', () => {
      expect(service.calculateActualScore(1, 20)).toBe(1.0);
    });

    it('returns 0.0 for last place', () => {
      expect(service.calculateActualScore(20, 20)).toBeCloseTo(0.0, 5);
    });

    it('returns 0.5 for middle placement in even field', () => {
      // placement 11 out of 21 => (21-11)/(21-1) = 10/20 = 0.5
      expect(service.calculateActualScore(11, 21)).toBeCloseTo(0.5, 5);
    });

    it('returns 1.0 when totalTeams is 1 (solo match edge case)', () => {
      expect(service.calculateActualScore(1, 1)).toBe(1.0);
    });
  });

  describe('calculateExpectedScore', () => {
    it('returns 0.5 when ratings are equal', () => {
      expect(service.calculateExpectedScore(1500, 1500)).toBeCloseTo(0.5, 5);
    });

    it('returns higher expected score when player is rated above average', () => {
      const expected = service.calculateExpectedScore(1700, 1500);
      expect(expected).toBeGreaterThan(0.5);
      expect(expected).toBeLessThan(1.0);
    });

    it('returns lower expected score when player is rated below average', () => {
      const expected = service.calculateExpectedScore(1300, 1500);
      expect(expected).toBeLessThan(0.5);
      expect(expected).toBeGreaterThan(0.0);
    });

    it('200 point difference gives ~0.76 expected score', () => {
      const expected = service.calculateExpectedScore(1700, 1500);
      expect(expected).toBeCloseTo(0.76, 1);
    });
  });

  describe('calculateRatingChange', () => {
    it('increases rating for 1st place finish', () => {
      const result = service.calculateRatingChange(1500, 10, 1, 20, 1500);
      expect(result.newRating).toBeGreaterThan(1500);
      expect(result.change).toBeGreaterThan(0);
    });

    it('decreases rating for last place finish', () => {
      const result = service.calculateRatingChange(1500, 10, 20, 20, 1500);
      expect(result.newRating).toBeLessThan(1500);
      expect(result.change).toBeLessThan(0);
    });

    it('uses K=40 for players with fewer than 20 games', () => {
      const newPlayer = service.calculateRatingChange(1500, 5, 1, 20, 1500);
      const vetPlayer = service.calculateRatingChange(1500, 25, 1, 20, 1500);
      // New player should gain more from same result
      expect(newPlayer.change).toBeGreaterThan(vetPlayer.change);
    });

    it('uses K=20 for players with 20+ games', () => {
      const result = service.calculateRatingChange(1500, 25, 1, 20, 1500);
      // K=20, actualScore=1.0, expectedScore=0.5 => change = 20 * 0.5 = 10
      expect(result.change).toBeCloseTo(10, 0);
    });

    it('higher-rated player gains less from a win vs avg lobby', () => {
      const highRated = service.calculateRatingChange(1800, 25, 1, 20, 1500);
      const avgRated = service.calculateRatingChange(1500, 25, 1, 20, 1500);
      expect(highRated.change).toBeLessThan(avgRated.change);
    });

    it('rounds rating to 1 decimal place', () => {
      const result = service.calculateRatingChange(1500, 10, 5, 20, 1500);
      const decimalPlaces = result.newRating.toString().split('.')[1]?.length ?? 0;
      expect(decimalPlaces).toBeLessThanOrEqual(1);
    });
  });

  describe('processMatchRatings', () => {
    let mockRepo: jest.Mocked<EloRepository>;

    beforeEach(() => {
      mockRepo = new EloRepository() as jest.Mocked<EloRepository>;
      mockRepo.findRatingsByAccountIds = jest.fn().mockResolvedValue([]);
      mockRepo.upsertRatings = jest.fn().mockResolvedValue(undefined);
      service = new EloService(mockRepo);
    });

    it('computes ratings for all participants and upserts', async () => {
      mockRepo.findRatingsByAccountIds.mockResolvedValue([
        { id: '1', platform: 'steam', accountId: 'acc-1', modeKey: 'squad-fpp', rating: 1500, gamesPlayed: 10, lastSeenAt: new Date() },
      ]);

      const rosters: RosterData[] = [
        { rank: 1, participantAccountIds: ['acc-1'] },
        { rank: 2, participantAccountIds: ['acc-2'] },
      ];

      const results = await service.processMatchRatings(rosters, 'steam', 'squad-fpp');

      expect(results.size).toBe(2);
      // 1st place should gain rating
      expect(results.get('acc-1')!.change).toBeGreaterThan(0);
      // 2nd of 2 (last) should lose rating
      expect(results.get('acc-2')!.change).toBeLessThan(0);
      expect(mockRepo.upsertRatings).toHaveBeenCalledTimes(1);
      expect(mockRepo.upsertRatings).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ accountId: 'acc-1', gamesPlayed: 11 }),
          expect.objectContaining({ accountId: 'acc-2', gamesPlayed: 1 }),
        ])
      );
    });

    it('defaults unknown players to 1500 rating', async () => {
      mockRepo.findRatingsByAccountIds.mockResolvedValue([]);

      const rosters: RosterData[] = [
        { rank: 1, participantAccountIds: ['new-player'] },
        { rank: 2, participantAccountIds: ['other-new'] },
      ];

      const results = await service.processMatchRatings(rosters, 'steam', 'squad-fpp');

      // Both start at 1500, K=40 for new players
      // Winner: 1500 + 40*(1.0-0.5) = 1520
      expect(results.get('new-player')!.rating).toBeCloseTo(1520, 0);
      // Loser: 1500 + 40*(0.0-0.5) = 1480
      expect(results.get('other-new')!.rating).toBeCloseTo(1480, 0);
    });

    it('handles squad rosters (multiple players per roster)', async () => {
      mockRepo.findRatingsByAccountIds.mockResolvedValue([]);

      const rosters: RosterData[] = [
        { rank: 1, participantAccountIds: ['p1', 'p2'] },
        { rank: 2, participantAccountIds: ['p3', 'p4'] },
      ];

      const results = await service.processMatchRatings(rosters, 'steam', 'squad-fpp');

      expect(results.size).toBe(4);
      // Both p1 and p2 should get same change (same roster rank)
      expect(results.get('p1')!.change).toBe(results.get('p2')!.change);
      expect(results.get('p3')!.change).toBe(results.get('p4')!.change);
    });
  });
});
