import { EloService } from '../../../src/services/elo.service';

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
});
