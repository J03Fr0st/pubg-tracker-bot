import { PubgApiService } from './pubg-api.service';
import { PubgStorageService } from './pubg-storage.service';
import { DiscordBotService } from './discord-bot.service';
import { MatchGroupSummary, PlayerMatchStats } from '../types/discord-match-summary.types';

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
        const playerMatches = await Promise.all(
            players.map(async (player) => {
                const matches = await this.pubgApi.getPlayerMatches(player.id);
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

    private async createMatchSummary(match: MatchGroup): Promise<MatchGroupSummary> {
        const matchDetails = await this.pubgApi.getMatch(match.matchId);
        const playerStats: PlayerMatchStats[] = [];
        let teamRank: number | undefined;

        for (const player of match.players) {
            const stats = matchDetails.participants.find(p => p.id === player.id)!;
            
            // If all players are in the same team, use their team rank
            if (teamRank === undefined) {
                teamRank = stats.winPlace;
            } else if (teamRank !== stats.winPlace) {
                teamRank = undefined; // Players were in different teams
            }

            playerStats.push({
                name: player.name,
                stats: {
                    rank: stats.rank,
                    kills: stats.kills,
                    damageDealt: stats.damageDealt,
                    timeSurvived: stats.timeSurvived,
                    headshotKills: stats.headshotKills,
                    assists: stats.assists,
                    boosts: stats.boosts,
                    heals: stats.heals,
                    killPlace: stats.killPlace,
                    longestKill: stats.longestKill,
                    revives: stats.revives,
                    walkDistance: stats.walkDistance,
                    weaponsAcquired: stats.weaponsAcquired,
                    winPlace: stats.winPlace
                },
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