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
        setInterval(async () => {

            if (this.channelId === '') {
                console.error('DISCORD_CHANNEL_ID is not set');
                return;
            }

            await this.checkNewMatches();
        }, this.CHECK_INTERVAL);
    }

    private async checkNewMatches(): Promise<void> {
        const players = await this.storage.getAllPlayers();
        if (players.length === 0) {
            return;
        }

        const playerNames = players.map(player => player.name);
        const playersResponse = await this.pubgApi.getStatsForPlayers(playerNames);

        let newPlayerMatches: MatchMonitorPlayerMatchInfo[] = [];
        for (const player of playersResponse.data) {
            await this.storage.addPlayer(player);
            const matches = player.relationships.matches.data.slice(0, 5).map(match => ({ id: match.id }));
            newPlayerMatches.push({ player: { id: player.id, name: player.attributes.name }, matches });
        }

        const processedMatches = await this.storage.getProcessedMatches();
        const newMatches = this.findNewMatches(newPlayerMatches, processedMatches);

        for (const match of newMatches) {
            const summary = await this.createMatchSummary(match);
            if (summary) {
                await this.discordBot.sendMatchSummary(this.channelId,summary);
                await this.storage.addProcessedMatch(match.matchId);
        }
    }
}

    private findNewMatches(playerMatches: MatchMonitorPlayerMatchInfo[], processedMatches: string[]): MatchMonitorMatchGroup[] {
        const matchGroups: Map<string, MatchMonitorMatchGroup> = new Map();

        for (const { player, matches } of playerMatches) {
            for (const match of matches) {
                if (processedMatches.includes(match.id)) {
                    continue;
                }

                if (!matchGroups.has(match.id)) {
                    matchGroups.set(match.id, {
                        matchId: match.id,
                        players: [],
                    });
                }

                const group = matchGroups.get(match.id)!;
                group.players.push(player);
            }
        }

        return Array.from(matchGroups.values());
    }

    private async createMatchSummary(match: MatchMonitorMatchGroup): Promise<DiscordMatchGroupSummary | null> {
        const matchDetails = await this.pubgApi.getMatchDetails(match.matchId);
        var savedMatch = await this.storage.saveMatch(matchDetails);        
        if (!savedMatch) {
           return null;
        }
        const playerStats: DiscordPlayerMatchStats[] = [];
        let teamRank: number | undefined;

        for (const player of match.players) {
            const currentPlayerStats = savedMatch?.participants.find(p => p.pubgId === player.id);
            if (!currentPlayerStats) {
                continue;
            }
            if (teamRank === undefined) {
                teamRank = currentPlayerStats.stats.winPlace;
            } else if (teamRank !== currentPlayerStats.stats.winPlace) {
                teamRank = undefined;
            }

            playerStats.push({
                name: player.name,
                stats: currentPlayerStats.stats
            });
        }

        return {
            matchId: match.matchId,
            mapName: savedMatch.mapName,
            gameMode: savedMatch.gameMode,
            playedAt: savedMatch.createdAt.toISOString(),
            players: playerStats,
            teamRank
        };
    }
}