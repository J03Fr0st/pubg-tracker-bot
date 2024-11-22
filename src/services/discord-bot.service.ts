import { Client, Events, GatewayIntentBits, TextChannel, Message, EmbedBuilder } from 'discord.js';
import { PubgApiService } from './pubg-api.service';
import { DiscordPlayerMatchStats, DiscordMatchGroupSummary } from '../types/discord-match-summary.types';
import { PubgStorageService } from './pubg-storage.service';
import { LogPlayerKillV2 } from '../types/pubg-telemetry.types';

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

    private async createMatchSummaryEmbeds(summary: DiscordMatchGroupSummary): Promise<EmbedBuilder[]> {
        const { mapName, gameMode, playedAt, players } = summary;
        const teamRankText = summary.teamRank ? `🏆 Team Rank: #${summary.teamRank}` : 'N/A';

        // Format the date and time
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

        // Calculate total damage and total kills
        const totalDamage = players.reduce((acc, player) => acc + (player.stats?.damageDealt || 0), 0);
        const totalKills = players.reduce((acc, player) => acc + (player.stats?.kills || 0), 0);

        const mainEmbed = new EmbedBuilder()
            .setTitle(`🎮 PUBG Match Summary`)
            .setDescription(`**⏰ Date:** ${dateString}`)
            .addFields(
                { name: '📍 Map', value: this.formatMapName(mapName), inline: true },
                { name: '🎯 Mode', value: this.formatGameMode(gameMode), inline: true },
                { name: '🏆 Team Rank', value: teamRankText, inline: true },
                { name: '💥 Total Damage', value: `${Math.round(totalDamage)}`, inline: true },
                { name: '🔫 Total Kills', value: `${totalKills}`, inline: true }
            )
            .setColor(0x00AE86);

        const killEvents = await this.pubgApiService.fetchAndFilterLogPlayerKillV2Events(summary.telemetryUrl!, players.map(p => p.name));

        const playerEmbeds = players.map(player => {
            const playerStats = this.formatPlayerStats(summary.matchId, player, killEvents);
            return new EmbedBuilder()
                .setTitle(`Player: ${player.name}`)
                .setDescription(playerStats)
                .setColor(0x00AE86);
        });

        return [mainEmbed, ...playerEmbeds];
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
            'Kiki_Main': 'Deston'
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

    private formatPlayerStats(matchId: string, player: DiscordPlayerMatchStats, killEvents: LogPlayerKillV2[]): string {
        const { stats } = player;
        if (!stats) {
            return 'No stats available';
        }
        const survivalMinutes = Math.round(stats.timeSurvived / 60);
        const kmWalked = (stats.walkDistance / 1000).toFixed(1);
        const accuracy = stats.kills > 0 && stats.headshotKills > 0 
            ? ((stats.headshotKills / stats.kills) * 100).toFixed(1) 
            : '0';

        const killDetails = this.getKillDetails(player.name, killEvents);

        const statsDetails = [
            `🔫 **Kills:** ${stats.kills} (${stats.headshotKills} headshots)`,
            `🔨 **DBNOs:** ${stats.DBNOs}`,
            `💥 **Damage:** ${Math.round(stats.damageDealt)} (${stats.assists} assists)`,
            `🎯 **Headshot %:** ${accuracy}%`,
            `⏱️ **Survival:** ${survivalMinutes}min`,
            `🎯 **Longest Kill:** ${Math.round(stats.longestKill)}m`,
            `🚶 **Distance:** ${kmWalked}km`,            
            stats.revives > 0 ? `🛡️ **Revives:** ${stats.revives}` : '',           
            `[🎯 **2D Replay**](https://pubg.sh/${player.name}/steam/${matchId})`
        ];

        if (killDetails) {
            statsDetails.push('*** KILLS ***', killDetails);
        }

        return statsDetails.filter(Boolean).join('\n');
    }

    private getKillDetails(playerName: string, killEvents: LogPlayerKillV2[]): string | null {
        const playerKills = killEvents.filter(event => event.killer?.name === playerName || event.dBNOMaker?.name === playerName || event.victim?.name === playerName);
        if (playerKills.length === 0) {
            return null;
        }

        return playerKills.map(kill => {
            let killDetails = '';

            if (kill.dBNOMaker?.name === playerName) {
                const weapon = this.getReadableWeaponName(kill.dBNODamageInfo?.damageCauserName || '');
                const distance = kill.dBNODamageInfo?.distance 
                    ? `${Math.round(kill.dBNODamageInfo.distance / 100)}m`
                    : 'N/A';
    
                const killTime = new Date(kill._D).toLocaleString('en-ZA', {                   
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                    timeZone: 'Africa/Johannesburg'
                }).replace(',', '');   
                   
                const icon = '🤜';
                const actionType = 'Knock'
                const victimName = kill.victim?.name || 'Unknown';
                    
                killDetails+= `${killTime}: ${icon} ${actionType} - [${victimName}](https://www.pubgrank.org/profile/${victimName}) (${weapon}, ${distance})`;
            }
            if (kill.killer?.name === playerName) {
                const weapon = this.getReadableWeaponName(kill.killerDamageInfo?.damageCauserName || '');
                const distance = kill.killerDamageInfo?.distance 
                    ? `${Math.round(kill.killerDamageInfo.distance /100)}m`
                    : 'N/A';
    
                const killTime = new Date(kill._D).toLocaleString('en-ZA', {                    
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                    timeZone: 'Africa/Johannesburg'
                }).replace(',', '');   
                   
                const icon = '💀';
                const actionType = 'Kill'
                const victimName = kill.victim?.name || 'Unknown';
                //If killDetails is not empty, add a new line before adding the kill details
                if(killDetails !== '') {
                    killDetails+= '\n';
                }
                killDetails+= `${killTime}: ${icon} ${actionType} - [${victimName}](https://www.pubgrank.org/profile/${victimName}) (${weapon}, ${distance})`;
            }
            if (kill.victim?.name === playerName) {
                const killerName = kill.killer?.name || 'Unknown';
                const weapon = this.getReadableWeaponName(kill.killerDamageInfo?.damageCauserName || '');
                const distance = kill.killerDamageInfo?.distance 
                    ? `${Math.round(kill.killerDamageInfo.distance / 100)}m`
                    : 'N/A';

                const killTime = new Date(kill._D).toLocaleString('en-ZA', {                    
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                    timeZone: 'Africa/Johannesburg'
                }).replace(',', '');   

                const icon = '☠️';
                const actionType = 'Killed by';
                if (killDetails !== '') {
                    killDetails += '\n';
                }
                killDetails += `${killTime}: ${icon} ${actionType} - [${killerName}](https://www.pubgrank.org/profile/${killerName}) (${weapon}, ${distance})`;
            }
            if (kill.dBNOMaker?.name !== playerName && kill.victim?.name === playerName) {
                const dBNOMakerName = kill.dBNOMaker?.name || 'Unknown';
                const weapon = this.getReadableWeaponName(kill.dBNODamageInfo?.damageCauserName || '');
                const distance = kill.dBNODamageInfo?.distance 
                    ? `${Math.round(kill.dBNODamageInfo.distance / 100)}m`
                    : 'N/A';

                const knockTime = new Date(kill._D).toLocaleString('en-ZA', {                    
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                    timeZone: 'Africa/Johannesburg'
                }).replace(',', '');   

                const icon = '🔻';
                const actionType = 'Knocked by';
                if (killDetails !== '') {
                    killDetails += '\n';
                }
                killDetails += `${knockTime}: ${icon} ${actionType} - [${dBNOMakerName}](https://www.pubgrank.org/profile/${dBNOMakerName}) (${weapon}, ${distance})`;
            }

            return killDetails;
        }).join('\n');
    }

    private getReadableWeaponName(weaponCode: string): string {
        return weaponCode
        .replace(/^Weap/, "") // Remove "Weap" prefix
        .replace(/_C$/, "") // Remove "_C" suffix
        .replace(/([a-z])([A-Z])/g, "$1 $2") // Add space between camel case words
        .trim(); // Trim any extra whitespace;
    }
} 