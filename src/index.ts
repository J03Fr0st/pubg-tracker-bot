import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import { join } from 'path';
import { loadConfig } from './config/config';
import { CommandHandler } from './handlers/command-handler';
import { PubgMonitor } from './services/pubg-monitor';
import { ensureDataDirectory } from './utils/ensure-directory';

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: join(__dirname, '..', envFile) });

async function startBot(): Promise<void> {
  await ensureDataDirectory();
  
  const config = loadConfig();
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  const commandHandler = new CommandHandler(config);
  const pubgMonitor = new PubgMonitor(config, client);

  client.on('ready', () => {
    console.log(`Logged in as ${client.user?.tag}`);
    pubgMonitor.startMonitoring();
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    await commandHandler.handleMessage(message);
  });

  await client.login(config.DISCORD_TOKEN);
}

// Only start the bot if not in test environment
if (process.env.NODE_ENV !== 'test') {
  startBot().catch(console.error);
}

export { startBot }; 