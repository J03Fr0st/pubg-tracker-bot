import { PubgApiService } from './pubg-api.service';
import { PubgStorageService } from './pubg-storage.service';
import { DiscordBotService } from './discord-bot.service';
import { DiscordMatchGroupSummary, DiscordPlayerMatchStats } from '../types/discord-match-summary.types';
import { MatchMonitorPlayer, MatchMonitorMatchGroup } from '../types/match-monitor.types';
import { MatchesResponse, MatchData, Participant, Roster, Asset } from '../types/pubg-matches-api.types';
import { appConfig } from '../config/config';
import { monitor, warn, error, info, success } from '../utils/logger';

export class MatchMonitorService {
    private readonly checkInterval: number;
    private readonly channelId: string;
    private readonly maxMatchesToProcess: number;
    private isRunning: boolean = false;
    private shouldStop: boolean = false;

    constructor(
        private readonly pubgApi: PubgApiService,
        private readonly storage: PubgStorageService,
        private readonly discordBot: DiscordBotService,
    ) {
        this.checkInterval = appConfig.monitoring.checkIntervalMs;
        this.channelId = appConfig.discord.channelId;
        this.maxMatchesToProcess = appConfig.monitoring.maxMatchesToProcess;

        monitor(`Match monitor configured with: checkInterval=${this.checkInterval}ms, maxMatches=${this.maxMatchesToProcess}`);
    }

    /**
     * Starts the match monitoring process
     * @returns A promise that resolves when monitoring stops
     */
    public async startMonitoring(): Promise<void> {
        if (this.isRunning) {
            warn('Match monitoring is already running');
            return;
        }

        if (this.channelId === '') {
            error('DISCORD_CHANNEL_ID is not set');
            return;
        }

        monitor('Match monitoring started');
        this.isRunning = true;
        this.shouldStop = false;

        try {
            while (!this.shouldStop) {
                const startTime = Date.now();

                try {
                    await this.checkNewMatches();
                } catch (err) {
                    error('Error during match check:', err as Error);
                    // Add a short delay after errors to prevent rapid retries
                    await this.delay(5000);
                }

                // Calculate time spent and adjust delay to maintain consistent interval
                const elapsedTime = Date.now() - startTime;
                const delayTime = Math.max(0, this.checkInterval - elapsedTime);

                if (!this.shouldStop) {
                    await this.delay(delayTime);
                }
            }
        } finally {
            this.isRunning = false;
            monitor('Match monitoring stopped');
        }
    }

    /**
     * Stops the match monitoring process
     */
    public stopMonitoring(): void {
        if (!this.isRunning) {
            warn('Match monitoring is not running');
            return;
        }

        monitor('Stopping match monitoring...');
        this.shouldStop = true;
    }

