#!/usr/bin/env ts-node

/**
 * Test Match Flow Script
 *
 * This script allows you to test the complete flow from player names and match ID
 * to Discord posting, including telemetry analysis and enhanced embeds.
 *
 * Usage:
 *   npm run test:match-flow -- --matchId "match-id" --players "player1,player2"
 *   OR
 *   ts-node scripts/test-match-flow.ts --matchId "match-id" --players "player1,player2"
 *
 * Options:
 *   --matchId    The PUBG match ID to analyze
 *   --players    Comma-separated list of player names to track
 *   --channelId  Discord channel ID (optional, uses env default)
 *   --shard      PUBG shard (optional, defaults to 'steam')
 *   --dryRun     Don't actually send to Discord, just process and log
 */

import { connect } from 'mongoose';
import { config } from 'dotenv';
import type { Shard, TelemetryEvent } from '@j03fr0st/pubg-ts';

// Load environment variables
config();

import { DiscordBotService } from '../src/services/discord-bot.service';
import { MatchMonitorService } from '../src/services/match-monitor.service';
import { PubgStorageService } from '../src/services/pubg-storage.service';
import { TelemetryProcessorService } from '../src/services/telemetry-processor.service';
import type { DiscordMatchGroupSummary } from '../src/types/discord-match-summary.types';
import type { MatchMonitorMatchGroup, MatchMonitorPlayer } from '../src/types/match-monitor.types';
import { appConfig, validateConfig } from '../src/config/config';
import { startup, success, error, info, warn } from '../src/utils/logger';

interface TestOptions {
  matchId: string;
  players: string[];
  channelId?: string;
  shard?: Shard;
  dryRun?: boolean;
}

/**
 * Parse command line arguments
 */
function parseArguments(): TestOptions {
  const args = process.argv.slice(2);
  const options: Partial<TestOptions> = {};

  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];

    switch (flag) {
      case '--matchId':
        options.matchId = value;
        break;
      case '--players':
        options.players = value.split(',').map(p => p.trim()).filter(Boolean);
        break;
      case '--channelId':
        options.channelId = value;
        break;
      case '--shard':
        options.shard = value as Shard;
        break;
      case '--dryRun':
        options.dryRun = true;
        i--; // No value for this flag
        break;
      default:
        if (flag.startsWith('--')) {
          warn(`Unknown flag: ${flag}`);
        }
    }
  }

  if (!options.matchId) {
    throw new Error('--matchId is required');
  }

  if (!options.players || options.players.length === 0) {
    throw new Error('--players is required (comma-separated list)');
  }

  return {
    matchId: options.matchId,
    players: options.players,
    channelId: options.channelId || appConfig.discord.channelId,
    shard: options.shard || (appConfig.pubg.shard as Shard),
    dryRun: options.dryRun || false,
  };
}

/**
 * Test the complete match processing flow
 */
class MatchFlowTester {
  private readonly discordBot: DiscordBotService;
  private readonly matchMonitor: MatchMonitorService;
  private readonly pubgStorage: PubgStorageService;
  private readonly telemetryProcessor: TelemetryProcessorService;

  constructor(private readonly options: TestOptions) {
    this.pubgStorage = new PubgStorageService();
    this.discordBot = new DiscordBotService(appConfig.pubg.apiKey, this.options.shard);
    this.matchMonitor = new MatchMonitorService(
      this.pubgStorage,
      this.discordBot,
      appConfig.pubg.apiKey,
      this.options.shard
    );
    this.telemetryProcessor = new TelemetryProcessorService();
  }

  /**
   * Initialize the testing environment
   */
  async initialize(): Promise<void> {
    startup('Initializing test environment...');

    // Connect to MongoDB
    info('Connecting to MongoDB...');
    await connect(appConfig.database.uri);
    success('Connected to MongoDB');

    if (!this.options.dryRun) {
      // Initialize Discord bot
      info('Initializing Discord bot...');
      await this.discordBot.initialize();
      success('Discord bot initialized');
    } else {
      info('Dry run mode - skipping Discord initialization');
    }
  }

