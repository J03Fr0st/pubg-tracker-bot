export interface Config {
  readonly DISCORD_TOKEN: string;
  readonly PUBG_API_KEY: string;
  readonly MONITOR_CHANNEL_ID: string;
  readonly COMMAND_PREFIX: string;
}

export function loadConfig(): Config {
  const requiredEnvVars = [
    'DISCORD_TOKEN',
    'PUBG_API_KEY',
    'MONITOR_CHANNEL_ID',
    'COMMAND_PREFIX'
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  return {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN as string,
    PUBG_API_KEY: process.env.PUBG_API_KEY as string,
    MONITOR_CHANNEL_ID: process.env.MONITOR_CHANNEL_ID as string,
    COMMAND_PREFIX: process.env.COMMAND_PREFIX as string
  };
} 