import type { Player, PubgClient } from '@j03fr0st/pubg-ts';
import type { MatchRepository } from '../data/repositories/match.repository';
import type { PlayerRepository } from '../data/repositories/player.repository';
import type { ProcessedMatchRepository } from '../data/repositories/processed-match.repository';
import type { MatchMonitorMatchGroup, MatchMonitorPlayer } from '../types/match-monitor.types';
import { debug, error, info, monitor, success, warn } from '../utils/logger';
import type { DiscordBotService } from './discord-bot.service';
import type { MatchInterpreter } from './match-interpreter.service';

export interface MatchMonitorOptions {
  checkIntervalMs: number;
  channelId: string;
  maxMatchesToProcess: number;
}

export interface MatchMonitorDependencies {
  discordBot: DiscordBotService;
  pubgClient: PubgClient;
  playerRepository: PlayerRepository;
  processedMatchRepository: ProcessedMatchRepository;
  matchRepository: MatchRepository;
  matchInterpreter: MatchInterpreter;
  options: MatchMonitorOptions;
}

export class MatchMonitorService {
  private readonly deps: MatchMonitorDependencies;
  private isRunning = false;
  private shouldStop = false;

  public constructor(dependencies: MatchMonitorDependencies) {
    this.deps = dependencies;

    const { maxMatchesToProcess } = this.deps.options;
    if (
      !Number.isFinite(maxMatchesToProcess) ||
      !Number.isInteger(maxMatchesToProcess) ||
      maxMatchesToProcess <= 0
    ) {
      throw new Error('maxMatchesToProcess must be a positive finite integer');
    }

    monitor(
      `Match monitor configured with: checkInterval=${this.deps.options.checkIntervalMs}ms, maxMatches=${this.deps.options.maxMatchesToProcess}`
    );
  }

  public async startMonitoring(): Promise<void> {
    if (this.isRunning) {
      warn('Match monitoring is already running');
      return;
    }

    if (this.deps.options.channelId === '') {
      error('DISCORD_CHANNEL_ID is not set');
      return;
    }

    try {
      await this.deps.discordBot.validateChannelAccess(this.deps.options.channelId);
    } catch (err) {
      error(
        'Discord channel access validation failed. Match monitoring will not start:',
        err as Error
      );
      throw err;
    }

    monitor('Match monitoring started');
    this.isRunning = true;
    this.shouldStop = false;

    try {
      while (!this.shouldStop) {
        const startTime = Date.now();

        try {
          await this.checkNow();
        } catch (err) {
          error('Error during match check:', err as Error);
          // Add a short delay after errors to prevent rapid retries
          await this.delay(5000);
        }

        // Calculate time spent and adjust delay to maintain consistent interval
        const elapsedTime = Date.now() - startTime;
        const delayTime = Math.max(0, this.deps.options.checkIntervalMs - elapsedTime);

        if (!this.shouldStop) {
          await this.delay(delayTime);
        }
      }
    } finally {
      this.isRunning = false;
      monitor('Match monitoring stopped');
    }
  }

  /**
   * Stops the match monitoring process
   */
  public stopMonitoring(): void {
    if (!this.isRunning) {
      warn('Match monitoring is not running');
      return;
    }

    monitor('Stopping match monitoring...');
    this.shouldStop = true;
  }

