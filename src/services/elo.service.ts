import { EloRepository, type UpsertRatingData } from '../data/repositories/elo.repository';

const DEFAULT_RATING = 1500;
const K_FACTOR_NEW = 40;
const K_FACTOR_ESTABLISHED = 20;
const CALIBRATION_GAMES = 20;

export interface RatingChange {
  newRating: number;
  change: number;
}

export interface PlayerRatingResult {
  rating: number;
  change: number;
}

export interface RosterData {
  rank: number;
  participantAccountIds: string[];
}

export class EloService {
  private readonly repository: EloRepository;

  constructor(repository?: EloRepository) {
    this.repository = repository ?? new EloRepository();
  }

  public calculateActualScore(placement: number, totalTeams: number): number {
    if (totalTeams <= 1) return 1.0;
    return (totalTeams - placement) / (totalTeams - 1);
  }

  public calculateExpectedScore(playerRating: number, avgRating: number): number {
    return 1 / (1 + Math.pow(10, (avgRating - playerRating) / 400));
  }

  public calculateRatingChange(
    currentRating: number,
    gamesPlayed: number,
    placement: number,
    totalTeams: number,
    avgRating: number
  ): RatingChange {
    const k = gamesPlayed < CALIBRATION_GAMES ? K_FACTOR_NEW : K_FACTOR_ESTABLISHED;
    const actualScore = this.calculateActualScore(placement, totalTeams);
    const expectedScore = this.calculateExpectedScore(currentRating, avgRating);
    const change = k * (actualScore - expectedScore);
    const newRating = Math.round((currentRating + change) * 10) / 10;

    return {
      newRating,
      change: Math.round(change * 10) / 10,
    };
  }

  public async processMatchRatings(
    rosters: RosterData[],
    platform: string,
    modeKey: string
  ): Promise<Map<string, PlayerRatingResult>> {
    const allAccountIds = rosters.flatMap((r) => r.participantAccountIds);
    const totalTeams = rosters.length;

    // Batch-fetch existing ratings
    const existingRatings = await this.repository.findRatingsByAccountIds(
      allAccountIds,
      platform,
      modeKey
    );

    // Build lookup map: accountId -> { rating, gamesPlayed }
    const ratingMap = new Map<string, { rating: number; gamesPlayed: number }>();
    for (const r of existingRatings) {
      ratingMap.set(r.accountId, { rating: r.rating, gamesPlayed: r.gamesPlayed });
    }

    // Default rating for unknown players
    for (const id of allAccountIds) {
      if (!ratingMap.has(id)) {
        ratingMap.set(id, { rating: DEFAULT_RATING, gamesPlayed: 0 });
      }
    }

    // Calculate average rating across all participants
    let totalRating = 0;
    for (const { rating } of ratingMap.values()) {
      totalRating += rating;
    }
    const avgRating = totalRating / ratingMap.size;

    // Compute deltas per roster
    const results = new Map<string, PlayerRatingResult>();
    const upserts: UpsertRatingData[] = [];

    for (const roster of rosters) {
      for (const accountId of roster.participantAccountIds) {
        const current = ratingMap.get(accountId)!;
        const { newRating, change } = this.calculateRatingChange(
          current.rating,
          current.gamesPlayed,
          roster.rank,
          totalTeams,
          avgRating
        );

        results.set(accountId, { rating: newRating, change });
        upserts.push({
          platform,
          accountId,
          modeKey,
          rating: newRating,
          gamesPlayed: current.gamesPlayed + 1,
        });
      }
    }

    // Upsert all ratings in one transaction
    await this.repository.upsertRatings(upserts);

    return results;
  }

  public async getPlayerRating(
    accountId: string,
    platform: string,
    modeKey: string
  ): Promise<{ rating: number; gamesPlayed: number } | null> {
    const result = await this.repository.getPlayerRating(accountId, platform, modeKey);
    if (!result) return null;
    return { rating: result.rating, gamesPlayed: result.gamesPlayed };
  }
}
