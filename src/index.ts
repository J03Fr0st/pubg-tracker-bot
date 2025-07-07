import { connect } from 'mongoose';
import { PubgApiService } from './services/pubg-api.service';
import { PubgStorageService } from './services/pubg-storage.service';
import { DiscordBotService } from './services/discord-bot.service';
import { MatchMonitorService } from './services/match-monitor.service';
import { appConfig, validateConfig } from './config/config';
import { RateLimiter } from './utils/rate-limiter';
import { startup, database, discord, monitor, error, shutdown } from './utils/logger';

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  try {
    // Validate configuration
    validateConfig();
    startup('Starting PUBG Tracker Bot...');

    // Connect to MongoDB
    database('Connecting to MongoDB...');
    await connect(appConfig.database.uri);
    database('Connected to MongoDB successfully');

    // Initialize services
    startup('Initializing services...');
    const rateLimiter = new RateLimiter(appConfig.pubg.maxRequestsPerMinute);
    const pubgApi = new PubgApiService(
      appConfig.pubg.apiKey,
      appConfig.pubg.shard,
      undefined,
      undefined,
      rateLimiter
    );
    const pubgStorage = new PubgStorageService();
    const discordBot = new DiscordBotService(pubgApi);

    // Initialize Discord bot
    discord('Initializing Discord bot...');
    await discordBot.initialize();

    // Start match monitoring
    monitor('Starting match monitoring...');
    const matchMonitor = new MatchMonitorService(pubgApi, pubgStorage, discordBot);

    // Handle graceful shutdown
    setupGracefulShutdown(matchMonitor);

    // Start monitoring
    await matchMonitor.startMonitoring();
  } catch (err) {
    error('Fatal error during startup:', err as Error);
    process.exit(1);
  }
}

/**
 * Sets up handlers for graceful shutdown
 * @param matchMonitor The match monitor service to stop on shutdown
 */
function setupGracefulShutdown(matchMonitor: MatchMonitorService): void {
  // Handle process termination signals
  process.on('SIGINT', () => handleShutdown(matchMonitor));
  process.on('SIGTERM', () => handleShutdown(matchMonitor));

  // Handle uncaught exceptions and unhandled rejections
  process.on('uncaughtException', (err) => {
    error('Uncaught exception:', err);
    handleShutdown(matchMonitor);
  });

  process.on('unhandledRejection', (reason) => {
    error('Unhandled rejection:', reason as Error);
    handleShutdown(matchMonitor);
  });
}

/**
 * Handles graceful shutdown of the application
 * @param matchMonitor The match monitor service to stop
 */
async function handleShutdown(matchMonitor: MatchMonitorService): Promise<void> {
  shutdown('Shutting down gracefully...');

  try {
    // Stop match monitoring
    matchMonitor.stopMonitoring();

    // Allow some time for cleanup
    await new Promise((resolve) => setTimeout(resolve, 3000));

    shutdown('Shutdown complete');
    process.exit(0);
  } catch (err) {
    error('Error during shutdown:', err as Error);
    process.exit(1);
  }
}

// Start the application
main().catch((err) => {
  error('Unhandled error in main:', err as Error);
  process.exit(1);
});
