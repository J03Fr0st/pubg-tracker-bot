import { PlayersResponse } from '../types/pubg-player-api.types';
import { PubgApiService } from './pubg-api.service';
import { PubgStorageService } from './pubg-storage.service';
import { DiscordBotService } from './discord-bot.service';
import { DiscordMatchGroupSummary, DiscordPlayerMatchStats } from '../types/discord-match-summary.types';
import { MatchMonitorPlayer, MatchMonitorPlayerMatchInfo, MatchMonitorMatch, MatchMonitorMatchGroup } from '../types/match-monitor.types';

export class MatchMonitorService {
    private readonly CHECK_INTERVAL = 60000; // 1 minute
    private readonly channelId: string = process.env.DISCORD_CHANNEL_ID || '';

    constructor(
        private readonly pubgApi: PubgApiService,
        private readonly storage: PubgStorageService,
        private readonly discordBot: DiscordBotService,
    ) {}

    public async startMonitoring(): Promise<void> {
        console.log('Match monitoring started');
        while (true) {
            if (this.channelId === '') {
                console.error('DISCORD_CHANNEL_ID is not set');
                return;
            }

            try {
                await this.checkNewMatches();
            } catch (error) {
                console.error('Error during match check:', error);
            }
            await this.delay(this.CHECK_INTERVAL);
        }
    }

    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async checkNewMatches(): Promise<void> {
        console.log('Starting new match check cycle...');
        const players = await this.storage.getAllPlayers();
        console.log(`Found ${players.length} players to monitor`);
        
        if (players.length === 0) {
            console.log('No players to monitor, skipping check');
            return;
        }

        const playerNames = players.map(player => player.name);
        console.log('Fetching stats for players:', playerNames.join(', '));
        const playersResponse = await this.pubgApi.getStatsForPlayers(playerNames);

        // Create a Set to store unique match IDs with their timestamps
        const uniqueMatches = new Map<string, { createdAt: Date; players: MatchMonitorPlayer[] }>();
        
        for (const player of playersResponse.data) {
            const matches = player.relationships.matches.data.slice(0, 15);
            
            for (const match of matches) {
                const matchDetails = await this.pubgApi.getMatchDetails(match.id);
                const createdAt = new Date(matchDetails.data.attributes.createdAt);

                if (!uniqueMatches.has(match.id)) {
                    uniqueMatches.set(match.id, {
                        createdAt,
                        players: [{ id: player.id, name: player.attributes.name }]
                    });
                } else {
                    const existingMatch = uniqueMatches.get(match.id);
                    if (existingMatch) {
                        existingMatch.players.push({ id: player.id, name: player.attributes.name });
                    }
                }
            }
        }

        const processedMatches = await this.storage.getProcessedMatches();
        console.log(`Retrieved ${processedMatches.length} previously processed matches`);

        // Convert to array, filter processed matches, and sort chronologically
        const newMatches: MatchMonitorMatchGroup[] = Array.from(uniqueMatches.entries())
            .filter(([matchId]) => !processedMatches.includes(matchId))
            .sort(([, a], [, b]) => a.createdAt.getTime() - b.createdAt.getTime())
            .map(([matchId, matchData]) => ({
                matchId,
                players: matchData.players
            }));

        console.log(`Found ${newMatches.length} new matches to process`);

        for (const match of newMatches) {
            console.log(`Processing match ${match.matchId} with ${match.players.length} monitored players`);
            
            // Log the match timestamp
            const matchDetails = await this.pubgApi.getMatchDetails(match.matchId);
            console.log(`Match ${match.matchId} played at: ${matchDetails.data.attributes.createdAt}`);

            const summary = await this.createMatchSummary(match);
            if (summary) {
                console.log(`Sending match summary to Discord for match ${match.matchId}`);
                await this.discordBot.sendMatchSummary(this.channelId, summary);
                await this.storage.addProcessedMatch(match.matchId);
                console.log(`Match ${match.matchId} processed successfully`);
            } else {
                console.log(`Failed to create summary for match ${match.matchId}`);
            }
        }
        
        console.log('Match check cycle completed');
    }

    private async createMatchSummary(match: MatchMonitorMatchGroup): Promise<DiscordMatchGroupSummary | null> {
        console.log(`Fetching details for match ${match.matchId}`);
        const matchDetails = await this.pubgApi.getMatchDetails(match.matchId);
        
        console.log('Saving match details to storage');
        const savedMatch = await this.storage.saveMatch(matchDetails);        
        if (!savedMatch) {
            console.error(`Failed to save match ${match.matchId}`);
            return null;
        }

        console.log('Creating match summary');
        const playerStats: DiscordPlayerMatchStats[] = [];
        let teamRank: number | undefined;

        const globalUniquePlayers = new Set<string>(); // Global set to track all processed players

        for (const player of match.players) {
            const currentPlayerStats = savedMatch.participants.find(p => p.name === player.name);
            if (!currentPlayerStats) {
                console.log(`No stats found for player ${player.name}`);
                continue;
            }
            if (teamRank === undefined) {
                teamRank = currentPlayerStats.stats.winPlace;
            } else if (teamRank !== currentPlayerStats.stats.winPlace) {
                teamRank = undefined;
            }

            // Find all players in the same roster as the current player
            const roster = savedMatch.rosters.find(r => r.participantNames.some(p => p === player.name));
            if (roster) {
                const filteredParticipants = savedMatch.participants.filter(participant => roster.participantNames.includes(participant.name));
                
                filteredParticipants.forEach(participant => {
                    if (!globalUniquePlayers.has(participant.name)) {
                        playerStats.push({
                            name: participant.name,
                            stats: participant.stats
                        });
                        globalUniquePlayers.add(participant.name); // Add to global set
                    }
                });
            }
        }

        return {
            matchId: match.matchId,
            mapName: savedMatch.mapName,
            gameMode: savedMatch.gameMode,
            playedAt: savedMatch.createdAt.toISOString(),
            players: playerStats,
            teamRank,
            telemetryUrl: savedMatch.telemetryUrl
        };
    }
}