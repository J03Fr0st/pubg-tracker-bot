import { Client, Events, GatewayIntentBits, TextChannel, EmbedBuilder, REST, Routes, SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { PubgApiService } from './pubg-api.service';
import { DiscordPlayerMatchStats, DiscordMatchGroupSummary } from '../types/discord-match-summary.types';
import { PubgStorageService } from './pubg-storage.service';
import { LogPlayerKillV2, LogPlayerMakeGroggy } from '../types/pubg-telemetry.types';
import { MAP_NAMES, GAME_MODES, DAMAGE_CAUSER_NAME } from '../constants/pubg-mappings';

export class DiscordBotService {
    private readonly client: Client;
    private readonly pubgStorageService: PubgStorageService;
    private readonly commands = [
        new SlashCommandBuilder()
            .setName('add')
            .setDescription('Add a PUBG player to monitor')
            .addStringOption(option =>
                option.setName('playername')
                    .setDescription('The PUBG player name to monitor')
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('remove')
            .setDescription('Remove a PUBG player from monitoring')
            .addStringOption(option =>
                option.setName('playername')
                    .setDescription('The PUBG player name to stop monitoring')
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('list')
            .setDescription('List all monitored PUBG players')
    ];

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
        
        // Register slash commands
        const rest = new REST().setToken(process.env.DISCORD_TOKEN!);
        try {
            console.log('Started refreshing application (/) commands.');
            await rest.put(
                Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!),
                { body: this.commands }
            );
            console.log('Successfully reloaded application (/) commands.');
        } catch (error) {
            console.error('Error registering slash commands:', error);
        }

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
        this.client.on(Events.InteractionCreate, async interaction => {
            if (!interaction.isChatInputCommand()) return;

            try {
                switch (interaction.commandName) {
                    case 'add':
                        await this.handleAddPlayer(interaction);
                        break;
                    case 'remove':
                        await this.handleRemovePlayer(interaction);
                        break;
                    case 'list':
                        await this.handleListPlayers(interaction);
                        break;
                }
            } catch (error) {
                console.error('Error handling command:', error);
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('❌ Error')
                    .setDescription('An unexpected error occurred while processing your command.')
                    .setTimestamp();
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
            }
        });
    }

    private async handleAddPlayer(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply();
        const playerName = interaction.options.getString('playername', true);

        try {
            const player = await this.pubgApiService.getPlayer(playerName);
            await this.pubgStorageService.addPlayer(player.data[0]);

            const successEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Player Added')
                .setDescription(`Successfully added **${playerName}** to monitoring list`)
                .addFields(
                    { name: 'Player ID', value: player.data[0].id, inline: true },
                    { name: 'Platform', value: 'Steam', inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'PUBG Tracker Bot' });

            await interaction.editReply({ embeds: [successEmbed] });
        } catch (error) {
            const err = error as Error;
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Error Adding Player')
                .setDescription(`Failed to add player **${playerName}**`)
                .addFields(
                    { name: 'Error Details', value: err.message }
                )
                .setTimestamp()
                .setFooter({ text: 'PUBG Tracker Bot' });

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }

    private async handleRemovePlayer(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply();
        const playerName = interaction.options.getString('playername', true);

        try {
            await this.pubgStorageService.removePlayer(playerName);
            const successEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Player Removed')
                .setDescription(`Successfully removed **${playerName}** from monitoring list`)
                .setTimestamp()
                .setFooter({ text: 'PUBG Tracker Bot' });

            await interaction.editReply({ embeds: [successEmbed] });
        } catch (error) {
            const err = error as Error;
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Error Removing Player')
                .setDescription(`Failed to remove player **${playerName}**`)
                .addFields(
                    { name: 'Error Details', value: err.message }
                )
                .setTimestamp()
                .setFooter({ text: 'PUBG Tracker Bot' });

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }

    private async handleListPlayers(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply();
        const players = await this.pubgStorageService.getAllPlayers();

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📋 Monitored Players')
            .setTimestamp()
            .setFooter({ text: 'PUBG Tracker Bot' });

        if (players.length === 0) {
            embed.setDescription('No players are currently being monitored');
        } else {
            const playerList = players.map((p, index) => `${index + 1}. ${p.name}`).join('\n');
            embed.setDescription(playerList)
                .addFields({ name: 'Total Players', value: players.length.toString(), inline: true });
        }

        await interaction.editReply({ embeds: [embed] });
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
            const relativeTime = `\`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}\``;

            if ('killer' in event) { // LogPlayerKillV2 event
                const isKiller = event.killer?.name === playerName;
                const killerName = event.killer?.name || 'Unknown Player';
                const victimName = event.victim?.name || 'Unknown Player';
                const weapon = event.killerDamageInfo?.damageCauserName 
                    ? this.getReadableDamageCauserName(event.killerDamageInfo.damageCauserName)
                    : 'Unknown Weapon';
                const distance = event.killerDamageInfo?.distance
                    ? `${Math.round(event.killerDamageInfo.distance / 100)}m`
                    : 'Unknown';

                const icon = isKiller ? '⚔️' : '☠️';
                const actionType = isKiller ? 'Killed' : 'Killed by';
                const targetName = isKiller ? victimName : killerName;
                return `${relativeTime} ${icon} ${actionType} - [${targetName}](https://www.pubgrank.org/profile/${targetName}) (${weapon}, ${distance})`;
            } else if ('attacker' in event) { // LogPlayerMakeGroggy event
                const isAttacker = event.attacker?.name === playerName;
                const attackerName = event.attacker?.name || 'Unknown Player';
                const victimName = event.victim?.name || 'Unknown Player';
                const weapon = event.damageCauserName 
                    ? this.getReadableDamageCauserName(event.damageCauserName)
                    : 'Unknown Weapon';
                const distance = event.distance
                    ? `${Math.round(event.distance / 100)}m`
                    : 'Unknown';

                const icon = isAttacker ? '🔻' : '⬇️';
                const actionType = isAttacker ? 'Knocked' : 'Knocked by';
                const targetName = isAttacker ? victimName : attackerName;
                return `${relativeTime} ${icon} ${actionType} - [${targetName}](https://www.pubgrank.org/profile/${targetName}) (${weapon}, ${distance})`;
            }

            return ''; // Fallback for unknown event types
        }).filter(Boolean).join('\n');

        return eventDetails || null;
    }

    private getReadableDamageCauserName(weaponCode: string): string {
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