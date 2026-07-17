import type { Player, PubgClient } from '@j03fr0st/pubg-ts';
import {
  type Channel,
  ChannelType,
  type ChatInputCommandInteraction,
  type Client,
  EmbedBuilder,
  Events,
  PermissionFlagsBits,
  type REST,
  Routes,
  SlashCommandBuilder,
  type TextBasedChannel,
} from 'discord.js';
import type { PlayerRepository } from '../data/repositories/player.repository';
import type { ProcessedMatchRepository } from '../data/repositories/processed-match.repository';
import type { MatchSummary } from '../types/match.types';
import { debug, error, success } from '../utils/logger';
import type { MatchInterpreter } from './match-interpreter.service';
import type { MatchPresentationService } from './match-presentation.service';

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
const MAX_EMBEDS_PER_MESSAGE = 10;
const MAX_EMBED_TEXT_PER_MESSAGE = 6000;

export interface DiscordBotDependencies {
  client: Client;
  rest: REST;
  token: string;
  clientId: string;
  pubgClient: PubgClient;
  playerRepository: PlayerRepository;
  processedMatchRepository: ProcessedMatchRepository;
  matchInterpreter: MatchInterpreter;
  matchPresentation: MatchPresentationService;
}

export class DiscordBotService {
  private readonly deps: DiscordBotDependencies;
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

  public constructor(deps: DiscordBotDependencies) {
    this.deps = deps;
    this.setupEventHandlers();
  }

  public async initialize(): Promise<void> {
    // Register slash commands
    try {
      debug('Started refreshing application (/) commands.');
      await this.deps.rest.put(Routes.applicationCommands(this.deps.clientId), {
        body: this.commands,
      });
      success('Successfully reloaded application (/) commands.');
    } catch (err) {
      error('Error registering slash commands:', err as Error);
    }

    await this.deps.client.login(this.deps.token);
  }

  public async sendMatchSummary(channelId: string, summary: MatchSummary): Promise<void> {
    const channel = await this.fetchTextChannel(channelId);
    const embeds = await this.deps.matchPresentation.createEmbeds(summary);
    if (embeds.length === 0) {
      error('No embeds were created for match summary');
      return;
    }

    for (const batch of this.createEmbedBatches(embeds)) {
      try {
        await channel.send({ embeds: batch });
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
      const channel = await this.deps.client.channels.fetch(channelId);
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
    const botUser = this.deps.client.user;
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
    if (!this.hasPermissionResolver(channel) || !this.deps.client.user) {
      return null;
    }

    return channel.permissionsFor(this.deps.client.user);
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
    this.deps.client.on(Events.InteractionCreate, async (interaction) => {
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
      const playerResponse = await this.deps.pubgClient.players.getPlayerByName(playerName);
      const player = Array.isArray(playerResponse.data)
        ? playerResponse.data[0]
        : (playerResponse.data as Player);

      await this.deps.playerRepository.savePlayer({
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
      await this.deps.playerRepository.removePlayer(playerName);
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
    const players = await this.deps.playerRepository.getAllPlayers();

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
      const lastMatch = await this.deps.processedMatchRepository.getLastProcessedMatch();

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
      const removedMatchId = await this.deps.processedMatchRepository.removeLastProcessedMatch();

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
      const deleted = await this.deps.processedMatchRepository.removeProcessedMatch(matchId);
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
      const response = await this.deps.pubgClient.matches.getMatch(matchId);
      debug(`Successfully fetched match details for ${matchId}`);
      const interpreted = this.deps.matchInterpreter.interpret(response);
      const monitoredPlayers = await this.deps.playerRepository.getAllPlayers();
      const summary = this.deps.matchInterpreter.createSummary(
        interpreted,
        monitoredPlayers.map((player) => player.pubgId)
      );
      if (!summary) {
        await interaction.editReply({ embeds: [this.createNoMonitoredPlayersEmbed(matchId)] });
        return;
      }

      debug(
        `Built match summary with ${summary.rosterParticipants.length} roster players for ${matchId}`
      );
      const embeds = await this.deps.matchPresentation.createEmbeds(summary);

      if (embeds && embeds.length > 0) {
        const batches = this.createEmbedBatches(embeds);
        for (const [index, batch] of batches.entries()) {
          if (index === 0) {
            await interaction.editReply({ embeds: batch });
          } else {
            await interaction.followUp({ embeds: batch });
          }
        }

        success(`Successfully processed match ${matchId} for user ${userName}`);
      } else {
        throw new Error('Failed to create match summary embeds');
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

  private createEmbedBatches(embeds: EmbedBuilder[]): EmbedBuilder[][] {
    const batches: EmbedBuilder[][] = [];
    let batch: EmbedBuilder[] = [];
    let batchTextLength = 0;

    for (const embed of embeds) {
      const embedTextLength = embed.length;
      if (embedTextLength > MAX_EMBED_TEXT_PER_MESSAGE) {
        throw new Error(
          `Embed text length ${embedTextLength} exceeds Discord's ${MAX_EMBED_TEXT_PER_MESSAGE}-character message limit`
        );
      }

      if (
        batch.length > 0 &&
        (batch.length === MAX_EMBEDS_PER_MESSAGE ||
          batchTextLength + embedTextLength > MAX_EMBED_TEXT_PER_MESSAGE)
      ) {
        batches.push(batch);
        batch = [];
        batchTextLength = 0;
      }

      batch.push(embed);
      batchTextLength += embedTextLength;
    }

    if (batch.length > 0) {
      batches.push(batch);
    }

    return batches;
  }

  private createNoMonitoredPlayersEmbed(matchId: string): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle('⚠️ No Monitored Players Found')
      .setDescription('None of your monitored players participated in this match.')
      .addFields({ name: 'Match ID', value: matchId, inline: true })
      .setTimestamp()
      .setFooter({ text: 'PUBG Tracker Bot' });
  }
}
