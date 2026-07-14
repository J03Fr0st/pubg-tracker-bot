import type { Shard } from '@j03fr0st/pubg-ts';
import { config } from 'dotenv';
import { success, warn } from '../utils/logger';

const SHARDS = new Set<Shard>([
  'steam',
  'pc-as',
  'pc-eu',
  'pc-jp',
  'pc-kakao',
  'pc-krjp',
  'pc-na',
  'pc-oc',
  'pc-ru',
  'pc-sa',
  'pc-sea',
  'pc-tournament',
  'xbox-as',
  'xbox-eu',
  'xbox-na',
  'xbox-oc',
  'xbox-sa',
  'psn-as',
  'psn-eu',
  'psn-na',
  'psn-oc',
  'stadia-as',
  'stadia-eu',
  'stadia-na',
  'stadia-oc',
  'console',
]);

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
    shard: Shard;
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
function requireEnv(env: NodeJS.ProcessEnv, name: string, defaultValue?: string): string {
  const value = env[name] || defaultValue;
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
function getNumericEnv(env: NodeJS.ProcessEnv, name: string, defaultValue: number): number {
  const value = env[name];
  if (!value) {
    return defaultValue;
  }

  const numericValue = Number.parseInt(value, 10);
  if (Number.isNaN(numericValue)) {
    warn(`Environment variable ${name} is not a valid number, using default: ${defaultValue}`);
    return defaultValue;
  }

  return numericValue;
}

function getBooleanEnv(env: NodeJS.ProcessEnv, name: string, defaultValue: boolean): boolean {
  const value = env[name];
  if (!value) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

/**
 * Loads and validates application configuration from an explicit environment value.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const shardValue = requireEnv(env, 'PUBG_SHARD', 'steam');
  if (!SHARDS.has(shardValue as Shard)) {
    throw new Error(`PUBG_SHARD is invalid: ${shardValue}`);
  }

  return validateConfig({
    discord: {
      token: requireEnv(env, 'DISCORD_TOKEN'),
      clientId: requireEnv(env, 'DISCORD_CLIENT_ID'),
      channelId: requireEnv(env, 'DISCORD_CHANNEL_ID'),
    },
    pubg: {
      apiKey: requireEnv(env, 'PUBG_API_KEY'),
      shard: shardValue as Shard,
      maxRequestsPerMinute: getNumericEnv(env, 'PUBG_MAX_REQUESTS_PER_MINUTE', 10),
    },
    database: {
      url: requireEnv(env, 'DATABASE_URL'),
    },
    monitoring: {
      checkIntervalMs: getNumericEnv(env, 'CHECK_INTERVAL_MS', 90000),
      maxMatchesToProcess: getNumericEnv(env, 'MAX_MATCHES_TO_PROCESS', 3),
    },
    llm: {
      coachingEnabled: getBooleanEnv(env, 'LLM_COACHING_ENABLED', false),
      provider: 'openrouter',
      openRouterApiKey: env.OPENROUTER_API_KEY,
      openRouterModel: env.OPENROUTER_MODEL,
      timeoutMs: getNumericEnv(env, 'LLM_TIMEOUT_MS', 8000),
    },
  });
}

/**
 * Validates the application configuration
 * @throws Error if the configuration is invalid
 */
export function validateConfig(configValue: AppConfig = appConfig): AppConfig {
  // Validate Discord configuration
  if (!configValue.discord.token) {
    throw new Error('Discord token is required');
  }

  if (!configValue.discord.clientId) {
    throw new Error('Discord client ID is required');
  }

  if (!configValue.discord.channelId) {
    throw new Error('Discord channel ID is required');
  }

  // Validate PUBG API configuration
  if (!configValue.pubg.apiKey) {
    throw new Error('PUBG API key is required');
  }

  if (configValue.pubg.maxRequestsPerMinute <= 0) {
    throw new Error('PUBG max requests per minute must be greater than 0');
  }

  // Validate database configuration
  if (!configValue.database.url) {
    throw new Error('DATABASE_URL is required');
  }

  // Validate monitoring configuration
  if (configValue.monitoring.checkIntervalMs < 5000) {
    warn('Check interval is very low, this may cause rate limiting issues');
  }

  if (configValue.monitoring.maxMatchesToProcess <= 0) {
    throw new Error('Max matches to process must be greater than 0');
  }

  if (configValue.llm.coachingEnabled && !configValue.llm.openRouterApiKey) {
    warn(
      'LLM coaching is enabled but OPENROUTER_API_KEY is missing; coaching will use template narration'
    );
  }

  if (configValue.llm.timeoutMs <= 0) {
    throw new Error('LLM timeout must be greater than 0');
  }

  success('Configuration validated successfully');
  return configValue;
}

// Temporary compatibility export until application startup owns configuration loading.
config();
export const appConfig = loadConfig(process.env);
