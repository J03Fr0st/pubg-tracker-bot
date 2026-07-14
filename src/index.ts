import { config } from 'dotenv';
import { type Application, createApplication } from './app';
import { loadConfig } from './config/config';
import { database, discord, error, monitor, shutdown, startup } from './utils/logger';

async function main(): Promise<void> {
  try {
    config();
    const appConfig = loadConfig(process.env);
    const app = createApplication(appConfig);

    startup('Starting PUBG Tracker Bot...');

    database('Connecting to PostgreSQL...');
    await app.prisma.$connect();
    database('Connected to PostgreSQL successfully');

    discord('Initializing Discord bot...');
    await app.discordBot.initialize();

    setupGracefulShutdown(app);

    monitor('Starting match monitoring...');
    await app.matchMonitor.startMonitoring();
  } catch (err) {
    error('Fatal error during startup:', err as Error);
    process.exit(1);
  }
}

function setupGracefulShutdown(app: Application): void {
  process.on('SIGINT', () => handleShutdown(app));
  process.on('SIGTERM', () => handleShutdown(app));

  process.on('uncaughtException', (err) => {
    error('Uncaught exception:', err);
    handleShutdown(app);
  });

  process.on('unhandledRejection', (reason) => {
    error('Unhandled rejection:', reason as Error);
    handleShutdown(app);
  });
}

async function handleShutdown(app: Application): Promise<void> {
  shutdown('Shutting down gracefully...');

  try {
    app.matchMonitor.stopMonitoring();
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await app.prisma.$disconnect();
    shutdown('Shutdown complete');
    process.exit(0);
  } catch (err) {
    error('Error during shutdown:', err as Error);
    process.exit(1);
  }
}

main().catch((err) => {
  error('Unhandled error in main:', err as Error);
  process.exit(1);
});
