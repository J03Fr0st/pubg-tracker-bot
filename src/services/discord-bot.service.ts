import {
  type Asset,
  assetManager,
  DAMAGE_CAUSER_NAME,
  GAME_MODES,
  type LogHeal,
  type LogItemUse,
  type LogPlayerKillV2,
  type LogPlayerMakeGroggy,
  type LogPlayerRevive,
  type LogPlayerTakeDamage,
  MAP_NAMES,
  type Participant,
  type Player,
  PubgClient,
  type Roster,
  type Shard,
  type TelemetryEvent,
} from '@j03fr0st/pubg-ts';
import {
  type Channel,
  ChannelType,
  type ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type TextBasedChannel,
} from 'discord.js';
import { appConfig } from '../config/config';
import { MatchRepository } from '../data/repositories/match.repository';
import { PlayerRepository } from '../data/repositories/player.repository';
import { ProcessedMatchRepository } from '../data/repositories/processed-match.repository';
import { TelemetryRepository } from '../data/repositories/telemetry.repository';
import type {
  AssistInfo,
  KillChain,
  MatchAnalysis,
  PlayerAnalysis,
} from '../types/analytics-results.types';
import type { CoachingNarration } from '../types/coaching.types';
import type {
  DiscordMatchGroupSummary,
  DiscordPlayerMatchStats,
} from '../types/discord-match-summary.types';
import { DamageInfoUtils } from '../utils/damage-info.util';
import { debug, error, info, success, warn } from '../utils/logger';
// No longer need custom mappings - using pubg-ts dictionaries
import { MatchColorUtil } from '../utils/match-colors.util';
import {
  calculateOpponentDifficulty,
  type OpponentDifficultyResult,
} from '../utils/match-difficulty.util';
import { CoachingDecisionEngineService } from './coaching-decision-engine.service';
import { CoachingNarratorService } from './coaching-narrator.service';
import { CoachingPipelineService } from './coaching-pipeline.service';
import { FightContextBuilderService } from './fight-context-builder.service';
import { OpenRouterCoachingLlmClient } from './openrouter-coaching-llm-client.service';
import { PlayerStatsService } from './player-stats.service';
import { TelemetryProcessorService } from './telemetry-processor.service';

interface ParticipantMatchStats {
  kills: number;
  damageDealt: number;
  winPlace: number;
}

type SendableTextChannel = TextBasedChannel & {
  send(options: { embeds: EmbedBuilder[] }): Promise<unknown>;
};

interface ChannelPermissionSnapshot {
  has(permission: bigint): boolean;
}

interface ChannelWithPermissionResolver {
  permissionsFor(user: unknown): ChannelPermissionSnapshot | null;
}

const DISCORD_MISSING_ACCESS = 50001;
const DISCORD_MISSING_PERMISSIONS = 50013;

export class DiscordBotService {
  private readonly client: Client;
  private readonly playerRepository = new PlayerRepository();
  private readonly processedMatchRepository = new ProcessedMatchRepository();
  private readonly matchRepository = new MatchRepository();
  private readonly telemetryRepository = new TelemetryRepository();
  private readonly pubgClient: PubgClient;
  private readonly playerStatsService: PlayerStatsService;
  private readonly telemetryProcessor: TelemetryProcessorService;
  private readonly coachingPipeline: CoachingPipelineService;
  private coachingNarrator: CoachingNarratorService;
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
    new SlashCommandBuilder()
      .setName('processmatch')
      .setDescription('Process and display a specific match by matchId')
      .addStringOption((option) =>
        option
          .setName('matchid')
          .setDescription('The matchId of the match to process')
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
    this.pubgClient = new PubgClient({
      apiKey,
      shard: shard as any, // Cast to handle type compatibility
    });
    this.playerStatsService = new PlayerStatsService(this.pubgClient, shard);
    this.telemetryProcessor = new TelemetryProcessorService();
    const llmClient =
      appConfig.llm.coachingEnabled &&
      appConfig.llm.openRouterApiKey &&
      appConfig.llm.openRouterModel
        ? new OpenRouterCoachingLlmClient({
            apiKey: appConfig.llm.openRouterApiKey,
            model: appConfig.llm.openRouterModel,
            timeoutMs: appConfig.llm.timeoutMs,
          })
        : undefined;
    this.coachingNarrator = new CoachingNarratorService(llmClient, {
      enabled: Boolean(llmClient),
      maxLineLength: 240,
    });
    this.coachingPipeline = CoachingPipelineService.withDefaults({
      fightContextBuilder: new FightContextBuilderService(),
      decisionEngine: new CoachingDecisionEngineService(),
      narrate: (insights) => this.coachingNarrator.narrate(insights),
    });
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
    const channel = await this.fetchTextChannel(channelId);

    // Create basic match summary embeds
    const basicEmbeds = await this.createMatchSummaryEmbeds(summary);
    if (!basicEmbeds || !basicEmbeds.length) {
      error('No embeds were created for match summary');
      return;
    }

    // Send basic match summary only
    for (const embed of basicEmbeds) {
      try {
        await channel.send({ embeds: [embed] });
      } catch (err) {
        this.throwDiscordChannelAccessError(channelId, err, channel);
      }
    }
  }

  public async validateChannelAccess(channelId: string): Promise<void> {
    await this.fetchTextChannel(channelId);
  }

