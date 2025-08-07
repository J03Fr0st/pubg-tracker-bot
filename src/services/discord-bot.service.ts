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
import { PubgClient, Player, Shard } from '@j03fr0st/pubg-ts';
import {
  DiscordPlayerMatchStats,
  DiscordMatchGroupSummary,
} from '../types/discord-match-summary.types';
import { PubgStorageService } from './pubg-storage.service';
import { MAP_NAMES, GAME_MODES, DAMAGE_CAUSER_NAME } from '../constants/pubg-mappings';
import { MatchColorUtil } from '../utils/match-colors.util';
import { success, error, debug } from '../utils/logger';

// Telemetry types for kill events
interface LogPlayerKillV2 {
  _D: string;
  _T: string;
  attackId: number;
  victim: {
    name: string;
    teamId: number;
    health: number;
    location: { x: number; y: number; z: number };
    ranking: number;
    accountId: string;
  };
  killer?: {
    name: string;
    teamId: number;
    health: number;
    location: { x: number; y: number; z: number };
    ranking: number;
    accountId: string;
  };
  dBNOMaker?: {
    name: string;
    teamId: number;
    health: number;
    location: { x: number; y: number; z: number };
    ranking: number;
    accountId: string;
  };
  finisher?: {
    name: string;
    teamId: number;
    health: number;
    location: { x: number; y: number; z: number };
    ranking: number;
    accountId: string;
  };
  killerDamageInfo?: {
    damageCauserName: string;
    damageReason: string;
    damageTypeCategory: string;
    distance?: number;
  };
}

interface LogPlayerMakeGroggy {
  _D: string;
  _T: string;
  attackId: number;
  attacker: {
    name: string;
    teamId: number;
    health: number;
    location: { x: number; y: number; z: number };
    ranking: number;
    accountId: string;
  };
  victim: {
    name: string;
    teamId: number;
    health: number;
    location: { x: number; y: number; z: number };
    ranking: number;
    accountId: string;
  };
  damageReason: string;
  damageTypeCategory: string;
  damageCauserName: string;
  distance: number;
}

interface LogPlayerTakeDamage {
  _D: string;
  _T: string;
  attackId: number;
  attacker?: {
    name: string;
    teamId: number;
    health: number;
    location: { x: number; y: number; z: number };
    ranking: number;
    accountId: string;
  };
  victim: {
    name: string;
    teamId: number;
    health: number;
    location: { x: number; y: number; z: number };
    ranking: number;
    accountId: string;
  };
  damageReason: string;
  damageTypeCategory: string;
  damageCauserName: string;
  damage: number;
  distance: number;
}

export class DiscordBotService {
  private readonly client: Client;
  private readonly pubgStorageService: PubgStorageService;
  private readonly pubgClient: PubgClient;
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

    try {
      // Get details about the last match before removing it
      const lastMatch = await this.pubgStorageService.getLastProcessedMatch();

      if (!lastMatch) {
        const noMatchEmbed = new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle('⚠️ No Matches Found')
          .setDescription('There are no processed matches to remove.')
          .setTimestamp()
          .setFooter({ text: 'PUBG Tracker Bot' });

        await interaction.editReply({ embeds: [noMatchEmbed] });
        return;
      }

      // Remove the last processed match
      const removedMatchId = await this.pubgStorageService.removeLastProcessedMatch();

      if (removedMatchId) {
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
    } catch (error) {
      const err = error as Error;
      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Error Removing Match')
        .setDescription('Failed to remove the last processed match.')
        .addFields({ name: 'Error Details', value: err.message })
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

    const telemetryData = await this.pubgClient.telemetry.getTelemetryData(summary.telemetryUrl!);
    const kills = telemetryData.filter(
      (event) => event._T === 'LogPlayerKillV2'
    ) as unknown as LogPlayerKillV2[];
    const groggies = telemetryData.filter(
      (event) => event._T === 'LogPlayerMakeGroggy'
    ) as unknown as LogPlayerMakeGroggy[];
    const damageEvents = telemetryData.filter(
      (event) => event._T === 'LogPlayerTakeDamage'
    ) as unknown as LogPlayerTakeDamage[];

    const playerEmbeds = players.map((player) => {
      const playerStats = this.formatPlayerStats(
        matchDate,
        summary.matchId,
        player,
        kills,
        groggies,
        damageEvents
      );
      return new EmbedBuilder()
        .setTitle(`Player: ${player.name}`)
        .setDescription(playerStats)
        .setColor(matchColor); // Use the same color for player embeds
    });

    return [mainEmbed, ...playerEmbeds];
  }

  private formatPlayerStats(
    matchStartTime: Date,
    matchId: string,
    player: DiscordPlayerMatchStats,
    killEvents: LogPlayerKillV2[],
    groggyEvents: LogPlayerMakeGroggy[],
    damageEvents: LogPlayerTakeDamage[]
  ): string {
    const { stats } = player;
    if (!stats) {
      return 'No stats available';
    }
    const survivalMinutes = Math.round(stats.timeSurvived / 60);
    const kmWalked = (stats.walkDistance / 1000).toFixed(1);
    const accuracy =
      stats.kills > 0 && stats.headshotKills > 0
        ? ((stats.headshotKills / stats.kills) * 100).toFixed(1)
        : '0';

    const killDetails = this.getKillDetails(player.name, killEvents, groggyEvents, damageEvents, matchStartTime);

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
      statsDetails.push('*** KILLS, DBNOs & ASSISTS ***', killDetails);
    }

    return statsDetails.filter(Boolean).join('\n');
  }

