import { Client, TextChannel } from 'discord.js';
import { Config } from '../config/config';
import { PlayerRepository } from '../repositories/player-repository';
import { MatchRepository } from '../repositories/match-repository';
import { PubgApiService } from './pubg-api-service';
import { Match } from '../models/match';
import { formatMatchEmbed } from '../utils/format-match';

export class PubgMonitor {
  private readonly playerRepository: PlayerRepository;
  private readonly matchRepository: MatchRepository;
  private readonly pubgApiService: PubgApiService;
  private readonly channelId: string;
  private readonly client: Client;
  private isMonitoring: boolean;

  constructor(config: Config, client: Client) {
    this.playerRepository = new PlayerRepository();
    this.matchRepository = new MatchRepository();
    this.pubgApiService = new PubgApiService(config.PUBG_API_KEY);
    this.channelId = config.MONITOR_CHANNEL_ID;
    this.client = client;
    this.isMonitoring = false;
  }

  public async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    await Promise.all([
      this.playerRepository.initialize(),
      this.matchRepository.initialize()
    ]);

    // Check for new matches every 5 minutes
    setInterval(() => this.checkNewMatches(), 5 * 60 * 1000);
  }

  private async checkNewMatches(): Promise<void> {
    try {
      const players = await this.playerRepository.getPlayers();
      
      for (const playerName of players) {
        await this.checkPlayerMatches(playerName);
      }
    } catch (error) {
      console.error('Error checking matches:', error);
    }
  }

  private async checkPlayerMatches(playerName: string): Promise<void> {
    try {
      const lastMatchId = await this.playerRepository.getLastMatchId(playerName);
      const recentMatches = await this.pubgApiService.getPlayerMatches(playerName);

      for (const matchId of recentMatches) {
        if (matchId === lastMatchId) {
          break;
        }

        const match = await this.pubgApiService.getMatch(matchId);
        if (match) {
          await this.processNewMatch(match, playerName);
        }
      }

      if (recentMatches.length > 0) {
        await this.playerRepository.updateLastMatch(playerName, recentMatches[0]);
      }
    } catch (error) {
      console.error(`Error checking matches for ${playerName}:`, error);
    }
  }

  private async processNewMatch(match: Match, playerName: string): Promise<void> {
    try {
      await this.matchRepository.addMatch(match);
      
      const channel = await this.getMonitorChannel();
      if (channel) {
        const embed = formatMatchEmbed(match, playerName);
        await channel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error(`Error processing match ${match.id}:`, error);
    }
  }

  private async getMonitorChannel(): Promise<TextChannel | null> {
    try {
      const channel = await this.client.channels.fetch(this.channelId);
      if (channel?.isTextBased()) {
        return channel as TextChannel;
      }
    } catch (error) {
      console.error('Error fetching monitor channel:', error);
    }
    return null;
  }
} 