  /**
   * Create a mock match group for testing
   */
  private createMockMatchGroup(): MatchMonitorMatchGroup {
    const players: MatchMonitorPlayer[] = this.options.players.map(playerName => ({
      id: `mock-player-id-${playerName.toLowerCase()}`,
      name: playerName,
    }));

    return {
      matchId: this.options.matchId,
      players,
      createdAt: new Date(),
    };
  }

  /**
   * Test fetching and processing a specific match
   */
  async testMatchProcessing(): Promise<void> {
    info(`Testing match processing for match ID: ${this.options.matchId}`);
    info(`Tracking players: ${this.options.players.join(', ')}`);

    try {
      // Create a mock match group
      const mockMatch = this.createMockMatchGroup();

      // Use the match monitor's private method to create match summary
      // We'll access it through reflection since it's private
      const createMatchSummaryMethod = (this.matchMonitor as unknown as { createMatchSummary: (match: MatchMonitorMatchGroup) => Promise<DiscordMatchGroupSummary | null> }).createMatchSummary.bind(this.matchMonitor);

      info('Fetching match details from PUBG API...');
      const matchSummary: DiscordMatchGroupSummary | null = await createMatchSummaryMethod(mockMatch);

      if (!matchSummary) {
        error('Failed to create match summary - match may not exist or players not found');
        return;
      }

      success('Match summary created successfully!');
      this.logMatchSummary(matchSummary);

      if (this.options.dryRun) {
        info('Dry run mode - would send to Discord channel:', this.options.channelId);
        await this.testTelemetryProcessing(matchSummary);
      } else {
        info(`Sending match summary to Discord channel: ${this.options.channelId}`);
        await this.discordBot.sendMatchSummary(this.options.channelId || appConfig.discord.channelId, matchSummary);
        success('Match summary sent to Discord successfully!');
      }

    } catch (err) {
      error('Error during match processing:', err as Error);
      throw err;
    }
  }

  /**
   * Test telemetry processing separately
   */
  private async testTelemetryProcessing(matchSummary: DiscordMatchGroupSummary): Promise<void> {
    if (!matchSummary.telemetryUrl) {
      warn('No telemetry URL available - skipping telemetry analysis');
      return;
    }

    try {
      info('Testing telemetry processing...');

      // Access the private pubgClient from discordBot
      const pubgClient = (this.discordBot as unknown as { pubgClient: { telemetry: { getTelemetryData: (url: string) => Promise<TelemetryEvent[]> } } }).pubgClient;
      const telemetryData = await pubgClient.telemetry.getTelemetryData(matchSummary.telemetryUrl);

      info(`Fetched ${telemetryData.length} telemetry events`);

      const trackedPlayerNames = this.options.players;
      const matchDate = new Date(matchSummary.playedAt);

      const matchAnalysis = await this.telemetryProcessor.processMatchTelemetry(
        telemetryData,
        matchSummary.matchId,
        matchDate,
        trackedPlayerNames
      );

      success('Telemetry processing completed!');
      this.logTelemetryAnalysis(matchAnalysis, trackedPlayerNames);

    } catch (err) {
      error('Error during telemetry processing:', err as Error);
    }
  }

  /**
   * Log match summary details
   */
  private logMatchSummary(summary: DiscordMatchGroupSummary): void {
    console.log('\n📊 Match Summary:');
    console.log(`   Match ID: ${summary.matchId}`);
    console.log(`   Map: ${summary.mapName}`);
    console.log(`   Game Mode: ${summary.gameMode}`);
    console.log(`   Played At: ${summary.playedAt}`);
    console.log(`   Team Rank: ${summary.teamRank || 'N/A'}`);
    console.log(`   Telemetry URL: ${summary.telemetryUrl ? 'Available' : 'Not available'}`);
    console.log(`   Players Found: ${summary.players.length}`);

    summary.players.forEach((player, index) => {
      console.log(`\n   Player ${index + 1}: ${player.name}`);
      if (player.stats) {
        console.log(`     Kills: ${player.stats.kills}`);
        console.log(`     Assists: ${player.stats.assists}`);
        console.log(`     DBNOs: ${player.stats.DBNOs}`);
        console.log(`     Damage: ${player.stats.damageDealt}`);
        console.log(`     Survival Time: ${Math.floor(player.stats.timeSurvived / 60)}m ${player.stats.timeSurvived % 60}s`);
        console.log(`     Win Place: ${player.stats.winPlace}`);
      } else {
        console.log('     Stats: Not available');
      }
    });
  }