  private async fetchTextChannel(channelId: string): Promise<SendableTextChannel> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel) {
        throw new Error(`Could not find channel with ID ${channelId}`);
      }

      if (!channel.isTextBased()) {
        throw new Error(
          `Configured Discord channel ${channelId} is not a text-based channel. Resolved type=${channel.type}.`
        );
      }

      if (channel.type !== ChannelType.GuildText) {
        throw new Error(
          `Configured Discord channel ${channelId} must be a normal guild text channel. Resolved type=${channel.type}.`
        );
      }

      if (typeof (channel as { send?: unknown }).send !== 'function') {
        throw new Error(
          `Configured Discord channel ${channelId} is text-based but does not support sending messages. Resolved type=${channel.type}.`
        );
      }

      const sendableChannel = channel as SendableTextChannel;
      this.throwIfMissingRequiredChannelPermissions(channelId, sendableChannel);

      return sendableChannel;
    } catch (err) {
      this.throwDiscordChannelAccessError(channelId, err);
    }
  }

  private throwIfMissingRequiredChannelPermissions(
    channelId: string,
    channel: SendableTextChannel
  ): void {
    const missingPermissions = this.getMissingRequiredChannelPermissions(channel);
    if (missingPermissions.length === 0) {
      return;
    }

    throw new Error(
      `Discord bot is missing required channel permissions for ${channelId}: ${missingPermissions.join(', ')}. ${this.formatDiscordChannelDiagnostics(channel)}`
    );
  }

  private getMissingRequiredChannelPermissions(channel: SendableTextChannel): string[] {
    const permissions = this.getBotChannelPermissions(channel);
    if (!permissions) {
      return [];
    }

    const requiredPermissions = [
      ['ViewChannel', PermissionFlagsBits.ViewChannel],
      ['SendMessages', PermissionFlagsBits.SendMessages],
      ['EmbedLinks', PermissionFlagsBits.EmbedLinks],
    ] as const;

    return requiredPermissions
      .filter(([, permission]) => !permissions.has(permission))
      .map(([name]) => name);
  }

  private throwDiscordChannelAccessError(
    channelId: string,
    err: unknown,
    channel?: Channel | TextBasedChannel | SendableTextChannel
  ): never {
    if (this.isDiscordAccessError(err)) {
      throw new Error(
        `Discord bot cannot access channel ${channelId}. ${[
          this.formatDiscordError(err),
          this.formatDiscordChannelDiagnostics(channel),
        ]
          .filter(Boolean)
          .join(' ')}`
      );
    }

    throw err;
  }

  private isDiscordAccessError(err: unknown): boolean {
    if (!err || typeof err !== 'object') {
      return false;
    }

    const code = (err as { code?: unknown }).code;
    return code === DISCORD_MISSING_ACCESS || code === DISCORD_MISSING_PERMISSIONS;
  }

  private formatDiscordError(err: unknown): string {
    const discordError = err as { code?: unknown; message?: unknown };
    const code = discordError.code ? `${discordError.code}` : 'unknown';
    const message =
      typeof discordError.message === 'string' && discordError.message
        ? discordError.message
        : 'Unknown Discord error';

    return `Discord error ${code} ${message}.`;
  }

  private formatDiscordChannelDiagnostics(channel?: Channel | TextBasedChannel): string {
    const botUser = this.client.user;
    const channelLike = channel as
      | {
          id?: string;
          name?: string;
          guild?: { id?: string; name?: string };
          permissionsFor?: unknown;
          type?: unknown;
        }
      | undefined;

    const bot = botUser ? `Bot=${botUser.tag ?? 'unknown'} (${botUser.id}).` : 'Bot=not logged in.';
    const channelInfo = channelLike
      ? `Channel=#${channelLike.name ?? 'unknown'} (${channelLike.id ?? 'unknown'}, type=${channelLike.type ?? 'unknown'}).`
      : 'Channel=unresolved.';
    const guildInfo = channelLike?.guild
      ? `Guild=${channelLike.guild.name ?? 'unknown'} (${channelLike.guild.id ?? 'unknown'}).`
      : 'Guild=unknown.';

    return `${bot} ${channelInfo} ${guildInfo} ${this.formatBotChannelPermissions(channelLike)}`;
  }

  private getBotChannelPermissions(channel?: unknown): ChannelPermissionSnapshot | null {
    if (!this.hasPermissionResolver(channel) || !this.client.user) {
      return null;
    }

    return channel.permissionsFor(this.client.user);
  }

  private hasPermissionResolver(channel: unknown): channel is ChannelWithPermissionResolver {
    return (
      !!channel &&
      typeof channel === 'object' &&
      typeof (channel as { permissionsFor?: unknown }).permissionsFor === 'function'
    );
  }

  private formatBotChannelPermissions(channel?: unknown): string {
    try {
      const permissions = this.getBotChannelPermissions(channel);
      if (!permissions) {
        return 'Permissions: unknown.';
      }

      const checks = [
        ['ViewChannel', PermissionFlagsBits.ViewChannel],
        ['SendMessages', PermissionFlagsBits.SendMessages],
        ['SendMessagesInThreads', PermissionFlagsBits.SendMessagesInThreads],
        ['EmbedLinks', PermissionFlagsBits.EmbedLinks],
        ['ReadMessageHistory', PermissionFlagsBits.ReadMessageHistory],
      ] as const;

      return `Permissions: ${checks
        .map(([name, permission]) => `${name}=${permissions.has(permission) ? 'yes' : 'no'}`)
        .join(', ')}.`;
    } catch (err) {
      return `Permissions: unavailable (${(err as Error).message}).`;
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
          case 'processmatch':
            await this.handleProcessMatch(interaction);
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

      await this.playerRepository.savePlayer({
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
      await this.playerRepository.removePlayer(playerName);
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
    const players = await this.playerRepository.getAllPlayers();

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
      const lastMatch = await this.processedMatchRepository.getLastProcessedMatch();

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
      const removedMatchId = await this.processedMatchRepository.removeLastProcessedMatch();

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
      const deleted = await this.processedMatchRepository.removeProcessedMatch(matchId);
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

  private async handleProcessMatch(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    const userName = interaction.user.username;
    const matchId = interaction.options.getString('matchid', true);
    debug(`User ${userName} requested to process match ${matchId}`);

    try {
      // Fetch match details from PUBG API
      const matchDetails = await this.pubgClient.matches.getMatch(matchId);
      debug(`Successfully fetched match details for ${matchId}`);

      // Get all monitored players to find any that participated in this match
      const monitoredPlayers = await this.playerRepository.getAllPlayers();
      const monitoredPlayerNames = monitoredPlayers.map((p) => p.name);

      // Extract participants from match details
      const participants = matchDetails.included.filter(
        (item): item is Participant =>
          item.type === 'participant' && 'attributes' in item && 'stats' in item.attributes
      );

      // Find which monitored players are in this match
      const matchingPlayers = participants.filter((p) =>
        monitoredPlayerNames.includes(p.attributes.stats?.name || '')
      );

      if (matchingPlayers.length === 0) {
        const noPlayersEmbed = new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle('⚠️ No Monitored Players Found')
          .setDescription('None of your monitored players participated in this match.')
          .addFields({ name: 'Match ID', value: matchId, inline: true })
          .setTimestamp()
          .setFooter({ text: 'PUBG Tracker Bot' });
        await interaction.editReply({ embeds: [noPlayersEmbed] });
        return;
      }

      debug(`Found ${matchingPlayers.length} monitored players in match ${matchId}`);

      // Create match summary using the same logic as the monitor service
      const summary = await this.createMatchSummaryFromMatchDetails(matchDetails, matchingPlayers);

      if (summary) {
        // Send the match summary as a reply
        const embeds = await this.createMatchSummaryEmbeds(summary);

        if (embeds && embeds.length > 0) {
          // Send embeds in batches to avoid hitting Discord limits
          for (let i = 0; i < embeds.length; i += 10) {
            const batch = embeds.slice(i, i + 10);
            if (i === 0) {
              await interaction.editReply({ embeds: batch });
            } else {
              await interaction.followUp({ embeds: batch });
            }
          }

          success(`Successfully processed match ${matchId} for user ${userName}`);
        } else {
          throw new Error('Failed to create match summary embeds');
        }
      } else {
        throw new Error('Failed to create match summary');
      }
    } catch (err) {
      const errorObj = err as Error;
      error(`Error processing match ${matchId} for user ${userName}: ${errorObj.message}`);
      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Error Processing Match')
        .setDescription('Failed to process the specified match.')
        .addFields(
          { name: 'Match ID', value: matchId, inline: true },
          { name: 'Error Details', value: errorObj.message.slice(0, 1000), inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'PUBG Tracker Bot' });
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  private async createMatchSummaryFromMatchDetails(
    matchDetails: any,
    matchingPlayers: Participant[]
  ): Promise<DiscordMatchGroupSummary | null> {
    try {
      const playerStats: DiscordPlayerMatchStats[] = [];
      let teamRank: number | undefined;

      // Extract rosters from match details
      const rosters = matchDetails.included.filter(
        (item: any): item is Roster =>
          item.type === 'roster' &&
          'relationships' in item &&
          !!item.relationships?.participants?.data
      );

      // Extract all participants for roster lookups
      const allParticipants = matchDetails.included.filter(
        (item: any): item is Participant =>
          item.type === 'participant' && 'attributes' in item && 'stats' in item.attributes
      );

      for (const participant of matchingPlayers) {
        if (teamRank === undefined) {
          teamRank = participant.attributes.stats.winPlace;
        } else if (teamRank !== participant.attributes.stats.winPlace) {
          teamRank = undefined;
        }

        // Find all players in the same roster as the current player
        const roster = rosters.find((r: Roster) =>
          r.relationships?.participants?.data?.some((p: { id: string }) => p.id === participant.id)
        );

        if (roster) {
          const rosterParticipantIds =
            roster.relationships?.participants?.data?.map((p: { id: string }) => p.id) || [];
          const rosterParticipants = allParticipants.filter(
            (p: Participant) => rosterParticipantIds.includes(p.id) && p.attributes.stats
          );

          for (const rosterParticipant of rosterParticipants) {
            if (!playerStats.some((p) => p.name === rosterParticipant.attributes.stats.name)) {
              playerStats.push({
                name: rosterParticipant.attributes.stats.name,
                pubgId: rosterParticipant.attributes.stats.playerId,
                stats: rosterParticipant.attributes.stats,
              });
            }
          }
        } else {
          // If no roster found, just add the current player
          playerStats.push({
            name: participant.attributes.stats.name,
            pubgId: participant.attributes.stats.playerId,
            stats: participant.attributes.stats,
          });
        }
      }

      // Get telemetry URL from assets
      const telemetryAsset = matchDetails.included?.find(
        (item: any): item is Asset => item.type === 'asset'
      );

      // Get the telemetry URL from the asset
      const telemetryUrl = telemetryAsset?.attributes.URL || '';

      return {
        matchId: matchDetails.data.id,
        mapName: matchDetails.data.attributes.mapName,
        gameMode: matchDetails.data.attributes.gameMode,
        playedAt: matchDetails.data.attributes.createdAt,
        players: playerStats,
        teamRank,
        telemetryUrl,
      };
    } catch (err) {
      error('Error creating match summary from match details:', err as Error);
      return null;
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

    const mainDescriptionLines = [
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
    ];

    const mainEmbed = new EmbedBuilder()
      .setTitle('🎮 PUBG Match Summary')
      .setDescription(mainDescriptionLines.join('\n'))
      .setColor(matchColor)
      .setFooter({ text: `PUBG Match Tracker - ${matchId}` })
      .setTimestamp(matchDate);

    if (!summary.telemetryUrl) {
      debug('No telemetry URL available, using basic player embeds');
      return [mainEmbed, ...this.createBasicPlayerEmbeds(players, matchColor, matchId)];
    }

    try {
      // Check DB cache first
      try {
        const cached = await this.telemetryRepository.getCachedAnalyses(matchId);
        if (cached) {
          debug(`Using cached telemetry analysis for match ${matchId}`);
          const matchAnalysis: MatchAnalysis = {
            matchId,
            playerAnalyses: new Map(
              Object.entries(cached).map(([name, analysis]) => [name, analysis as PlayerAnalysis])
            ),
            processingTimeMs: 0,
            totalEventsProcessed: 0,
          };

          // Build participant stats map from DB
          const matchData = await this.matchRepository.findMatch(matchId);
          const participantStatsMap = new Map<string, ParticipantMatchStats>();
          if (matchData?.participants) {
            for (const p of matchData.participants) {
              participantStatsMap.set(p.pubgId, {
                kills: p.kills,
                damageDealt: p.damageDealt,
                winPlace: p.winPlace,
              });
            }
          }

          const seasonStats = await this.applyOpponentDifficulty(
            mainEmbed,
            mainDescriptionLines,
            matchAnalysis,
            players,
            summary.gameMode
          );

          const enhancedPlayerEmbeds = players.map((player) => {
            const analysis = matchAnalysis.playerAnalyses.get(player.name);
            return analysis
              ? this.createEnhancedPlayerEmbed(
                  player,
                  analysis,
                  matchColor,
                  matchId,
                  participantStatsMap,
                  seasonStats
                )
              : this.createBasicPlayerEmbed(player, matchColor, matchId);
          });
          return [mainEmbed, ...enhancedPlayerEmbeds];
        }
      } catch (cacheErr) {
        debug(`Cache lookup failed, falling back to live fetch: ${cacheErr}`);
      }

      // Fetch raw telemetry data
      const telemetryData = await this.pubgClient.telemetry.getTelemetryData(summary.telemetryUrl);
      const trackedPlayerNames = players.map((p) => p.name);

      debug(`Processing telemetry for ${trackedPlayerNames.length} players`);
      // Process using our new service
      const matchAnalysis = await this.telemetryProcessor.processMatchTelemetry(
        telemetryData, // Raw TelemetryEvent[] - no conversion needed!
        matchId,
        matchDate,
        trackedPlayerNames
      );

      // Save to DB cache (non-blocking)
      const analysesObj: Record<string, unknown> = {};
      for (const [name, analysis] of matchAnalysis.playerAnalyses) {
        analysesObj[name] = analysis;
      }
      this.telemetryRepository
        .saveTelemetry(matchId, telemetryData, analysesObj)
        .catch((err) => debug(`Failed to cache telemetry for ${matchId}: ${err}`));

      // Build participant stats map from DB
      const matchData = await this.matchRepository.findMatch(matchId);
      const participantStatsMap = new Map<string, ParticipantMatchStats>();
      if (matchData?.participants) {
        for (const p of matchData.participants) {
          participantStatsMap.set(p.pubgId, {
            kills: p.kills,
            damageDealt: p.damageDealt,
            winPlace: p.winPlace,
          });
        }
      }

      const seasonStats = await this.applyOpponentDifficulty(
        mainEmbed,
        mainDescriptionLines,
        matchAnalysis,
        players,
        summary.gameMode
      );

      // Create enhanced embeds
      const enhancedPlayerEmbeds = players.map((player) => {
        const analysis = matchAnalysis.playerAnalyses.get(player.name);
        return analysis
          ? this.createEnhancedPlayerEmbed(
              player,
              analysis,
              matchColor,
              matchId,
              participantStatsMap,
              seasonStats
            )
          : this.createBasicPlayerEmbed(player, matchColor, matchId);
      });

      const coachingEmbeds = await this.createCoachingEmbeds(
        matchAnalysis,
        trackedPlayerNames,
        telemetryData,
        matchColor
      );

      success(`Created enhanced embeds for ${enhancedPlayerEmbeds.length} players`);
      return [mainEmbed, ...enhancedPlayerEmbeds, ...coachingEmbeds];
    } catch (err) {
      error(`Telemetry processing failed: ${(err as Error).message}`);
      // Fallback to basic embeds
      return [mainEmbed, ...this.createBasicPlayerEmbeds(players, matchColor, matchId)];
    }
  }

  private async createCoachingEmbeds(
    matchAnalysis: MatchAnalysis,
    trackedPlayerNames: string[],
    telemetryData: TelemetryEvent[],
    matchColor: number
  ): Promise<EmbedBuilder[]> {
    const damageEvents = telemetryData.filter(
      (event) => event._T === 'LogPlayerTakeDamage'
    ) as LogPlayerTakeDamage[];
    const resetEvents = telemetryData.filter(
      (event) => event._T === 'LogHeal' || event._T === 'LogItemUse'
    ) as Array<LogHeal | LogItemUse>;

    const result = await this.coachingPipeline.run(
      matchAnalysis,
      trackedPlayerNames,
      damageEvents,
      resetEvents
    );

    if (result.kind === 'empty') {
      return [];
    }
    if (result.kind === 'failed') {
      error(`Coaching pipeline failed at ${result.stage}: ${result.reason}`);
      return [];
    }
    return this.buildCoachingEmbeds(result.narration, matchColor);
  }

  private buildCoachingEmbeds(narration: CoachingNarration, matchColor: number): EmbedBuilder[] {
    if (narration.sections.length === 0) {
      return [];
    }

    const maxDescriptionLength = 3900;
    const sectionBlocks = narration.sections
      .map((section) => this.formatCoachingSection(section))
      .filter((section) => section.trim().length > 0);

    const descriptions: string[] = [];
    let currentDescription = '';

    for (const sectionBlock of sectionBlocks) {
      const nextDescription = currentDescription
        ? `${currentDescription}\n\n${sectionBlock}`
        : sectionBlock;

      if (nextDescription.length <= maxDescriptionLength) {
        currentDescription = nextDescription;
        continue;
      }

      if (currentDescription) {
        descriptions.push(currentDescription);
      }
      currentDescription =
        sectionBlock.length <= maxDescriptionLength
          ? sectionBlock
          : `${sectionBlock.slice(0, maxDescriptionLength - 3)}...`;
    }

    if (currentDescription) {
      descriptions.push(currentDescription);
    }

    if (descriptions.length === 0) {
      return [];
    }

    return descriptions.map((description, index) =>
      new EmbedBuilder()
        .setTitle(index === 0 ? 'Coaching' : `Coaching (${index + 1})`)
        .setDescription(description)
        .setColor(matchColor)
    );
  }

  private formatCoachingSection(section: CoachingNarration['sections'][number]): string {
    const title = section.title ? `${section.playerName} - ${section.title}` : section.playerName;
    return [`**${title}**`, ...section.lines].join('\n');
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

    // Common weapon mappings for cases not covered by pubg-ts
    const commonWeapons: Record<string, string> = {
      WeapMk12_C: 'Mk12',
      WeapMini14_C: 'Mini 14',
      WeapAK47_C: 'AKM',
      WeapM416_C: 'M416',
      WeapSCAR_C: 'SCAR-L',
      WeapM16A4_C: 'M16A4',
      WeapKar98k_C: 'Kar98k',
      WeapAWM_C: 'AWM',
      WeapM24_C: 'M24',
      WeapWin94_C: 'Winchester',
      WeapUMP_C: 'UMP45',
      WeapVector_C: 'Vector',
      WeapTommyGun_C: 'Tommy Gun',
      WeapP18C_C: 'P18C',
      WeapP92_C: 'P92',
      WeapP1911_C: 'P1911',
      WeapSawnoff_C: 'Sawed-off',
      WeapS12K_C: 'S12K',
      WeapS1897_C: 'S1897',
      WeapS686_C: 'S686',
      WeapDP27_C: 'DP-27',
      WeapM249_C: 'M249',
      WeapMG3_C: 'MG3',
    };

    if (commonWeapons[weaponCode]) {
      return commonWeapons[weaponCode];
    }

    // Final fallback: format the weapon code
    const formatted = weaponCode
      .replace(/^Weap/, '')
      .replace(/_C$/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim();

    return formatted || 'Unknown Weapon';
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

  private formatPlayerTitle(player: DiscordPlayerMatchStats): string {
    return `Player: ${player.name}`;
  }

  private createBasicPlayerEmbeds(
    players: DiscordPlayerMatchStats[],
    matchColor: number,
    matchId: string
  ): EmbedBuilder[] {
    return players.map((player) => this.createBasicPlayerEmbed(player, matchColor, matchId));
  }

  private createBasicPlayerEmbed(
    player: DiscordPlayerMatchStats,
    matchColor: number,
    matchId: string
  ): EmbedBuilder {
    const { stats } = player;
    if (!stats) {
      return new EmbedBuilder()
        .setTitle(this.formatPlayerTitle(player))
        .setDescription('No stats available')
        .setColor(matchColor);
    }

    const survivalMinutes = Math.round(stats.timeSurvived / 60);
    const kmWalked = (stats.walkDistance / 1000).toFixed(1);
    const accuracy =
      stats.kills > 0 && stats.headshotKills > 0
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
    ]
      .filter(Boolean)
      .join('\n');

    return new EmbedBuilder()
      .setTitle(this.formatPlayerTitle(player))
      .setDescription(basicStats)
      .setColor(matchColor);
  }

  /**
   * Collects encountered opponents, fetches their season stats, and appends
   * the opponent-difficulty line to the main embed when usable. Returns the
   * season-stats map (or undefined) for downstream per-player enrichment.
   */
  private async applyOpponentDifficulty(
    mainEmbed: EmbedBuilder,
    mainDescriptionLines: string[],
    matchAnalysis: MatchAnalysis,
    players: DiscordPlayerMatchStats[],
    gameMode: string
  ): Promise<Map<string, { kd: number; adr: number }> | undefined> {
    const opponentAccountIds = this.collectOpponentAccountIds(matchAnalysis, players);
    if (opponentAccountIds.length === 0) {
      info('Opponent difficulty skipped: no opponent account IDs found', {
        matchId: matchAnalysis.matchId,
        gameMode,
        trackedPlayers: players.map((player) => player.name),
      });
      return undefined;
    }

    info('Opponent difficulty found opponent account IDs', {
      matchId: matchAnalysis.matchId,
      gameMode,
      opponentCount: opponentAccountIds.length,
      opponentAccountIds,
    });

    let seasonStats: Map<string, { kd: number; adr: number }> | undefined;
    try {
      seasonStats = await this.playerStatsService.getSeasonStats(opponentAccountIds, gameMode);
    } catch (err) {
      warn(`Opponent difficulty failed to fetch season stats: ${err}`);
    }

    if (seasonStats) {
      info('Opponent difficulty received season stats', {
        matchId: matchAnalysis.matchId,
        requestedOpponents: opponentAccountIds.length,
        seasonStatsCount: seasonStats.size,
        missingAccountIds: opponentAccountIds.filter((id) => !seasonStats.has(id)),
      });

      const difficulty = calculateOpponentDifficulty(opponentAccountIds, seasonStats);
      if (difficulty) {
        const difficultyLine = this.formatOpponentDifficulty(difficulty);
        const existingDifficultyLineIndex = mainDescriptionLines.findIndex((line) =>
          line.startsWith('Opponent Difficulty:')
        );
        if (existingDifficultyLineIndex >= 0) {
          mainDescriptionLines[existingDifficultyLineIndex] = difficultyLine;
        } else {
          mainDescriptionLines.push(difficultyLine);
        }
        mainEmbed.setDescription(mainDescriptionLines.join('\n'));
        info('Opponent difficulty rendered', {
          matchId: matchAnalysis.matchId,
          score: difficulty.score,
          label: difficulty.label,
          opponentCount: difficulty.opponentCount,
        });
      } else {
        warn('Opponent difficulty skipped: no usable season stats', {
          matchId: matchAnalysis.matchId,
          requestedOpponents: opponentAccountIds.length,
          seasonStatsCount: seasonStats.size,
        });
      }
    }

    return seasonStats;
  }

  /**
   * Collects unique opponent accountIds encountered by the tracked squad.
   *
   * Walks the per-player telemetry analyses (kills, deaths, knockdowns,
   * knocked-down events) and gathers the opposing players' accountIds while
   * excluding any accountId that belongs to a tracked squad member.
   */
  private collectOpponentAccountIds(
    matchAnalysis: MatchAnalysis,
    players: DiscordPlayerMatchStats[]
  ): string[] {
    const trackedAccountIds = new Set(
      players.map((player) => player.pubgId).filter((id): id is string => Boolean(id))
    );
    const opponentAccountIds = new Set<string>();

    const addOpponent = (accountId?: string) => {
      if (!accountId || trackedAccountIds.has(accountId)) return;
      opponentAccountIds.add(accountId);
    };

    for (const player of players) {
      const analysis = matchAnalysis.playerAnalyses.get(player.name);
      if (!analysis) continue;
      for (const event of analysis.killEvents) addOpponent(event.victim?.accountId);
      for (const event of analysis.deathEvents) addOpponent(event.killer?.accountId);
      for (const event of analysis.knockdownEvents) addOpponent(event.victim?.accountId);
      for (const event of analysis.knockedDownEvents) addOpponent(event.attacker?.accountId);
    }

    return Array.from(opponentAccountIds);
  }

  /**
   * Formats an opponent difficulty result into a main-summary description line.
   */
  private formatOpponentDifficulty(difficulty: OpponentDifficultyResult): string {
    const opponentWord = difficulty.opponentCount === 1 ? 'opponent' : 'opponents';
    return `Opponent Difficulty: **${difficulty.label}** (${difficulty.score}/100, ${difficulty.opponentCount} ${opponentWord})`;
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
    matchId: string,
    participantStats: Map<string, ParticipantMatchStats>,
    seasonStats?: Map<string, { kd: number; adr: number }>
  ): EmbedBuilder {
    const statsDescription = this.formatEnhancedStats(
      player,
      analysis,
      matchId,
      participantStats,
      seasonStats
    );

    return new EmbedBuilder()
      .setTitle(this.formatPlayerTitle(player))
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
    matchId: string,
    participantStats: Map<string, ParticipantMatchStats>,
    seasonStats?: Map<string, { kd: number; adr: number }>
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
      this.formatEnhancedTimeline(analysis, participantStats, seasonStats),

      // Basic info
      `⏰ Survival: ${Math.round(stats.timeSurvived / 60)}min • ${(stats.walkDistance / 1000).toFixed(1)}km`,
      `🎯 [2D Replay](https://pubg.sh/${player.name}/steam/${matchId})`,
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
      '⚔️ **COMBAT STATS**',
      `🎯 Kills: **${stats.kills}** (${stats.headshotKills} HS)`,
      `💀 K/D Ratio: **${analysis.kdRatio.toFixed(2)}**`,
      `💥 Damage Dealt: **${analysis.totalDamageDealt.toFixed(0)}**`,
      `🩸 Damage Taken: **${analysis.totalDamageTaken.toFixed(0)}**`,
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

    const multiKills = chains.reduce(
      (counts, chain) => {
        const killCount = chain.kills.length;
        if (killCount === 2) counts.doubles++;
        else if (killCount === 3) counts.triples++;
        else if (killCount >= 4) counts.quads++;
        return counts;
      },
      { doubles: 0, triples: 0, quads: 0 }
    );

    const elements = [];
    if (bestChain.kills.length >= 2) {
      elements.push(
        `🔥 Best: **${bestChain.kills.length} kills** (${bestChain.duration.toFixed(1)}s)`
      );
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

    const assistTypes = assists.reduce(
      (counts, assist) => {
        counts[assist.assistType]++;
        return counts;
      },
      { damage: 0, knockdown: 0, both: 0 } as Record<string, number>
    );

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
  private formatEnhancedTimeline(
    analysis: PlayerAnalysis,
    participantStats: Map<string, ParticipantMatchStats>,
    seasonStats?: Map<string, { kd: number; adr: number }>
  ): string {
    // Filter out events without valid timestamps
    const validKills = analysis.killEvents.filter((k) => k._D);
    const validKnockdowns = analysis.knockdownEvents.filter((k) => k._D);
    const validRevives = analysis.reviveEvents.filter((r) => r._D);
    // Include player's own deaths and knockdowns
    const validDeaths = analysis.deathEvents.filter((k) => k._D);
    const validKnockedDown = analysis.knockedDownEvents.filter((k) => k._D);

    // PRIORITIZE KILLS - they're the most important events
    const priorityEvents = [
      ...validKills.map((k) => ({ type: 'kill', event: k, time: new Date(k._D!), priority: 1 })),
      ...validKnockdowns.map((k) => ({
        type: 'knockdown',
        event: k,
        time: new Date(k._D!),
        priority: 2,
      })),
      ...validDeaths.map((k) => ({ type: 'death', event: k, time: new Date(k._D!), priority: 2 })),
      ...validKnockedDown.map((k) => ({
        type: 'knocked',
        event: k,
        time: new Date(k._D!),
        priority: 3,
      })),
      ...validRevives.map((r) => ({
        type: 'revive',
        event: r,
        time: new Date(r._D!),
        priority: 4,
      })),
    ]
      .sort((a, b) => {
        // Sort by time only - chronological order tells the real story
        return a.time.getTime() - b.time.getTime();
      })
      .slice(0, 100); // Show up to 25 events to include kills AND knockdowns

    if (!priorityEvents.length) return '';

    const formatTeamTag = (teamId?: number): string => {
      if (teamId == null) return '';
      return ` [T${teamId}]`;
    };

    const formatInlineStats = (accountId?: string): string => {
      if (!accountId) return '';
      const match = participantStats.get(accountId);
      if (!match) return '';
      let str = ` — ${match.kills}K / ${Math.round(match.damageDealt)}dmg / #${match.winPlace}`;
      const season = seasonStats?.get(accountId);
      if (season) {
        str += ` | ${season.kd} K/D, ${season.adr} ADR`;
      }
      return str;
    };

    const timeline = priorityEvents
      .map(({ type, event }) => {
        const matchTime = this.formatMatchTime(event._D!, analysis.matchStartTime);
        if (type === 'kill') {
          const kill = event as LogPlayerKillV2;
          const victimName = kill.victim?.name || 'Unknown Player';

          let weapon = 'Unknown Weapon';
          let distance = 0;

          // Use DamageInfoUtils to handle flexible type
          const damageInfo = kill.killerDamageInfo
            ? DamageInfoUtils.getFirst(kill.killerDamageInfo)
            : null;

          if (damageInfo && damageInfo.damageCauserName) {
            weapon = this.getReadableDamageCauserName(damageInfo.damageCauserName);
          }
          // Fallback to direct property
          else if (kill.damageCauserName) {
            weapon = this.getReadableDamageCauserName(kill.damageCauserName);
          }

          // Get distance - prioritize damage info
          if (damageInfo && damageInfo.distance && !Number.isNaN(damageInfo.distance)) {
            distance = Math.round(damageInfo.distance / 100);
          } else if (kill.distance && !Number.isNaN(kill.distance)) {
            distance = Math.round(kill.distance / 100);
          }

          const safeVictimName = this.sanitizePlayerNameForDiscord(victimName);
          const teamTag = formatTeamTag(kill.victim?.teamId);
          const statsStr = formatInlineStats(kill.victim?.accountId);
          return `\`${matchTime}\` ⚔️ Killed [${safeVictimName}](https://pubg.op.gg/user/${encodeURIComponent(victimName)})${teamTag} (${weapon}, ${distance}m)${statsStr}`;
        }
        if (type === 'knockdown') {
          const knockdown = event as LogPlayerMakeGroggy;
          const victimName = knockdown.victim?.name || 'Unknown Player';

          let weapon = 'Unknown Weapon';
          let distance = 0;

          // Use DamageInfoUtils for groggyDamage too
          const groggyInfo = knockdown.groggyDamage
            ? DamageInfoUtils.getFirst(knockdown.groggyDamage)
            : null;

          if (groggyInfo && groggyInfo.damageCauserName) {
            weapon = this.getReadableDamageCauserName(groggyInfo.damageCauserName);
            if (groggyInfo.distance && !Number.isNaN(groggyInfo.distance)) {
              distance = Math.round(groggyInfo.distance / 100);
            }
          }
          // Fallback to direct properties
          else if (knockdown.damageCauserName) {
            weapon = this.getReadableDamageCauserName(knockdown.damageCauserName);
            if (knockdown.distance && !Number.isNaN(knockdown.distance)) {
              distance = Math.round(knockdown.distance / 100);
            }
          }

          const safeVictimName = this.sanitizePlayerNameForDiscord(victimName);
          const teamTag = formatTeamTag(knockdown.victim?.teamId);
          const statsStr = formatInlineStats(knockdown.victim?.accountId);
          return `\`${matchTime}\` 🔻 Knocked [${safeVictimName}](https://pubg.op.gg/user/${encodeURIComponent(victimName)})${teamTag} (${weapon}, ${distance}m)${statsStr}`;
        }
        if (type === 'revive') {
          const revive = event as LogPlayerRevive;
          const victimName = revive.victim?.name || 'Unknown Player';
          const safeVictimName = this.sanitizePlayerNameForDiscord(victimName);
          return `\`${matchTime}\` 🚑 Revived [${safeVictimName}](https://pubg.op.gg/user/${encodeURIComponent(victimName)})`;
        }

        if (type === 'death') {
          const death = event as LogPlayerKillV2;
          const killerName = death.killer?.name || 'Unknown Player';

          // Try multiple sources for weapon information
          let weapon = 'Unknown Weapon';
          let distance = 0;

          const primaryDamageInfo = death.killerDamageInfo
            ? DamageInfoUtils.getFirst(death.killerDamageInfo)
            : null;

          if (primaryDamageInfo?.damageCauserName) {
            weapon = this.getReadableDamageCauserName(primaryDamageInfo.damageCauserName);
            if (primaryDamageInfo.distance && !Number.isNaN(primaryDamageInfo.distance)) {
              distance = Math.round(primaryDamageInfo.distance / 100);
            }
          } else if (death.damageCauserName) {
            weapon = this.getReadableDamageCauserName(death.damageCauserName);
            if (death.distance && !Number.isNaN(death.distance)) {
              distance = Math.round(death.distance / 100);
            }
          }

          const safeKillerName = this.sanitizePlayerNameForDiscord(killerName);
          const teamTag = formatTeamTag(death.killer?.teamId);
          const statsStr = formatInlineStats(death.killer?.accountId);
          return `\`${matchTime}\` ☠️ Killed by [${safeKillerName}](https://pubg.op.gg/user/${encodeURIComponent(killerName)})${teamTag} (${weapon}, ${distance}m)${statsStr}`;
        }
        if (type === 'knocked') {
          const knocked = event as LogPlayerMakeGroggy;
          const attackerName = knocked.attacker?.name || 'Unknown Player';

          // Try multiple sources for weapon information
          let weapon = 'Unknown Weapon';
          let distance = 0;

          const primaryDamageInfo = knocked.groggyDamage
            ? DamageInfoUtils.getFirst(knocked.groggyDamage)
            : null;

          if (primaryDamageInfo?.damageCauserName) {
            weapon = this.getReadableDamageCauserName(primaryDamageInfo.damageCauserName);
            if (primaryDamageInfo.distance && !Number.isNaN(primaryDamageInfo.distance)) {
              distance = Math.round(primaryDamageInfo.distance / 100);
            }
          } else if (knocked.damageCauserName) {
            weapon = this.getReadableDamageCauserName(knocked.damageCauserName);
            if (knocked.distance && !Number.isNaN(knocked.distance)) {
              distance = Math.round(knocked.distance / 100);
            }
          }

          const safeAttackerName = this.sanitizePlayerNameForDiscord(attackerName);
          const teamTag = formatTeamTag(knocked.attacker?.teamId);
          const statsStr = formatInlineStats(knocked.attacker?.accountId);
          return `\`${matchTime}\` 🔻 Knocked by [${safeAttackerName}](https://pubg.op.gg/user/${encodeURIComponent(attackerName)})${teamTag} (${weapon}, ${distance}m)${statsStr}`;
        }
        return '';
      })
      .filter(Boolean);

    return timeline.length > 0 ? `**TIMELINE**\n${timeline.join('\n')}` : '';
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

  /**
   * Sanitizes player names for Discord markdown links.
   *
   * Removes or escapes characters that can break Discord's markdown link syntax,
   * ensuring all player names display as clickable links.
   *
   * @param playerName - Raw player name from telemetry
   * @returns Sanitized player name safe for Discord markdown links
   */
  private sanitizePlayerNameForDiscord(playerName: string): string {
    if (!playerName) return 'Unknown Player';

    // Only escape characters that actually break Discord links
    // Keep underscores and numbers as they're common in player names
    return playerName
      .replace(/[[\]()]/g, '') // Remove brackets and parentheses that break links
      .replace(/[*~`|]/g, '\\$&') // Escape other Discord markdown (but NOT underscores)
      .trim();
  }
}