  /**
   * Delays execution for the specified time
   * @param ms Time to delay in milliseconds
   * @returns A promise that resolves after the delay
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async checkNow(): Promise<void> {
    const cycleStartTime = Date.now();
    const players = await this.deps.playerRepository.getAllPlayers();

    if (players.length === 0) {
      debug('No players to monitor, skipping check');
      return;
    }

    const playerNames = players.map((player) => player.name);

    // Get players data from PUBG API
    const allPlayersData: Player[] = [];
    for (const playerName of playerNames) {
      try {
        const playerResponse = await this.deps.pubgClient.players.getPlayerByName(playerName);
        if (Array.isArray(playerResponse.data)) {
          allPlayersData.push(...playerResponse.data);
        } else {
          allPlayersData.push(playerResponse.data as Player);
        }

        // Save to storage for compatibility
        const playerData = Array.isArray(playerResponse.data)
          ? playerResponse.data[0]
          : (playerResponse.data as Player);
        await this.deps.playerRepository.savePlayer({
          id: playerData.id,
          type: playerData.type,
          attributes: playerData.attributes,
          relationships: playerData.relationships,
        });
      } catch (error) {
        warn(`Failed to get data for player ${playerName}: ${error}`);
      }
    }

    // Log players with their match counts
    const playerMatchInfo = allPlayersData
      .map((player) => {
        const matchCount = player.relationships.matches.data.length;
        return `${player.attributes.name}(${matchCount})`;
      })
      .join(', ');
    info(`Checking for new matches for ${players.length} players: ${playerMatchInfo}`);

    // OPTIMIZED: Collect all unique match IDs first WITHOUT fetching details
    const uniqueMatchIds = new Map<string, MatchMonitorPlayer[]>();

    for (const player of allPlayersData) {
      const matches = player.relationships.matches.data.slice(0, 5);

      for (const match of matches) {
        if (!uniqueMatchIds.has(match.id)) {
          uniqueMatchIds.set(match.id, [{ id: player.id, name: player.attributes.name }]);
        } else {
          const existingPlayers = uniqueMatchIds.get(match.id)!;
          existingPlayers.push({ id: player.id, name: player.attributes.name });
        }
      }
    }

    // Filter out already processed matches BEFORE making API calls
    const processedMatches = await this.deps.processedMatchRepository.getProcessedMatches();
    debug(`Retrieved ${processedMatches.length} previously processed matches`);

    const newMatchIds = [...uniqueMatchIds.keys()]
      .filter((matchId) => !processedMatches.includes(matchId))
      .slice(0, this.deps.options.maxMatchesToProcess);

    if (newMatchIds.length === 0) {
      debug('No new matches found');
      return;
    }

    monitor(`Found ${newMatchIds.length} new matches to process`);

    // OPTIMIZED: Only fetch match details for NEW matches
    const newMatches: MatchMonitorMatchGroup[] = [];

    for (const matchId of newMatchIds) {
      try {
        const response = await this.deps.pubgClient.matches.getMatch(matchId);
        const interpreted = this.deps.matchInterpreter.interpret(response);

        // Persist match data to DB
        try {
          await this.deps.matchRepository.saveMatch(interpreted);
        } catch (saveErr) {
          warn(`Failed to save match ${matchId} to DB: ${saveErr}`);
          if (newMatchIds.indexOf(matchId) < newMatchIds.length - 1) {
            await this.delay(1000);
          }
          continue;
        }

        newMatches.push({
          match: interpreted,
          monitoredPlayers: uniqueMatchIds.get(matchId)!,
        });

        // Add small delay between API calls to avoid hitting rate limits
        if (newMatchIds.indexOf(matchId) < newMatchIds.length - 1) {
          await this.delay(1000); // 1 second delay between match detail fetches
        }
      } catch (matchError) {
        error(`Error fetching details for match ${matchId}:`, matchError as Error);
        // Continue with other matches even if one fails
      }
    }

    // Sort matches chronologically (oldest first)
    newMatches.sort(
      (left, right) => left.match.playedAt.getTime() - right.match.playedAt.getTime()
    );

    let processedCount = 0;
    let failedCount = 0;

    for (const pending of newMatches) {
      try {
        debug(
          `Processing match ${pending.match.matchId} with ${pending.monitoredPlayers.length} monitored players`
        );

        const summary = this.deps.matchInterpreter.createSummary(
          pending.match,
          pending.monitoredPlayers.map((player) => player.name)
        );
        if (summary) {
          await this.deps.discordBot.sendMatchSummary(this.deps.options.channelId, summary);
          await this.deps.processedMatchRepository.addProcessedMatch(pending.match.matchId);
          processedCount++;
          debug(`Match ${pending.match.matchId} processed successfully`);
        } else {
          warn(`Failed to create summary for match ${pending.match.matchId}`);
          failedCount++;
        }

        // Add small delay between matches to spread out API calls
        if (newMatches.indexOf(pending) < newMatches.length - 1) {
          await this.delay(2000); // 2 second delay between match processing
        }
      } catch (matchError) {
        error(`Error processing match ${pending.match.matchId}:`, matchError as Error);
        failedCount++;
      }
    }

    // Summary log with performance metrics
    const cycleTime = Date.now() - cycleStartTime;
    if (processedCount > 0 || failedCount > 0) {
      success(
        `Match cycle completed: ${processedCount} processed, ${failedCount} failed (${cycleTime}ms)`
      );
    } else {
      debug(`Match cycle completed: no new matches (${cycleTime}ms)`);
    }
  }
}
