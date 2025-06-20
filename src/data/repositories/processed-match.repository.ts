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

    /**
     * Removes the last processed match (most recently added)
     * @returns The match ID that was removed, or null if no matches exist
     */
    public async removeLastProcessedMatch(): Promise<string | null> {
        const lastMatch = await ProcessedMatch.findOne()
            .sort({ processedAt: -1 }) // Sort by processed time, newest first
            .select('matchId');
            
        if (!lastMatch) {
            return null;
        }

        await ProcessedMatch.findByIdAndDelete(lastMatch._id);
        return lastMatch.matchId;
    }

    /**
     * Gets the last processed match details
     * @returns The last processed match info or null if no matches exist
     */
    public async getLastProcessedMatch(): Promise<{ matchId: string; processedAt: Date } | null> {
        const lastMatch = await ProcessedMatch.findOne()
            .sort({ processedAt: -1 })
            .select('matchId processedAt');
            
        if (!lastMatch) {
            return null;
        }

        return {
            matchId: lastMatch.matchId,
            processedAt: lastMatch.processedAt
        };
    }
}