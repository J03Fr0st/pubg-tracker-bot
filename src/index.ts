import { connect } from 'mongoose';
import { PubgApiService } from './services/pubg-api.service';
import { PubgStorageService } from './services/pubg-storage.service';
import { DiscordBotService } from './services/discord-bot.service';
import { MatchMonitorService } from './services/match-monitor.service';
import { appConfig, validateConfig } from './config/config';
import { RateLimiter } from './utils/rate-limiter';

/**
 * Main application entry point
 */
async function main(): Promise<void> {
    try {
        // Validate configuration
        validateConfig();
        console.log('Starting PUBG Tracker Bot...');

        // Connect to MongoDB
        console.log(`Connecting to MongoDB...`);
        await connect(appConfig.database.uri);
        console.log('Connected to MongoDB successfully');

        // Initialize services
        console.log('Initializing services...');
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
        console.log('Initializing Discord bot...');
        await discordBot.initialize();

        // Start match monitoring
        console.log('Starting match monitoring...');
        const matchMonitor = new MatchMonitorService(pubgApi, pubgStorage, discordBot);

        // Handle graceful shutdown
        setupGracefulShutdown(matchMonitor);

        // Start monitoring
        await matchMonitor.startMonitoring();
    } catch (error) {
        console.error('Fatal error during startup:', error);
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
    process.on('uncaughtException', (error) => {
        console.error('Uncaught exception:', error);
        handleShutdown(matchMonitor);
    });

    process.on('unhandledRejection', (reason) => {
        console.error('Unhandled rejection:', reason);
        handleShutdown(matchMonitor);
    });
}

/**
 * Handles graceful shutdown of the application
 * @param matchMonitor The match monitor service to stop
 */
async function handleShutdown(matchMonitor: MatchMonitorService): Promise<void> {
    console.log('Shutting down gracefully...');

    try {
        // Stop match monitoring
        matchMonitor.stopMonitoring();

        // Allow some time for cleanup
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('Shutdown complete');
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
}

// Start the application
main().catch((error) => {
    console.error('Unhandled error in main:', error);
    process.exit(1);
});