  /**
   * Log telemetry analysis results
   */
  private logTelemetryAnalysis(matchAnalysis: { totalEventsProcessed: number; playerAnalyses: Map<string, unknown> }, trackedPlayerNames: string[]): void {
    console.log('\n🎯 Telemetry Analysis:');
    console.log(`   Total Events Processed: ${matchAnalysis.totalEventsProcessed}`);
    console.log(`   Players Analyzed: ${matchAnalysis.playerAnalyses.size}`);

    trackedPlayerNames.forEach(playerName => {
      const analysis = matchAnalysis.playerAnalyses.get(playerName);
      if (analysis) {
        const playerAnalysis = analysis as {
          kills: unknown[];
          knockdowns: unknown[];
          totalDamageDealt: number;
          totalDamageTaken: number;
          weaponsUsed: unknown[];
          killChains?: { kills: unknown[]; duration: number }[];
          assists?: unknown[];
        };
        console.log(`\n   🎮 ${playerName}:`);
        console.log(`     Kills: ${playerAnalysis.kills?.length || 0}`);
        console.log(`     Knockdowns: ${playerAnalysis.knockdowns?.length || 0}`);
        console.log(`     Damage Dealt: ${playerAnalysis.totalDamageDealt || 0}`);
        console.log(`     Damage Taken: ${playerAnalysis.totalDamageTaken || 0}`);
        console.log(`     Weapons Used: ${playerAnalysis.weaponsUsed?.length || 0}`);

        if (playerAnalysis.killChains && playerAnalysis.killChains.length > 0) {
          console.log(`     Kill Chains: ${playerAnalysis.killChains.length}`);
          playerAnalysis.killChains.forEach((chain, index: number) => {
            console.log(`       Chain ${index + 1}: ${(chain as { kills: unknown[]; duration: number }).kills.length} kills in ${(chain as { kills: unknown[]; duration: number }).duration}s`);
          });
        }

        if (playerAnalysis.assists && playerAnalysis.assists.length > 0) {
          console.log(`     Assists: ${playerAnalysis.assists.length}`);
        }
      } else {
        console.log(`\n   ❌ ${playerName}: No telemetry data found`);
      }
    });
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    info('Cleaning up test environment...');
    // MongoDB connection will be closed automatically when process exits
  }
}

/**
 * Main test function
 */
async function runTest(): Promise<void> {
  try {
    // Parse command line arguments
    const options = parseArguments();

    console.log('\n🚀 PUBG Match Flow Tester');
    console.log('='.repeat(50));
    console.log(`Match ID: ${options.matchId}`);
    console.log(`Players: ${options.players.join(', ')}`);
    console.log(`Shard: ${options.shard}`);
    console.log(`Channel ID: ${options.channelId}`);
    console.log(`Dry Run: ${options.dryRun ? 'Yes' : 'No'}`);
    console.log('='.repeat(50));

    // Validate configuration
    validateConfig();

    // Create and initialize tester
    const tester = new MatchFlowTester(options);
    await tester.initialize();

    // Run the test
    await tester.testMatchProcessing();

    // Cleanup
    await tester.cleanup();

    success('\n✅ Test completed successfully!');

  } catch (err) {
    error('\n❌ Test failed:', err as Error);

    // Show usage help on error
    console.log('\n📖 Usage:');
    console.log('  npm run test:match-flow -- --matchId "your-match-id" --players "player1,player2"');
    console.log('');
    console.log('Options:');
    console.log('  --matchId     PUBG match ID (required)');
    console.log('  --players     Comma-separated player names (required)');
    console.log('  --channelId   Discord channel ID (optional)');
    console.log('  --shard       PUBG shard (optional, default: steam)');
    console.log('  --dryRun      Process but don\'t send to Discord');

    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  info('\nReceived SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  info('\nReceived SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run the test
if (require.main === module) {
  runTest().catch((err) => {
    error('Unhandled error:', err);
    process.exit(1);
  });
}