    /**
     * Delays execution for the specified time
     * @param ms Time to delay in milliseconds
     * @returns A promise that resolves after the delay
     */
    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async checkNewMatches(): Promise<void> {
        monitor('Starting new match check cycle...');
        const players = await this.storage.getAllPlayers();
        monitor(`Found ${players.length} players to monitor`);

        if (players.length === 0) {
            info('No players to monitor, skipping check');
            return;
        }

        const playerNames = players.map(player => player.name);
        monitor('Fetching stats for players:', playerNames.join(', '));
        const playersResponse = await this.pubgApi.getStatsForPlayers(playerNames);

        // Create a Set to store unique match IDs with their timestamps
        const uniqueMatches = new Map<string, { createdAt: Date; players: MatchMonitorPlayer[] }>();

        for (const player of playersResponse.data) {
            const matches = player.relationships.matches.data.slice(0, 5);

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
        info(`Retrieved ${processedMatches.length} previously processed matches`);

        // Convert to array, filter processed matches, and sort chronologically
        const newMatches: MatchMonitorMatchGroup[] = Array.from(uniqueMatches.entries())
            .filter(([matchId]) => !processedMatches.includes(matchId))
            .sort(([, a], [, b]) => a.createdAt.getTime() - b.createdAt.getTime())
            .map(([matchId, matchData]) => ({
                matchId,
                players: matchData.players
            }));

        monitor(`Found ${newMatches.length} new matches to process`);

        for (const match of newMatches) {
            monitor(`Processing match ${match.matchId} with ${match.players.length} monitored players`);

            // Log the match timestamp
            const matchDetails = await this.pubgApi.getMatchDetails(match.matchId);
            info(`Match ${match.matchId} played at: ${matchDetails.data.attributes.createdAt}`);

            const summary = await this.createMatchSummary(match);
            if (summary) {
                monitor(`Sending match summary to Discord for match ${match.matchId}`);
                await this.discordBot.sendMatchSummary(this.channelId, summary);
                await this.storage.addProcessedMatch(match.matchId);
                success(`Match ${match.matchId} processed successfully`);
            } else {
                warn(`Failed to create summary for match ${match.matchId}`);
            }
        }

        monitor('Match check cycle completed');
    }

    private async createMatchSummary(match: MatchMonitorMatchGroup): Promise<DiscordMatchGroupSummary | null> {
        try {
            info(`Fetching details for match ${match.matchId}`);
            const matchDetails = await this.pubgApi.getMatchDetails(match.matchId);

            info('Processing match summary');
            const playerStats: DiscordPlayerMatchStats[] = [];
            let teamRank: number | undefined;

            // Extract participants and rosters from match details
            const participants = matchDetails.included.filter(
                (item): item is Participant => 
                    item.type === 'participant' && 'attributes' in item && 'stats' in item.attributes
            );

            const rosters = matchDetails.included.filter(
                (item): item is Roster => 
                    item.type === 'roster' && 
                    'relationships' in item && 
                    !!item.relationships?.participants?.data
            );

            for (const player of match.players) {
                const participant = participants.find(p => 
                    p.attributes.stats?.name === player.name
                );
                
                if (!participant) {
                    warn(`No stats found for player ${player.name}`);
                    continue;
                }


                if (teamRank === undefined) {
                    teamRank = participant.attributes.stats.winPlace;
                } else if (teamRank !== participant.attributes.stats.winPlace) {
                    teamRank = undefined;
                }

                // Find all players in the same roster as the current player
                const roster = rosters.find(r => 
                    r.relationships?.participants?.data?.some((p: { id: string }) => 
                        p.id === participant.id
                    )
                );
                
                if (roster) {
                    const rosterParticipantIds = roster.relationships?.participants?.data?.map((p: { id: string }) => p.id) || [];
                    const rosterParticipants = participants.filter(p => 
                        rosterParticipantIds.includes(p.id) && p.attributes.stats
                    );

                    for (const rosterParticipant of rosterParticipants) {
                        if (!playerStats.some(p => p.name === rosterParticipant.attributes.stats.name)) {
                            playerStats.push({
                                name: rosterParticipant.attributes.stats.name,
                                stats: rosterParticipant.attributes.stats
                            });
                        }
                    }
                } else {
                    // If no roster found, just add the current player
                    playerStats.push({
                        name: participant.attributes.stats.name,
                        stats: participant.attributes.stats
                    });
                }
            }

            // Get telemetry URL from assets
            const telemetryAsset = matchDetails.included.find(
                (item): item is Asset => 
                    item.type === 'asset' && 'attributes' in item && 'URL' in item.attributes
            );

            // Get the telemetry URL from the asset
            const telemetryUrl = telemetryAsset?.attributes.URL || '';

            return {
                matchId: match.matchId,
                mapName: matchDetails.data.attributes.mapName,
                gameMode: matchDetails.data.attributes.gameMode,
                playedAt: matchDetails.data.attributes.createdAt,
                players: playerStats,
                teamRank,
                telemetryUrl
            };
        } catch (err) {
            error('Error creating match summary:', err as Error);
            return null;
        }
    }
}
