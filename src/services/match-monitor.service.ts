import { PubgApiService } from './pubg-api.service';
import { PubgStorageService } from './pubg-storage.service';
import { DiscordBotService } from './discord-bot.service';
import { DiscordMatchGroupSummary, DiscordPlayerMatchStats } from '../types/discord-match-summary.types';

export class MatchMonitorService {
    private readonly CHECK_INTERVAL = 60000; // 1 minute

    constructor(
        private readonly pubgApi: PubgApiService,
        private readonly storage: PubgStorageService,
        private readonly discordBot: DiscordBotService,
    ) {}

    public async startMonitoring(): Promise<void> {
        setInterval(async () => {
            await this.checkNewMatches();
        }, this.CHECK_INTERVAL);
    }

    private async checkNewMatches(): Promise<void> {
        const players = await this.storage.getAllPlayers();
        if (players.length === 0) {
            return;
        }

        const playerMatches = await Promise.all(
            players.map(async (player) => {
                const matches = await this.pubgApi.getStatsForPlayers(player.id);
                return {
                    player,
                    matches: matches.slice(0, 5), // Check last 5 matches
                };
            })
        );

        const processedMatches = await this.storage.getProcessedMatches();
        const newMatches = this.findNewMatches(playerMatches, processedMatches);

        // Group matches by matchId and channelId
        const groupedMatches = this.groupMatchesByChannel(newMatches);

        // Process each group
        for (const [channelId, matches] of groupedMatches) {
            for (const match of matches) {
                const summary = await this.createMatchSummary(match);
                await this.discordBot.sendMatchSummary(channelId, summary);
                await this.storage.addProcessedMatch(match.matchId);
            }
        }
    }

    private findNewMatches(playerMatches: PlayerMatchInfo[], processedMatches: string[]): MatchGroup[] {
        const matchGroups: Map<string, MatchGroup> = new Map();

        for (const { player, matches } of playerMatches) {
            for (const match of matches) {
                if (processedMatches.includes(match.id)) {
                    continue;
                }

                if (!matchGroups.has(match.id)) {
                    matchGroups.set(match.id, {
                        matchId: match.id,
                        channelId: player.channelId,
                        players: [],
                    });
                }

                const group = matchGroups.get(match.id)!;
                group.players.push(player);
            }
        }

        return Array.from(matchGroups.values());
    }

    private groupMatchesByChannel(matches: MatchGroup[]): Map<string, MatchGroup[]> {
        const grouped = new Map<string, MatchGroup[]>();

        for (const match of matches) {
            if (!grouped.has(match.channelId)) {
                grouped.set(match.channelId, []);
            }
            grouped.get(match.channelId)!.push(match);
        }

        return grouped;
    }

    private async createMatchSummary(match: MatchGroup): Promise<DiscordMatchGroupSummary> {
        const matchDetails = await this.pubgApi.getMatchDetails(match.matchId);
        //Save match details to database
        var savedMatch = await this.storage.saveMatch(matchDetails);        
        
        const playerStats: DiscordPlayerMatchStats[] = [];
        let teamRank: number | undefined;

        for (const player of match.players) {
            const currentPlayerStats = savedMatch?.participants.find(p => p.pubgId === player.id);
            if (!currentPlayerStats) {
                continue;
            }
            // If all players are in the same team, use their team rank
            if (teamRank === undefined) {
                teamRank = currentPlayerStats.stats.winPlace;
            } else if (teamRank !== currentPlayerStats.stats.winPlace) {
                teamRank = undefined; // Players were in different teams
            }

            playerStats.push({
                name: player.name,
                stats: currentPlayerStats.stats
            });
        }

        return {
            matchId: match.matchId,
            mapName: matchDetails.mapName,
            gameMode: matchDetails.gameMode,
            playedAt: matchDetails.playedAt,
            players: playerStats,
            teamRank
        };
    }
}

interface PlayerMatchInfo {
    player: {
        id: string;
        name: string;
        channelId: string;
    };
    matches: Array<{ id: string }>;
}

interface MatchGroup {
    matchId: string;
    channelId: string;
    players: Array<{ id: string; name: string }>;
} 