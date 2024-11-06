import { config } from 'dotenv';
import { connect } from 'mongoose';
import { PubgApiService } from './services/pubg-api.service';
import { PubgStorageService } from './services/pubg-storage.service';
import { DiscordBotService } from './services/discord-bot.service';
import { MatchMonitorService } from './services/match-monitor.service';

async function main(): Promise<void> {
    config();
    
    await connect(process.env.MONGODB_URI!);
    
    const pubgApi = new PubgApiService(process.env.PUBG_API_KEY!);
    const pubgStorage = new PubgStorageService();
    const discordBot = new DiscordBotService(pubgStorage, pubgApi);
    const matchMonitor = new MatchMonitorService(pubgApi, pubgStorage, discordBot);

    await discordBot.initialize();
    await matchMonitor.startMonitoring();
}

main().catch(console.error); 