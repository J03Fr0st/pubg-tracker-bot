import { Message } from 'discord.js';
import { Config } from '../config/config';
import { PlayerRepository } from '../repositories/player-repository';
import { MatchRepository } from '../repositories/match-repository';
import { formatMatchEmbed } from '../utils/format-match';

export class CommandHandler {
  private readonly prefix: string;
  private readonly playerRepository: PlayerRepository;
  private readonly matchRepository: MatchRepository;

  constructor(config: Config) {
    this.prefix = config.COMMAND_PREFIX;
    this.playerRepository = new PlayerRepository();
    this.matchRepository = new MatchRepository();
    Promise.all([
      this.playerRepository.initialize(),
      this.matchRepository.initialize()
    ]).catch(console.error);
  }

  public async handleMessage(message: Message): Promise<void> {
    if (!message.content.startsWith(this.prefix)) {
      return;
    }

    const args = message.content.slice(this.prefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();

    switch (command) {
      case 'addplayer':
        await this.handleAddPlayer(message, args);
        break;
      case 'removeplayer':
        await this.handleRemovePlayer(message, args);
        break;
      case 'listplayers':
        await this.handleListPlayers(message);
        break;
      case 'lastmatch':
        await this.handleLastMatch(message, args);
        break;
      case 'stats':
        await this.handleStats(message, args);
        break;
      default:
        await message.reply(
          'Unknown command. Available commands: addplayer, removeplayer, listplayers, lastmatch, stats'
        );
    }
  }

  private async handleAddPlayer(message: Message, args: string[]): Promise<void> {
    if (args.length < 1) {
      await message.reply('Please provide a player name to add');
      return;
    }

    const playerName = args[0];
    await this.playerRepository.addPlayer(playerName);
    await message.reply(`Player ${playerName} has been added to the monitoring list`);
  }

  private async handleRemovePlayer(message: Message, args: string[]): Promise<void> {
    if (args.length < 1) {
      await message.reply('Please provide a player name to remove');
      return;
    }

    const playerName = args[0];
    await this.playerRepository.removePlayer(playerName);
    await message.reply(`Player ${playerName} has been removed from the monitoring list`);
  }

  private async handleListPlayers(message: Message): Promise<void> {
    const players = await this.playerRepository.getPlayers();
    if (players.length === 0) {
      await message.reply('No players are currently being monitored');
      return;
    }

    await message.reply(`Currently monitoring: ${players.join(', ')}`);
  }

  private async handleLastMatch(message: Message, args: string[]): Promise<void> {
    if (args.length < 1) {
      await message.reply('Please provide a player name');
      return;
    }

    const playerName = args[0];
    const matches = await this.matchRepository.getPlayerMatches(playerName, 1);
    
    if (matches.length === 0) {
      await message.reply('No recent matches found for this player');
      return;
    }

    const embed = formatMatchEmbed(matches[0], playerName);
    await message.reply({ embeds: [embed] });
  }

  private async handleStats(message: Message, args: string[]): Promise<void> {
    if (args.length < 1) {
      await message.reply('Please provide a player name');
      return;
    }

    const playerName = args[0];
    const matches = await this.matchRepository.getPlayerMatches(playerName, 5);
    
    if (matches.length === 0) {
      await message.reply('No matches found for this player');
      return;
    }

    const stats = matches.reduce((acc, match) => {
      const playerStats = match.players[playerName];
      return {
        kills: acc.kills + playerStats.kills,
        damageDealt: acc.damageDealt + playerStats.damageDealt,
        matches: acc.matches + 1,
        wins: acc.wins + (playerStats.winPlace === 1 ? 1 : 0)
      };
    }, { kills: 0, damageDealt: 0, matches: 0, wins: 0 });

    await message.reply(
      `Stats for ${playerName} (last ${matches.length} matches):\n` +
      `Matches: ${stats.matches}\n` +
      `Wins: ${stats.wins}\n` +
      `K/D: ${(stats.kills / stats.matches).toFixed(2)}\n` +
      `Avg Damage: ${(stats.damageDealt / stats.matches).toFixed(0)}`
    );
  }
} 