  private getKillDetails(
    playerName: string,
    killEvents: LogPlayerKillV2[],
    groggyEvents: LogPlayerMakeGroggy[],
    damageEvents: LogPlayerTakeDamage[],
    matchStartTime: Date
  ): string | null {
    // Filter events to only include those where the player is involved
    const relevantKills = killEvents.filter(
      (event) => event.killer?.name === playerName || event.victim?.name === playerName
    );
    const relevantGroggies = groggyEvents.filter(
      (event) => event.attacker?.name === playerName || event.victim?.name === playerName
    );

    // Find assist events (damage events where player damaged someone but didn't get the kill)
    const assistEvents = this.findAssistEvents(playerName, damageEvents, killEvents, groggyEvents);

    const allEvents = [...relevantKills, ...relevantGroggies, ...assistEvents].sort(
      (a, b) => new Date(a._D).getTime() - new Date(b._D).getTime()
    );

    if (allEvents.length === 0) {
      return null;
    }

    const eventDetails = allEvents
      .map((event) => {
        const eventTime = new Date(event._D);
        const relativeSeconds = Math.round((eventTime.getTime() - matchStartTime.getTime()) / 1000);
        const minutes = Math.floor(relativeSeconds / 60);
        const seconds = relativeSeconds % 60;
        const relativeTime = `\`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}\``;

        // Find corresponding damage event for this kill/knock
        const damageInfo = this.findDamageForEvent(event, damageEvents, playerName);

        if ('killer' in event) {
          // LogPlayerKillV2 event
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
          const damageText = damageInfo ? `, ${Math.round(damageInfo.damage)} damage` : '';
          return `${relativeTime} ${icon} ${actionType} - [${targetName}](https://pubg.op.gg/user/${targetName}) (${weapon}, ${distance}${damageText})`;
        }
        if ('attacker' in event) {
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
          const damageText = damageInfo ? `, ${Math.round(damageInfo.damage)} damage` : '';
          return `${relativeTime} ${icon} ${actionType} - [${targetName}](https://pubg.op.gg/user/${targetName}) (${weapon}, ${distance}${damageText})`;
        }
        if ('damage' in event) {
          // Assist event (LogPlayerTakeDamage)
          const victimName = event.victim?.name || 'Unknown Player';
          const weapon = event.damageCauserName
            ? this.getReadableDamageCauserName(event.damageCauserName)
            : 'Unknown Weapon';
          const distance = event.distance ? `${Math.round(event.distance / 100)}m` : 'Unknown';
          const damageText = `, ${Math.round(event.damage)} damage`;

          return `${relativeTime} 🎯 Assisted - [${victimName}](https://pubg.op.gg/user/${victimName}) (${weapon}, ${distance}${damageText})`;
        }

        return ''; // Fallback for unknown event types
      })
      .filter(Boolean)
      .join('\n');

    return eventDetails || null;
  }

  private findAssistEvents(
    playerName: string,
    damageEvents: LogPlayerTakeDamage[],
    killEvents: LogPlayerKillV2[],
    groggyEvents: LogPlayerMakeGroggy[]
  ): LogPlayerTakeDamage[] {
    // Find damage events where the player damaged someone but didn't get the kill/knock
    return damageEvents.filter((damageEvent) => {
      // Only consider events where the player is the attacker
      if (damageEvent.attacker?.name !== playerName) {
        return false;
      }

      const victimName = damageEvent.victim?.name;
      if (!victimName) {
        return false;
      }

      // Check if this player got the kill for this victim
      const gotKill = killEvents.some(
        (killEvent) =>
          killEvent.killer?.name === playerName && killEvent.victim?.name === victimName
      );

      // Check if this player got the knock for this victim
      const gotKnock = groggyEvents.some(
        (groggyEvent) =>
          groggyEvent.attacker?.name === playerName && groggyEvent.victim?.name === victimName
      );

      // If the player didn't get the kill or knock, it's an assist
      return !gotKill && !gotKnock;
    });
  }

  private findDamageForEvent(
    event: LogPlayerKillV2 | LogPlayerMakeGroggy,
    damageEvents: LogPlayerTakeDamage[],
    playerName: string
  ): LogPlayerTakeDamage | null {
    // Find damage events that match the attack ID and involve the same players
    const matchingDamageEvents = damageEvents.filter((damageEvent) => {
      // Check if attack IDs match
      if (damageEvent.attackId !== event.attackId) {
        return false;
      }

      // For kill events, check if the damage event involves the same killer and victim
      if ('killer' in event) {
        const isKiller = event.killer?.name === playerName;
        const targetName = isKiller ? event.victim?.name : event.killer?.name;

        return (
          damageEvent.attacker?.name === (isKiller ? playerName : event.killer?.name) &&
          damageEvent.victim?.name === targetName
        );
      }

      // For groggy events, check if the damage event involves the same attacker and victim
      if ('attacker' in event) {
        const isAttacker = event.attacker?.name === playerName;
        const targetName = isAttacker ? event.victim?.name : event.attacker?.name;

        return (
          damageEvent.attacker?.name === (isAttacker ? playerName : event.attacker?.name) &&
          damageEvent.victim?.name === targetName
        );
      }

      return false;
    });

    // Return the damage event with the highest damage amount (in case of multiple hits)
    if (matchingDamageEvents.length > 0) {
      return matchingDamageEvents.reduce((max, current) =>
        current.damage > max.damage ? current : max
      );
    }

    return null;
  }

  private getReadableDamageCauserName(weaponCode: string): string {
    return (
      DAMAGE_CAUSER_NAME[weaponCode] ||
      weaponCode
        .replace(/^Weap/, '')
        .replace(/_C$/, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .trim()
    );
  }

  private formatMapName(mapCode: string): string {
    return MAP_NAMES[mapCode] || mapCode;
  }

  private formatGameMode(gameModeCode: string): string {
    return GAME_MODES[gameModeCode] || gameModeCode;
  }
}
