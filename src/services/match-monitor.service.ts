import { PubgApiService } from './pubg-api.service';
import { PubgStorageService } from './pubg-storage.service';
import { DiscordBotService } from './discord-bot.service';
import { DiscordMatchGroupSummary, DiscordPlayerMatchStats } from '../types/discord-match-summary.types';
import { MatchMonitorPlayer, MatchMonitorMatchGroup } from '../types/match-monitor.types';
import { MatchesResponse, MatchData, Participant, Roster, Asset } from '../types/pubg-matches-api.types';
import { appConfig } from '../config/config';
import { monitor, warn, error, info, success, debug } from '../utils/logger';

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
        const cycleStartTime = Date.now();
        const players = await this.storage.getAllPlayers();

        if (players.length === 0) {
            debug('No players to monitor, skipping check');
            return;
        }

        const playerNames = players.map(player => player.name);
        
        const playersResponse = await this.pubgApi.getStatsForPlayers(playerNames);
        
        // Log players with their match counts
        const playerMatchInfo = playersResponse.data.map(player => {
            const matchCount = player.relationships.matches.data.length;
            return `${player.attributes.name}(${matchCount})`;
        }).join(', ');
        info(`Checking for new matches for ${players.length} players: ${playerMatchInfo}`);

        // OPTIMIZED: Collect all unique match IDs first WITHOUT fetching details
        const uniqueMatchIds = new Map<string, MatchMonitorPlayer[]>();

        for (const player of playersResponse.data) {
            const matches = player.relationships.matches.data.slice(0, 5);

            for (const match of matches) {
                if (!uniqueMatchIds.has(match.id)) {
                    uniqueMatchIds.set(match.id, [{ id: player.id, name: player.attributes.name }]);
                } else {
                    const existingPlayers = uniqueMatchIds.get(match.id)!;
                    existingPlayers.push({ id: player.id, name: player.attributes.name });
                }
            }
        }

        // Filter out already processed matches BEFORE making API calls
        const processedMatches = await this.storage.getProcessedMatches();
        debug(`Retrieved ${processedMatches.length} previously processed matches`);

        const newMatchIds = Array.from(uniqueMatchIds.keys())
            .filter(matchId => !processedMatches.includes(matchId));

        if (newMatchIds.length === 0) {
            debug('No new matches found');
            return;
        }

        monitor(`Found ${newMatchIds.length} new matches to process`);

        // OPTIMIZED: Only fetch match details for NEW matches
        const newMatches: MatchMonitorMatchGroup[] = [];
        
        for (const matchId of newMatchIds) {
            try {
                const matchDetails = await this.pubgApi.getMatchDetails(matchId);
                const createdAt = new Date(matchDetails.data.attributes.createdAt);
                
                newMatches.push({
                    matchId,
                    players: uniqueMatchIds.get(matchId)!
                });
                
                // Add small delay between API calls to avoid hitting rate limits
                if (newMatchIds.indexOf(matchId) < newMatchIds.length - 1) {
                    await this.delay(1000); // 1 second delay between match detail fetches
                }
            } catch (matchError) {
                error(`Error fetching details for match ${matchId}:`, matchError as Error);
                // Continue with other matches even if one fails
            }
        }

        // Sort matches chronologically (we'll need to get createdAt from match details now)
        // For now, process in the order we found them
        
        let processedCount = 0;
        let failedCount = 0;

        for (const match of newMatches) {
            try {
                debug(`Processing match ${match.matchId} with ${match.players.length} monitored players`);

                const summary = await this.createMatchSummary(match);
                if (summary) {
                    await this.discordBot.sendMatchSummary(this.channelId, summary);
                    await this.storage.addProcessedMatch(match.matchId);
                    processedCount++;
                    debug(`Match ${match.matchId} processed successfully`);
                } else {
                    warn(`Failed to create summary for match ${match.matchId}`);
                    failedCount++;
                }
                
                // Add small delay between matches to spread out API calls
                if (newMatches.indexOf(match) < newMatches.length - 1) {
                    await this.delay(2000); // 2 second delay between match processing
                }
            } catch (matchError) {
                error(`Error processing match ${match.matchId}:`, matchError as Error);
                failedCount++;
            }
        }

        // Summary log with performance metrics
        const cycleTime = Date.now() - cycleStartTime;
        if (processedCount > 0 || failedCount > 0) {
            success(`Match cycle completed: ${processedCount} processed, ${failedCount} failed (${cycleTime}ms)`);
        } else {
            debug(`Match cycle completed: no new matches (${cycleTime}ms)`);
        }
    }

    private async createMatchSummary(match: MatchMonitorMatchGroup): Promise<DiscordMatchGroupSummary | null> {
        try {
            debug(`Fetching details for match ${match.matchId}`);
            const matchDetails = await this.pubgApi.getMatchDetails(match.matchId);
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
