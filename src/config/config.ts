import { config } from 'dotenv';
import { success, warn } from '../utils/logger';

// Load environment variables from .env file
config();

/**
 * Application configuration
 */
export interface AppConfig {
  // Discord configuration
  discord: {
    token: string;
    clientId: string;
    channelId: string;
  };

  // PUBG API configuration
  pubg: {
    apiKey: string;
    shard: string;
    maxRequestsPerMinute: number;
  };

  // Database configuration
  database: {
    url: string;
  };

  // Monitoring configuration
  monitoring: {
    checkIntervalMs: number;
    maxMatchesToProcess: number;
  };

  // LLM coaching configuration
  llm: {
    coachingEnabled: boolean;
    provider: 'openrouter';
    openRouterApiKey?: string;
    openRouterModel?: string;
    timeoutMs: number;
  };
}

/**
 * Validates that a required environment variable exists
 * @param name The name of the environment variable
 * @param defaultValue Optional default value if not set
 * @returns The value of the environment variable
 * @throws Error if the environment variable is not set and no default is provided
 */
function requireEnv(name: string, defaultValue?: string): string {
  const value = process.env[name] || defaultValue;
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

/**
 * Gets a numeric environment variable
 * @param name The name of the environment variable
 * @param defaultValue Default value if not set or invalid
 * @returns The numeric value
 */
function getNumericEnv(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }

  const numericValue = Number.parseInt(value, 10);
  if (isNaN(numericValue)) {
    warn(`Environment variable ${name} is not a valid number, using default: ${defaultValue}`);
    return defaultValue;
  }

  return numericValue;
}

function getBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

/**
 * Application configuration loaded from environment variables
 */
export const appConfig: AppConfig = {
  discord: {
    token: requireEnv('DISCORD_TOKEN'),
    clientId: requireEnv('DISCORD_CLIENT_ID'),
    channelId: requireEnv('DISCORD_CHANNEL_ID'),
  },
  pubg: {
    apiKey: requireEnv('PUBG_API_KEY'),
    shard: requireEnv('PUBG_SHARD', 'steam'),
    maxRequestsPerMinute: getNumericEnv('PUBG_MAX_REQUESTS_PER_MINUTE', 10),
  },
  database: {
    url: requireEnv('DATABASE_URL'),
  },
  monitoring: {
    checkIntervalMs: getNumericEnv('CHECK_INTERVAL_MS', 90000),
    maxMatchesToProcess: getNumericEnv('MAX_MATCHES_TO_PROCESS', 3),
  },
  llm: {
    coachingEnabled: getBooleanEnv('LLM_COACHING_ENABLED', false),
    provider: 'openrouter',
    openRouterApiKey: process.env.OPENROUTER_API_KEY,
    openRouterModel: process.env.OPENROUTER_MODEL,
    timeoutMs: getNumericEnv('LLM_TIMEOUT_MS', 8000),
  },
};

/**
 * Validates the application configuration
 * @throws Error if the configuration is invalid
 */
export function validateConfig(): void {
  // Validate Discord configuration
  if (!appConfig.discord.token) {
    throw new Error('Discord token is required');
  }

  if (!appConfig.discord.clientId) {
    throw new Error('Discord client ID is required');
  }

  if (!appConfig.discord.channelId) {
    throw new Error('Discord channel ID is required');
  }

  // Validate PUBG API configuration
  if (!appConfig.pubg.apiKey) {
    throw new Error('PUBG API key is required');
  }

  if (appConfig.pubg.maxRequestsPerMinute <= 0) {
    throw new Error('PUBG max requests per minute must be greater than 0');
  }

  // Validate database configuration
  if (!appConfig.database.url) {
    throw new Error('DATABASE_URL is required');
  }

  // Validate monitoring configuration
  if (appConfig.monitoring.checkIntervalMs < 5000) {
    warn('Check interval is very low, this may cause rate limiting issues');
  }

  if (appConfig.monitoring.maxMatchesToProcess <= 0) {
    throw new Error('Max matches to process must be greater than 0');
  }

  if (appConfig.llm.coachingEnabled && !appConfig.llm.openRouterApiKey) {
    warn(
      'LLM coaching is enabled but OPENROUTER_API_KEY is missing; coaching will use template narration'
    );
  }

  if (appConfig.llm.timeoutMs <= 0) {
    throw new Error('LLM timeout must be greater than 0');
  }

  success('Configuration validated successfully');
}
