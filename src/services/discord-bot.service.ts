import {
  Client,
  Events,
  GatewayIntentBits,
  TextChannel,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import {
  PubgClient,
  Player,
  Shard,
  LogPlayerKillV2,
  LogPlayerMakeGroggy,
  LogPlayerRevive,
  LogPlayerTakeDamage,
  assetManager,
  DAMAGE_CAUSER_NAME,
  MAP_NAMES,
  GAME_MODES,
} from '@j03fr0st/pubg-ts';
import {
  DiscordPlayerMatchStats,
  DiscordMatchGroupSummary,
} from '../types/discord-match-summary.types';
import { PubgStorageService } from './pubg-storage.service';
import { TelemetryProcessorService } from './telemetry-processor.service';
import { PlayerAnalysis, KillChain, AssistInfo } from '../types/analytics-results.types';
// No longer need custom mappings - using pubg-ts dictionaries
import { MatchColorUtil } from '../utils/match-colors.util';
import { success, error, debug } from '../utils/logger';
import { DamageInfoUtils } from '../utils/damage-info.util';

export class DiscordBotService {
  private readonly client: Client;
  private readonly pubgStorageService: PubgStorageService;
  private readonly pubgClient: PubgClient;
  private readonly telemetryProcessor: TelemetryProcessorService;
  private readonly commands = [
    new SlashCommandBuilder()
      .setName('add')
      .setDescription('Add a PUBG player to monitor')
      .addStringOption((option) =>
        option
          .setName('playername')
          .setDescription('The PUBG player name to monitor')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('remove')
      .setDescription('Remove a PUBG player from monitoring')
      .addStringOption((option) =>
        option
          .setName('playername')
          .setDescription('The PUBG player name to stop monitoring')
          .setRequired(true)
      ),
    new SlashCommandBuilder().setName('list').setDescription('List all monitored PUBG players'),
    new SlashCommandBuilder()
      .setName('removelastmatch')
      .setDescription('Remove the last processed match from tracking'),
    new SlashCommandBuilder()
      .setName('removematch')
      .setDescription('Remove a specific processed match by matchId')
      .addStringOption((option) =>
        option
          .setName('matchid')
          .setDescription('The matchId of the match to remove')
          .setRequired(true)
      ),
  ];

  constructor(apiKey: string, shard: Shard = 'pc-na') {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
    this.pubgStorageService = new PubgStorageService();
    this.pubgClient = new PubgClient({
      apiKey,
      shard: shard as any, // Cast to handle type compatibility
    });
    this.telemetryProcessor = new TelemetryProcessorService();
    this.setupEventHandlers();
  }

  public async initialize(): Promise<void> {
    // Register slash commands
    const rest = new REST().setToken(process.env.DISCORD_TOKEN!);
    try {
      debug('Started refreshing application (/) commands.');
      await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!), {
        body: this.commands,
      });
      success('Successfully reloaded application (/) commands.');
    } catch (err) {
      error('Error registering slash commands:', err as Error);
    }

    await this.client.login(process.env.DISCORD_TOKEN);
  }

  public async sendMatchSummary(
    channelId: string,
    summary: DiscordMatchGroupSummary
  ): Promise<void> {
    const channel = (await this.client.channels.fetch(channelId)) as TextChannel;
    if (!channel) {
      throw new Error(`Could not find channel with ID ${channelId}`);
    }

    // Create basic match summary embeds
    const basicEmbeds = await this.createMatchSummaryEmbeds(summary);
    if (!basicEmbeds || !basicEmbeds.length) {
      error('No embeds were created for match summary');
      return;
    }

    // Send basic match summary only
    for (const embed of basicEmbeds) {
      await channel.send({ embeds: [embed] });
    }
  }

  private setupEventHandlers(): void {
    this.client.on(Events.InteractionCreate, async (interaction) => {
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
          case 'removelastmatch':
            await this.handleRemoveLastMatch(interaction);
            break;
          case 'removematch':
            await this.handleRemoveMatch(interaction);
            break;
        }
      } catch (err) {
        error('Error handling command:', err as Error);
        const errorEmbed = new EmbedBuilder()
          .setColor(0xff0000)
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
      const playerResponse = await this.pubgClient.players.getPlayerByName(playerName);
      const player = Array.isArray(playerResponse.data)
        ? playerResponse.data[0]
        : (playerResponse.data as Player);

      await this.pubgStorageService.addPlayer({
        id: player.id,
        type: player.type,
        attributes: player.attributes,
        relationships: player.relationships,
      });

      const successEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Player Added')
        .setDescription(`Successfully added **${playerName}** to monitoring list`)
        .addFields(
          { name: 'Player ID', value: player.id, inline: true },
          { name: 'Platform', value: 'Steam', inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'PUBG Tracker Bot' });

      await interaction.editReply({ embeds: [successEmbed] });
    } catch (error) {
      const err = error as Error;
      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Error Adding Player')
        .setDescription(`Failed to add player **${playerName}**`)
        .addFields({ name: 'Error Details', value: err.message })
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
        .setColor(0x00ff00)
        .setTitle('✅ Player Removed')
        .setDescription(`Successfully removed **${playerName}** from monitoring list`)
        .setTimestamp()
        .setFooter({ text: 'PUBG Tracker Bot' });

      await interaction.editReply({ embeds: [successEmbed] });
    } catch (error) {
      const err = error as Error;
      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Error Removing Player')
        .setDescription(`Failed to remove player **${playerName}**`)
        .addFields({ name: 'Error Details', value: err.message })
        .setTimestamp()
        .setFooter({ text: 'PUBG Tracker Bot' });

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  private async handleListPlayers(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    const players = await this.pubgStorageService.getAllPlayers();

    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle('📋 Monitored Players')
      .setTimestamp()
      .setFooter({ text: 'PUBG Tracker Bot' });

    if (players.length === 0) {
      embed.setDescription('No players are currently being monitored');
    } else {
      const playerList = players.map((p, index) => `${index + 1}. ${p.name}`).join('\n');
      embed
        .setDescription(playerList)
        .addFields({ name: 'Total Players', value: players.length.toString(), inline: true });
    }

    await interaction.editReply({ embeds: [embed] });
  }

  private async handleRemoveLastMatch(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    const userName = interaction.user.username;
    debug(`User ${userName} requested to remove last match`);

    try {
      // Get details about the last match before removing it
      const lastMatch = await this.pubgStorageService.getLastProcessedMatch();

      if (!lastMatch) {
        debug(`No matches found to remove for user ${userName}`);
        const noMatchEmbed = new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle('⚠️ No Matches Found')
          .setDescription('There are no processed matches to remove.')
          .setTimestamp()
          .setFooter({ text: 'PUBG Tracker Bot' });

        await interaction.editReply({ embeds: [noMatchEmbed] });
        return;
      }

      debug(
        `Found last match to remove: ${lastMatch.matchId} processed at ${lastMatch.processedAt}`
      );

      // Remove the last processed match
      const removedMatchId = await this.pubgStorageService.removeLastProcessedMatch();

      if (removedMatchId) {
        success(`Successfully removed last match ${removedMatchId} by user ${userName}`);
        const successEmbed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✅ Last Match Removed')
          .setDescription('Successfully removed the last processed match from tracking.')
          .addFields(
            { name: 'Match ID', value: removedMatchId, inline: true },
            {
              name: 'Processed At',
              value: lastMatch.processedAt.toLocaleString('en-ZA', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Africa/Johannesburg',
              }),
              inline: true,
            }
          )
          .setTimestamp()
          .setFooter({ text: 'PUBG Tracker Bot' });

        await interaction.editReply({ embeds: [successEmbed] });
      } else {
        throw new Error('Failed to remove the match from database');
      }
    } catch (err) {
      const errorObj = err as Error;
      error(`Error removing last match for user ${userName}: ${errorObj.message}`);
      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Error Removing Match')
        .setDescription('Failed to remove the last processed match.')
        .addFields({ name: 'Error Details', value: errorObj.message })
        .setTimestamp()
        .setFooter({ text: 'PUBG Tracker Bot' });

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  private async handleRemoveMatch(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    const userName = interaction.user.username;
    const matchId = interaction.options.getString('matchid', true);
    debug(`User ${userName} requested to remove match ${matchId}`);
    try {
      const deleted = await this.pubgStorageService.removeProcessedMatch(matchId);
      if (deleted) {
        const successEmbed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle('✅ Match Removed')
          .setDescription('Successfully removed the processed match from tracking.')
          .addFields({ name: 'Match ID', value: matchId, inline: true })
          .setTimestamp()
          .setFooter({ text: 'PUBG Tracker Bot' });
        await interaction.editReply({ embeds: [successEmbed] });
      } else {
        const notFoundEmbed = new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle('⚠️ Match Not Found')
          .setDescription('No processed match with that matchId exists.')
          .addFields({ name: 'Match ID', value: matchId, inline: true })
          .setTimestamp()
          .setFooter({ text: 'PUBG Tracker Bot' });
        await interaction.editReply({ embeds: [notFoundEmbed] });
      }
    } catch (err) {
      const errorObj = err as Error;
      error(`Error removing match ${matchId} for user ${userName}: ${errorObj.message}`);
      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Error Removing Match')
        .setDescription('Failed to remove the processed match.')
        .addFields({ name: 'Error Details', value: errorObj.message })
        .setTimestamp()
        .setFooter({ text: 'PUBG Tracker Bot' });
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  private async createMatchSummaryEmbeds(
    summary: DiscordMatchGroupSummary
  ): Promise<EmbedBuilder[]> {
    const { mapName, gameMode, playedAt, players, matchId } = summary;
    const teamRankText = summary.teamRank ? `#${summary.teamRank}` : 'N/A';

    // Generate a consistent color for this match based on matchId
    const matchColor = MatchColorUtil.generateMatchColor(matchId);

    const matchDate = new Date(playedAt);
    const dateString = matchDate
      .toLocaleTimeString('en-ZA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Africa/Johannesburg',
      })
      .replace(',', '');

    const totalDamage = players.reduce((acc, player) => acc + (player.stats?.damageDealt || 0), 0);
    const totalKills = players.reduce((acc, player) => acc + (player.stats?.kills || 0), 0);
    const totalDBNOs = players.reduce((acc, player) => acc + (player.stats?.DBNOs || 0), 0);

    const mainEmbed = new EmbedBuilder()
      .setTitle('🎮 PUBG Match Summary')
      .setDescription(
        [
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
          `💥 Total Damage: **${Math.round(totalDamage)}**`,
        ].join('\n')
      )
      .setColor(matchColor)
      .setFooter({ text: `PUBG Match Tracker - ${matchId}` })
      .setTimestamp(matchDate);

    if (!summary.telemetryUrl) {
      debug('No telemetry URL available, using basic player embeds');
      return [mainEmbed, ...this.createBasicPlayerEmbeds(players, matchColor, matchId)];
    }

    try {
      // Fetch raw telemetry data
      const telemetryData = await this.pubgClient.telemetry.getTelemetryData(summary.telemetryUrl);
      const trackedPlayerNames = players.map(p => p.name);

      debug(`Processing telemetry for ${trackedPlayerNames.length} players`);
      console.log(`[PLAYER DEBUG] Tracked player names:`, trackedPlayerNames.map(name => `"${name}"`));
      // Process using our new service
      const matchAnalysis = await this.telemetryProcessor.processMatchTelemetry(
        telemetryData, // Raw TelemetryEvent[] - no conversion needed!
        matchId,
        matchDate,
        trackedPlayerNames
      );

      // Create enhanced embeds
      const enhancedPlayerEmbeds = players.map(player => {
        const analysis = matchAnalysis.playerAnalyses.get(player.name);
        return analysis ?
          this.createEnhancedPlayerEmbed(player, analysis, matchColor, matchId) :
          this.createBasicPlayerEmbed(player, matchColor, matchId);
      });

      success(`Created enhanced embeds for ${enhancedPlayerEmbeds.length} players`);
      return [mainEmbed, ...enhancedPlayerEmbeds];

    } catch (err) {
      error(`Telemetry processing failed: ${(err as Error).message}`);
      // Fallback to basic embeds
      return [mainEmbed, ...this.createBasicPlayerEmbeds(players, matchColor, matchId)];
    }
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

    // Debug: Log survival time calculation
    console.log(`[SURVIVAL DEBUG] Player: ${player.name}, timeSurvived: ${stats.timeSurvived}s, calculated: ${survivalMinutes}min`);
    const accuracy =
      stats.kills > 0 && stats.headshotKills > 0
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
      `🎯 [2D Replay](https://pubg.sh/${player.name}/steam/${matchId})`,
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
    const relevantKills = killEvents.filter(
      (event) => event.killer?.name === playerName || event.victim?.name === playerName
    );
    const relevantGroggies = groggyEvents.filter(
      (event) => event.attacker?.name === playerName || event.victim?.name === playerName
    );

    // Sort events by time
    const allEvents = [...relevantKills, ...relevantGroggies].sort(
      (a, b) => new Date(a._D ?? 0).getTime() - new Date(b._D ?? 0).getTime()
    );

    if (allEvents.length === 0) {
      return null;
    }

    const eventDetails = allEvents
      .map((event) => {
        const eventTime = event._D ? new Date(event._D) : matchStartTime;
        const relativeSeconds = Math.round((eventTime.getTime() - matchStartTime.getTime()) / 1000);
        const minutes = Math.floor(relativeSeconds / 60);
        const seconds = relativeSeconds % 60;
        const relativeTime = `\`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}\``;

        if (event._T === 'LogPlayerKillV2') {
          // LogPlayerKillV2 event
          const isKiller = event.killer?.name === playerName;
          const killerName = event.killer?.name || 'Unknown Player';
          const victimName = event.victim?.name || 'Unknown Player';

          const primaryDamageInfo = event.killerDamageInfo
            ? DamageInfoUtils.getFirst(event.killerDamageInfo)
            : null;
          const weapon = primaryDamageInfo?.damageCauserName
            ? this.getReadableDamageCauserName(primaryDamageInfo.damageCauserName)
            : 'Unknown Weapon';
          const distance = primaryDamageInfo?.distance
            ? `${Math.round(primaryDamageInfo.distance / 100)}m`
            : 'Unknown';

          const icon = isKiller ? '⚔️' : '☠️';
          const actionType = isKiller ? 'Killed' : 'Killed by';
          const targetName = isKiller ? victimName : killerName;
          return `${relativeTime} ${icon} ${actionType} - [${targetName}](https://pubg.op.gg/user/${targetName}) (${weapon}, ${distance})`;
        }
        if (event._T === 'LogPlayerMakeGroggy') {
          // LogPlayerMakeGroggy event
          const isAttacker = event.attacker?.name === playerName;
          const attackerName = event.attacker?.name || 'Unknown Player';
          const victimName = event.victim?.name || 'Unknown Player';
          const weapon = event.damageCauserName
            ? this.getReadableDamageCauserName(event.damageCauserName)
            : 'Unknown Weapon';
          const distance = event.distance ? `${Math.round(event.distance / 100)}m` : 'Unknown';

          const icon = isAttacker ? '🔻' : '⬇️';
          const actionType = isAttacker ? 'Knocked' : 'Knocked by';
          const targetName = isAttacker ? victimName : attackerName;
          return `${relativeTime} ${icon} ${actionType} - [${targetName}](https://pubg.op.gg/user/${targetName}) (${weapon}, ${distance})`;
        }

        return ''; // Fallback for unknown event types
      })
      .filter(Boolean)
      .join('\n');

    return eventDetails || null;
  }

  private getReadableDamageCauserName(weaponCode: string): string {
    // Handle null/undefined weapon codes
    if (!weaponCode) {
      return 'Unknown Weapon';
    }

    // Try pubg-ts built-in dictionary first
    const pubgDictionaryName = DAMAGE_CAUSER_NAME?.[weaponCode];
    if (pubgDictionaryName) {
      return pubgDictionaryName;
    }

    // Try pubg-ts asset manager
    const assetName = assetManager?.getDamageCauserName?.(weaponCode);
    if (assetName && assetName !== weaponCode) {
      return assetName;
    }

    // pubg-ts dictionaries should cover most cases

    // Final fallback: format the weapon code
    return weaponCode
      .replace(/^Weap/, '')
      .replace(/_C$/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim();
  }

  private formatMapName(mapCode: string): string {
    // Try pubg-ts built-in dictionary first
    const pubgDictionaryName = MAP_NAMES?.[mapCode];
    if (pubgDictionaryName) {
      return pubgDictionaryName;
    }

    // Use pubg-ts asset manager as fallback
    return assetManager?.getMapName?.(mapCode) || mapCode;
  }

  private formatGameMode(gameModeCode: string): string {
    // Try pubg-ts built-in dictionary first
    const pubgDictionaryName = GAME_MODES?.[gameModeCode];
    if (pubgDictionaryName) {
      return pubgDictionaryName;
    }

    // Use pubg-ts asset manager as fallback
    return assetManager?.getGameModeName?.(gameModeCode) || gameModeCode;
  }

  private createBasicPlayerEmbeds(players: DiscordPlayerMatchStats[], matchColor: number, matchId: string): EmbedBuilder[] {
    return players.map(player => this.createBasicPlayerEmbed(player, matchColor, matchId));
  }

  private createBasicPlayerEmbed(player: DiscordPlayerMatchStats, matchColor: number, matchId: string): EmbedBuilder {
    const { stats } = player;
    if (!stats) {
      return new EmbedBuilder()
        .setTitle(`Player: ${player.name}`)
        .setDescription('No stats available')
        .setColor(matchColor);
    }

    const survivalMinutes = Math.round(stats.timeSurvived / 60);
    const kmWalked = (stats.walkDistance / 1000).toFixed(1);
    const accuracy = stats.kills > 0 && stats.headshotKills > 0
      ? ((stats.headshotKills / stats.kills) * 100).toFixed(1)
      : '0';

    const basicStats = [
      `⚔️ Kills: ${stats.kills} (${stats.headshotKills} headshots)`,
      `🔻 Knocks: ${stats.DBNOs}`,
      `💥 Damage: ${Math.round(stats.damageDealt)} (${stats.assists} assists)`,
      `🎯 Headshot %: ${accuracy}%`,
      `⏰ Survival: ${survivalMinutes}min`,
      `📏 Longest Kill: ${Math.round(stats.longestKill)}m`,
      `👣 Distance: ${kmWalked}km`,
      stats.revives > 0 ? `🚑 Revives: ${stats.revives}` : '',
      `🎯 [2D Replay](https://pubg.sh/${player.name}/steam/${matchId})`,
    ].filter(Boolean).join('\n');

    return new EmbedBuilder()
      .setTitle(`Player: ${player.name}`)
      .setDescription(basicStats)
      .setColor(matchColor);
  }

  /**
   * Creates an enhanced Discord embed for a player using telemetry analysis data.
   *
   * This embed includes advanced statistics like weapon mastery, kill chains,
   * calculated assists, and an enhanced timeline of combat events.
   *
   * @param player - Player match statistics from PUBG API
   * @param analysis - Enhanced telemetry analysis for this player
   * @param matchColor - Hex color code for the embed
   * @param matchId - Match identifier for replay links
   * @returns Discord EmbedBuilder with enhanced player statistics
   */
  private createEnhancedPlayerEmbed(
    player: DiscordPlayerMatchStats,
    analysis: PlayerAnalysis,
    matchColor: number,
    matchId: string
  ): EmbedBuilder {
    const statsDescription = this.formatEnhancedStats(player, analysis, matchId);

    return new EmbedBuilder()
      .setTitle(`Player: ${player.name}`)
      .setDescription(statsDescription)
      .setColor(matchColor);
  }

  /**
   * Formats enhanced player statistics into a rich Discord message format.
   *
   * Combines basic match stats with advanced telemetry analytics including
   * weapon efficiency, kill chains, assists, and detailed combat timeline.
   *
   * @param player - Player match statistics from PUBG API
   * @param analysis - Enhanced telemetry analysis for this player
   * @param matchId - Match identifier for replay links
   * @returns Formatted string suitable for Discord embed description
   */
  private formatEnhancedStats(
    player: DiscordPlayerMatchStats,
    analysis: PlayerAnalysis,
    matchId: string
  ): string {
    const { stats } = player;
    if (!stats) return 'No stats available';

    const sections = [
      // Enhanced combat stats
      this.formatCombatStats(stats, analysis),

      // Kill chains
      this.formatKillChains(analysis.killChains),

      // Assists
      this.formatAssists(analysis.calculatedAssists),

      // Enhanced timeline using raw telemetry events
      this.formatEnhancedTimeline(analysis),

      // Basic info
      `⏰ Survival: ${Math.round(stats.timeSurvived / 60)}min • ${(stats.walkDistance / 1000).toFixed(1)}km`,
      `🎯 [2D Replay](https://pubg.sh/${player.name}/steam/${matchId})`
    ];

    return sections.filter(Boolean).join('\n\n');
  }

  /**
   * Formats enhanced combat statistics section for Discord display.
   *
   * Includes K/D ratio, damage dealt/taken, average kill distance, and headshot percentage.
   *
   * @param stats - Basic player statistics from PUBG API
   * @param analysis - Enhanced telemetry analysis with calculated metrics
   * @returns Formatted combat statistics string
   */
  private formatCombatStats(stats: any, analysis: PlayerAnalysis): string {
    return [
      '⚔️ **ENHANCED COMBAT**',
      `Kills: **${stats.kills}** (${stats.headshotKills} HS) • K/D: **${analysis.kdRatio.toFixed(2)}**`,
      `Damage: **${analysis.totalDamageDealt.toFixed(0)}** dealt / **${analysis.totalDamageTaken.toFixed(0)}** taken`,
      `Avg Distance: **${analysis.avgKillDistance.toFixed(0)}m** • HS Rate: **${analysis.headshotPercentage.toFixed(1)}%**`
    ].join('\n');
  }



  /**
   * Formats kill chain statistics for Discord display.
   *
   * Shows multi-kill achievements including doubles, triples, quads, and best chain timing.
   *
   * @param chains - Array of kill chain data from telemetry analysis
   * @returns Formatted kill chains string, or empty string if no chains found
   */
  private formatKillChains(chains: KillChain[]): string {
    if (!chains.length) return '';

    const bestChain = chains.reduce((best, current) =>
      current.kills.length > best.kills.length ? current : best
    );

    const multiKills = chains.reduce((counts, chain) => {
      const killCount = chain.kills.length;
      if (killCount === 2) counts.doubles++;
      else if (killCount === 3) counts.triples++;
      else if (killCount >= 4) counts.quads++;
      return counts;
    }, { doubles: 0, triples: 0, quads: 0 });

    const elements = [];
    if (bestChain.kills.length >= 2) {
      elements.push(`🔥 Best: **${bestChain.kills.length} kills** (${bestChain.duration.toFixed(1)}s)`);
    }
    if (multiKills.doubles) elements.push(`⚡ Doubles: **${multiKills.doubles}**`);
    if (multiKills.triples) elements.push(`💫 Triples: **${multiKills.triples}**`);
    if (multiKills.quads) elements.push(`🌟 Quads+: **${multiKills.quads}**`);

    return elements.length > 0 ? `**KILL CHAINS**\n${elements.join(' • ')}` : '';
  }

  /**
   * Formats calculated assist statistics for Discord display.
   *
   * Shows total assists broken down by type: damage assists, knockdown assists, and combined.
   *
   * @param assists - Array of calculated assist contributions
   * @returns Formatted assists string, or empty string if no assists found
   */
  private formatAssists(assists: AssistInfo[]): string {
    if (!assists.length) return '';

    const assistTypes = assists.reduce((counts, assist) => {
      counts[assist.assistType]++;
      return counts;
    }, { damage: 0, knockdown: 0, both: 0 } as Record<string, number>);

    const elements = [`🤝 Total: **${assists.length}**`];
    if (assistTypes.damage) elements.push(`💥 Damage: **${assistTypes.damage}**`);
    if (assistTypes.knockdown) elements.push(`🔻 Knockdown: **${assistTypes.knockdown}**`);
    if (assistTypes.both) elements.push(`⭐ Combined: **${assistTypes.both}**`);

    return `**CALCULATED ASSISTS**\n${elements.join(' • ')}`;
  }

  /**
   * Creates an enhanced timeline of combat events using raw telemetry data.
   *
   * Combines kills, knockdowns, and revives in chronological order with precise timing,
   * weapon information, and clickable player links to pubg.op.gg.
   *
   * @param analysis - Player telemetry analysis containing raw event data
   * @returns Formatted timeline string showing up to 10 most recent events
   */
  private formatEnhancedTimeline(analysis: PlayerAnalysis): string {
    // Filter out events without valid timestamps
    const validKills = analysis.killEvents.filter(k => k._D);
    const validKnockdowns = analysis.knockdownEvents.filter(k => k._D);
    const validRevives = analysis.reviveEvents.filter(r => r._D);
    // Include significant damage events (>= 20 damage) for more interesting timeline
    const significantDamage = analysis.damageEvents.filter(d => d._D && d.damage >= 20);
    // Include player's own deaths and knockdowns
    const validDeaths = analysis.deathEvents.filter(k => k._D);
    const validKnockedDown = analysis.knockedDownEvents.filter(k => k._D);

    // Combine raw telemetry events for timeline
    const timelineEvents = [
      ...validKills.map(k => ({ type: 'kill', event: k, time: new Date(k._D!) })),
      ...validKnockdowns.map(k => ({ type: 'knockdown', event: k, time: new Date(k._D!) })),
      ...validRevives.map(r => ({ type: 'revive', event: r, time: new Date(r._D!) })),
      ...significantDamage.map(d => ({ type: 'damage', event: d, time: new Date(d._D!) })),
      ...validDeaths.map(k => ({ type: 'death', event: k, time: new Date(k._D!) })),
      ...validKnockedDown.map(k => ({ type: 'knocked', event: k, time: new Date(k._D!) }))
    ].sort((a, b) => a.time.getTime() - b.time.getTime()).slice(0, 8); // Limit to 8 events to avoid spam

    if (!timelineEvents.length) return '';

    const timeline = timelineEvents
      .map(({ type, event }) => {
        const matchTime = this.formatMatchTime(
          event._D!,
          timelineEvents[0]?.time || new Date()
        );
        if (type === 'kill') {
          const kill = event as LogPlayerKillV2;
          const victimName = kill.victim?.name || 'Unknown Player';

          // Use killerDamageInfo for more accurate weapon and distance data
          const primaryDamageInfo = kill.killerDamageInfo
            ? DamageInfoUtils.getFirst(kill.killerDamageInfo)
            : null;

          const weapon = primaryDamageInfo?.damageCauserName
            ? this.getReadableDamageCauserName(primaryDamageInfo.damageCauserName)
            : this.getReadableDamageCauserName(kill.damageCauserName);

          const distance = primaryDamageInfo?.distance && !isNaN(primaryDamageInfo.distance)
            ? Math.round(primaryDamageInfo.distance / 100)
            : (kill.distance && !isNaN(kill.distance) ? Math.round(kill.distance / 100) : 0);

          const weaponInfo = weapon === 'Unknown Weapon' ? 'melee/environment' : weapon;
          return `\`${matchTime}\` ⚔️ Killed [${victimName}](https://pubg.op.gg/user/${victimName}) (${weaponInfo}, ${distance}m)`;
        }
        if (type === 'knockdown') {
          const knockdown = event as LogPlayerMakeGroggy;
          const victimName = knockdown.victim?.name || 'Unknown Player';

          // Use groggyDamage for more accurate weapon and distance data
          const primaryDamageInfo = knockdown.groggyDamage
            ? DamageInfoUtils.getFirst(knockdown.groggyDamage)
            : null;

          const weapon = primaryDamageInfo?.damageCauserName
            ? this.getReadableDamageCauserName(primaryDamageInfo.damageCauserName)
            : this.getReadableDamageCauserName(knockdown.damageCauserName);

          const distance = primaryDamageInfo?.distance && !isNaN(primaryDamageInfo.distance)
            ? Math.round(primaryDamageInfo.distance / 100)
            : (knockdown.distance && !isNaN(knockdown.distance) ? Math.round(knockdown.distance / 100) : 0);

          const weaponInfo = weapon === 'Unknown Weapon' ? 'melee/environment' : weapon;
          return `\`${matchTime}\` 🔻 Knocked [${victimName}](https://pubg.op.gg/user/${victimName}) (${weaponInfo}, ${distance}m)`;
        }
        if (type === 'revive') {
          const revive = event as LogPlayerRevive;
          const victimName = revive.victim?.name || 'Unknown Player';
          return `\`${matchTime}\` 🚑 Revived [${victimName}](https://pubg.op.gg/user/${victimName})`;
        }
        if (type === 'damage') {
          const damage = event as LogPlayerTakeDamage;
          const weapon = this.getReadableDamageCauserName(damage.damageCauserName);
          const victimName = damage.victim?.name || 'Unknown Player';
          const dmgAmount = damage.damage && !isNaN(damage.damage) ? Math.round(damage.damage) : 0;
          const weaponInfo = weapon === 'Unknown Weapon' ? 'environment' : weapon;
          return `\`${matchTime}\` 💥 Hit [${victimName}](https://pubg.op.gg/user/${victimName}) (${weaponInfo}, ${dmgAmount} dmg)`;
        }
        if (type === 'death') {
          const death = event as LogPlayerKillV2;
          const killerName = death.killer?.name || 'Unknown Player';

          // Use killerDamageInfo for more accurate weapon and distance data
          const primaryDamageInfo = death.killerDamageInfo
            ? DamageInfoUtils.getFirst(death.killerDamageInfo)
            : null;

          const weapon = primaryDamageInfo?.damageCauserName
            ? this.getReadableDamageCauserName(primaryDamageInfo.damageCauserName)
            : this.getReadableDamageCauserName(death.damageCauserName);

          const distance = primaryDamageInfo?.distance && !isNaN(primaryDamageInfo.distance)
            ? Math.round(primaryDamageInfo.distance / 100)
            : (death.distance && !isNaN(death.distance) ? Math.round(death.distance / 100) : 0);

          const weaponInfo = weapon === 'Unknown Weapon' ? 'melee/environment' : weapon;
          return `\`${matchTime}\` ☠️ Killed by [${killerName}](https://pubg.op.gg/user/${killerName}) (${weaponInfo}, ${distance}m)`;
        }
        if (type === 'knocked') {
          const knocked = event as LogPlayerMakeGroggy;
          const attackerName = knocked.attacker?.name || 'Unknown Player';

          // Use groggyDamage for more accurate weapon and distance data
          const primaryDamageInfo = knocked.groggyDamage
            ? DamageInfoUtils.getFirst(knocked.groggyDamage)
            : null;

          const weapon = primaryDamageInfo?.damageCauserName
            ? this.getReadableDamageCauserName(primaryDamageInfo.damageCauserName)
            : this.getReadableDamageCauserName(knocked.damageCauserName);

          const distance = primaryDamageInfo?.distance && !isNaN(primaryDamageInfo.distance)
            ? Math.round(primaryDamageInfo.distance / 100)
            : (knocked.distance && !isNaN(knocked.distance) ? Math.round(knocked.distance / 100) : 0);

          const weaponInfo = weapon === 'Unknown Weapon' ? 'melee/environment' : weapon;
          return `\`${matchTime}\` 🔻 Knocked by [${attackerName}](https://pubg.op.gg/user/${attackerName}) (${weaponInfo}, ${distance}m)`;
        }
        return '';
      })
      .filter(Boolean);

    return timeline.length > 0 ? `**ENHANCED TIMELINE**\n${timeline.join('\n')}` : '';
  }

  /**
   * Converts absolute event timestamp to relative match time in MM:SS format.
   *
   * @param eventTime - ISO timestamp string of the event
   * @param matchStart - Match start time for calculating relative offset
   * @returns Formatted time string (e.g., '05:23' for 5 minutes 23 seconds into match)
   */
  private formatMatchTime(eventTime: string, matchStart: Date): string {
    const eventDate = new Date(eventTime);
    const relativeSeconds = Math.round((eventDate.getTime() - matchStart.getTime()) / 1000);
    const minutes = Math.floor(relativeSeconds / 60);
    const seconds = relativeSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
}
