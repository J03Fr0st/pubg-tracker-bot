import { ProcessedMatch } from '../models/processed-match.model';

export class ProcessedMatchRepository {
    /**
     * Retrieves all processed match IDs
     */
    public async getProcessedMatches(): Promise<string[]> {
        const matches = await ProcessedMatch.find().select('matchId').lean();
        return matches.map(m => m.matchId);
    }

    /**
     * Adds a new processed match ID
     */
    public async addProcessedMatch(matchId: string): Promise<void> {
        await ProcessedMatch.create({ matchId });
    }
}