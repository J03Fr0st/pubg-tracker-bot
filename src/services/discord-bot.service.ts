import { Client, Events, GatewayIntentBits, TextChannel, Message, EmbedBuilder } from 'discord.js';
import { PubgApiService } from './pubg-api.service';
import { DiscordPlayerMatchStats, DiscordMatchGroupSummary } from '../types/discord-match-summary.types';
import { PubgStorageService } from './pubg-storage.service';
import { LogPlayerKillV2, LogPlayerMakeGroggy } from '../types/pubg-telemetry.types';
import { MAP_NAMES, GAME_MODES, DAMAGE_CAUSER_NAME } from '../constants/pubg-mappings';

export class DiscordBotService {
    private readonly client: Client;
    private readonly prefix = '!pubg';
    private readonly pubgStorageService: PubgStorageService;

    constructor(
        private readonly pubgApiService: PubgApiService,
    ) {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
            ],
        });
        this.pubgStorageService = new PubgStorageService();
        this.setupEventHandlers();
    }

    public async initialize(): Promise<void> {
        console.log('Initializing Discord bot...');
        await this.client.login(process.env.DISCORD_TOKEN);
    }

    public async sendMatchSummary(channelId: string, summary: DiscordMatchGroupSummary): Promise<void> {
        const channel = await this.client.channels.fetch(channelId) as TextChannel;
        if (!channel) {
            throw new Error(`Could not find channel with ID ${channelId}`);
        }
        const embeds = await this.createMatchSummaryEmbeds(summary);
        if (!embeds || !embeds.length) {
            console.error('No embeds were created for match summary');
            return;
        }
        for (const embed of embeds) {
            await channel.send({ embeds: [embed] });
        }
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
            // Save player data using storage service
            await this.pubgStorageService.addPlayer(player.data[0]);

            await message.reply(`Player ${playerName} added to monitoring list`);
        } catch (error) {
            const err = error as Error;
            await message.reply(`Failed to add player ${playerName}: ${err.message}`);
        }
    }

    private async handleRemovePlayer(message: Message, args: string[]): Promise<void> {
        if (args.length < 1) {
            await message.reply('Please provide a PUBG player name');
            return;
        }

        const playerName = args[0];
        try {
            await this.pubgStorageService.removePlayer(playerName);
            await message.reply(`Player ${playerName} removed from monitoring list`);
        } catch (error) {
            const err = error as Error;
            await message.reply(`Failed to remove player ${playerName}: ${err.message}`);
        }
    }

    private async handleListPlayers(message: Message): Promise<void> {
        const players = await this.pubgStorageService.getAllPlayers();
        if (players.length === 0) {
            await message.reply('No players are being monitored in this channel');
            return;
        }

        const playerList = players.map(p => p.name).join('\n');
        await message.reply(`Monitored players:\n${playerList}`);
    }

    private async createMatchSummaryEmbeds(
        summary: DiscordMatchGroupSummary
    ): Promise<EmbedBuilder[]> {
        const { mapName, gameMode, playedAt, players, matchId } = summary;
        const teamRankText = summary.teamRank ? `#${summary.teamRank}` : 'N/A';

        const matchDate = new Date(playedAt);
        const dateString = matchDate.toLocaleTimeString('en-ZA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Africa/Johannesburg'
        }).replace(',', '');

        const totalDamage = players.reduce((acc, player) => acc + (player.stats?.damageDealt || 0), 0);
        const totalKills = players.reduce((acc, player) => acc + (player.stats?.kills || 0), 0);
        const totalDBNOs = players.reduce((acc, player) => acc + (player.stats?.DBNOs || 0), 0);

        const mainEmbed = new EmbedBuilder()
            .setTitle(`🎮 PUBG Match Summary`)
            .setDescription([
                `⏰ **${dateString}**`,
                `🗺️ **${this.formatMapName(mapName)}** • ${this.formatGameMode(gameMode)}`,
                '',
                '**Team Performance**',
                `🏆 Placement: **${teamRankText}**`,
                `👥 Squad Size: **${players.length} players**`,
                '',
                '**Combat Summary**',                
                `⚔️ Total Kills: **${totalKills}**`,
                `🔻 Total Knocks: **${totalDBNOs}**`,
                `💥 Total Damage: **${Math.round(totalDamage)}**`
            ].join('\n'))
            .setColor(this.getPlacementColor(summary.teamRank))
            .setFooter({ text: `PUBG Match Tracker - ${matchId}`  })
            .setTimestamp(matchDate);

        const { kills, groggies } = await this.pubgApiService.fetchAndFilterLogPlayerKillV2Events(
            summary.telemetryUrl!,
            players.map(p => p.name)
        );

        const playerEmbeds = players.map(player => {
            const playerStats = this.formatPlayerStats(matchDate, summary.matchId, player, kills, groggies);
            return new EmbedBuilder()
                .setTitle(`Player: ${player.name}`)
                .setDescription(playerStats)
                .setColor(0x00AE86);
        });

        return [mainEmbed, ...playerEmbeds];
    }

    private formatPlayerStats(
        matchStartTime: Date,
        matchId: string,
        player: DiscordPlayerMatchStats,
        killEvents: LogPlayerKillV2[],
        groggyEvents: LogPlayerMakeGroggy[]
    ): string {
        const { stats } = player;
        if (!stats) {
            return 'No stats available';
        }
        const survivalMinutes = Math.round(stats.timeSurvived / 60);
        const kmWalked = (stats.walkDistance / 1000).toFixed(1);
        const accuracy = stats.kills > 0 && stats.headshotKills > 0
            ? ((stats.headshotKills / stats.kills) * 100).toFixed(1)
            : '0';

        const killDetails = this.getKillDetails(player.name, killEvents, groggyEvents, matchStartTime);

        const statsDetails = [
            `⚔️ Kills: ${stats.kills} (${stats.headshotKills} headshots)`,
            `🔻 Knocks: ${stats.DBNOs}`,
            `💥 Damage: ${Math.round(stats.damageDealt)} (${stats.assists} assists)`,
            `🎯 Headshot %: ${accuracy}%`,
            `⏰ Survival: ${survivalMinutes}min`,
            `📏 Longest Kill: ${Math.round(stats.longestKill)}m`,
            `👣 Distance: ${kmWalked}km`,
            stats.revives > 0 ? `🚑 Revives: ${stats.revives}` : '',
            `🎯 [2D Replay](https://pubg.sh/${player.name}/steam/${matchId})`
        ];

        if (killDetails) {
            statsDetails.push('*** KILLS & DBNOs ***', killDetails);
        }

        return statsDetails.filter(Boolean).join('\n');
    }

    private getKillDetails(
        playerName: string,
        killEvents: LogPlayerKillV2[],
        groggyEvents: LogPlayerMakeGroggy[],
        matchStartTime: Date
    ): string | null {
        // Filter events to only include those where the player is involved
        const relevantKills = killEvents.filter(event => 
            event.killer?.name === playerName || event.victim?.name === playerName
        );
        const relevantGroggies = groggyEvents.filter(event => 
            event.attacker?.name === playerName || event.victim?.name === playerName
        );

        const allEvents = [...relevantKills, ...relevantGroggies]
            .sort((a, b) => new Date(a._D).getTime() - new Date(b._D).getTime());

        if (allEvents.length === 0) {
            return null;
        }

        const eventDetails = allEvents.map(event => {
            const eventTime = new Date(event._D);
            const relativeSeconds = Math.round((eventTime.getTime() - matchStartTime.getTime()) / 1000);
            const minutes = Math.floor(relativeSeconds / 60);
            const seconds = relativeSeconds % 60;
            const relativeTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

            if ('killer' in event) { // LogPlayerKillV2 event
                const isKiller = event.killer?.name === playerName;
                const killerName = event.killer?.name || 'Unknown Player';
                const victimName = event.victim?.name || 'Unknown Player';
                const weapon = event.killerDamageInfo?.damageCauserName 
                    ? this.getReadableWeaponName(event.killerDamageInfo.damageCauserName)
                    : 'Unknown Weapon';
                const distance = event.killerDamageInfo?.distance
                    ? `${Math.round(event.killerDamageInfo.distance / 100)}m`
                    : 'Unknown';

                const icon = isKiller ? '⚔️' : '☠️';
                const actionType = isKiller ? 'Killed' : 'Killed by';
                const targetName = isKiller ? victimName : killerName;
                return `${relativeTime}: ${icon} ${actionType} - [${targetName}](https://www.pubgrank.org/profile/${targetName}) (${weapon}, ${distance})`;
            } else if ('attacker' in event) { // LogPlayerMakeGroggy event
                const isAttacker = event.attacker?.name === playerName;
                const attackerName = event.attacker?.name || 'Unknown Player';
                const victimName = event.victim?.name || 'Unknown Player';
                const weapon = event.damageCauserName 
                    ? this.getReadableWeaponName(event.damageCauserName)
                    : 'Unknown Weapon';
                const distance = event.distance
                    ? `${Math.round(event.distance / 100)}m`
                    : 'Unknown';

                const icon = isAttacker ? '🔻' : '⬇️';
                const actionType = isAttacker ? 'Knocked' : 'Knocked by';
                const targetName = isAttacker ? victimName : attackerName;
                return `${relativeTime}: ${icon} ${actionType} - [${targetName}](https://www.pubgrank.org/profile/${targetName}) (${weapon}, ${distance})`;
            }

            return ''; // Fallback for unknown event types
        }).filter(Boolean).join('\n');

        return eventDetails || null;
    }

    private getReadableWeaponName(weaponCode: string): string {
        return DAMAGE_CAUSER_NAME[weaponCode] || weaponCode
            .replace(/^Weap/, '')
            .replace(/_C$/, '')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .trim();
    }

    private formatMapName(mapCode: string): string {
        return MAP_NAMES[mapCode] || mapCode;
    }

    private formatGameMode(gameModeCode: string): string {
        return GAME_MODES[gameModeCode] || gameModeCode;
    }

    private getPlacementColor(rank?: number): number {
        if (!rank) return 0x36393F; // Discord dark theme color
        if (rank === 1) return 0xFFD700; // Gold
        if (rank <= 3) return 0xC0C0C0; // Silver
        if (rank <= 10) return 0xCD7F32; // Bronze
        return 0x36393F; // Default dark color
    }
} 