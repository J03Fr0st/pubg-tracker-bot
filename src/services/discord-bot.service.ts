import { Client, Events, GatewayIntentBits, TextChannel } from 'discord.js';
import { PubgStorageService } from './pubg-storage.service';
import { PubgApiService } from './pubg-api.service';
import { PlayerMatchStats, MatchGroupSummary } from '../types/match-summary.types';

export class DiscordBotService {
    private readonly client: Client;
    private readonly prefix = '!pubg';

    constructor(
        private readonly storageService: PubgStorageService,
        private readonly pubgApiService: PubgApiService,
    ) {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
            ],
        });
        this.setupEventHandlers();
    }

    public async initialize(): Promise<void> {
        await this.client.login(process.env.DISCORD_TOKEN);
    }

    public async sendMatchSummary(channelId: string, summary: MatchGroupSummary): Promise<void> {
        const channel = await this.client.channels.fetch(channelId) as TextChannel;
        const message = this.formatMatchSummary(summary);
        await channel.send(message);
    }

    private setupEventHandlers(): void {
        this.client.on(Events.MessageCreate, async (message) => {
            if (!message.content.startsWith(this.prefix) || message.author.bot) {
                return;
            }

            const args = message.content.slice(this.prefix.length).trim().split(/ +/);
            const command = args.shift()?.toLowerCase();

            switch (command) {
                case 'add':
                    await this.handleAddPlayer(message, args);
                    break;
                case 'remove':
                    await this.handleRemovePlayer(message, args);
                    break;
                case 'list':
                    await this.handleListPlayers(message);
                    break;
            }
        });
    }

    private async handleAddPlayer(message: Message, args: string[]): Promise<void> {
        if (args.length < 1) {
            await message.reply('Please provide a PUBG player name');
            return;
        }

        const playerName = args[0];
        try {
            const player = await this.pubgApiService.getPlayer(playerName);
            await this.storageService.addPlayer({
                id: player.id,
                name: player.name,
                channelId: message.channelId,
            });
            await message.reply(`Player ${playerName} added to monitoring list`);
        } catch (error) {
            await message.reply(`Failed to add player ${playerName}: ${error.message}`);
        }
    }

    private async handleRemovePlayer(message: Message, args: string[]): Promise<void> {
        if (args.length < 1) {
            await message.reply('Please provide a PUBG player name');
            return;
        }

        const playerName = args[0];
        try {
            await this.storageService.removePlayer(playerName);
            await message.reply(`Player ${playerName} removed from monitoring list`);
        } catch (error) {
            await message.reply(`Failed to remove player ${playerName}: ${error.message}`);
        }
    }

    private async handleListPlayers(message: Message): Promise<void> {
        const players = await this.storageService.getPlayers(message.channelId);
        if (players.length === 0) {
            await message.reply('No players are being monitored in this channel');
            return;
        }

        const playerList = players.map(p => p.name).join('\n');
        await message.reply(`Monitored players:\n${playerList}`);
    }

    private formatMatchSummary(summary: MatchGroupSummary): string {
        const { mapName, gameMode, playedAt, players } = summary;
        const teamRankText = summary.teamRank ? `Team Rank: #${summary.teamRank}` : '';
        
        // Create the header with match info
        let message = [
            '```md',
            '# 🎮 New PUBG Match Summary',
            '----------------------------',
            `📍 Map: ${this.formatMapName(mapName)}`,
            `🎯 Mode: ${this.formatGameMode(gameMode)}`,
            `⏰ Played: ${new Date(playedAt).toLocaleString()}`,
            teamRankText,
            '',
            '## 👥 Player Statistics',
            '----------------------------',
        ].filter(Boolean).join('\n');

        // Add individual player stats
        players.forEach(player => {
            message += this.formatPlayerStats(player);
        });

        message += '\n```';
        return message;
    }

    private formatMapName(mapName: string): string {
        const mapNames: Record<string, string> = {
            'Baltic_Main': 'Erangel',
            'Desert_Main': 'Miramar',
            'Savage_Main': 'Sanhok',
            'DihorOtok_Main': 'Vikendi',
            'Range_Main': 'Camp Jackal',
            'Summerland_Main': 'Karakin',
            'Tiger_Main': 'Taego',
            'Kiki_Main': 'Deston',
        };
        return mapNames[mapName] || mapName;
    }

    private formatGameMode(mode: string): string {
        const modes: Record<string, string> = {
            'squad': 'Squad TPP',
            'squad-fpp': 'Squad FPP',
            'duo': 'Duo TPP',
            'duo-fpp': 'Duo FPP',
            'solo': 'Solo TPP',
            'solo-fpp': 'Solo FPP',
        };
        return modes[mode.toLowerCase()] || mode;
    }

    private formatPlayerStats(player: PlayerMatchStats): string {
        const { stats } = player;
        const survivalMinutes = Math.round(stats.timeSurvived / 60);
        const kmWalked = (stats.walkDistance / 1000).toFixed(1);
        const accuracy = stats.kills > 0 && stats.headshotKills > 0 
            ? ((stats.headshotKills / stats.kills) * 100).toFixed(1) 
            : '0';

        return [
            '',
            `### ${player.name}`,
            '```yaml',
            `Position: #${stats.winPlace}`,
            `Kills: ${stats.kills} (${stats.headshotKills} headshots)`,
            `Damage: ${Math.round(stats.damageDealt)} (${stats.assists} assists)`,
            `Survival: ${survivalMinutes}min`,
            '',
            `Longest Kill: ${Math.round(stats.longestKill)}m`,
            `Distance: ${kmWalked}km`,
            `Headshot %: ${accuracy}%`,
            `Heals/Boosts: ${stats.heals}/${stats.boosts}`,
            `Weapons: ${stats.weaponsAcquired}`,
            stats.revives > 0 ? `Revives: ${stats.revives}` : '',
            '```',
        ].filter(Boolean).join('\n');
    }
} 