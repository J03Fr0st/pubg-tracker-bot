import { PubgApiService } from './services/pubg-api.service';
import dotenv from 'dotenv';

dotenv.config();

const pubgApiService = new PubgApiService(process.env.PUBG_API_KEY as string);

async function main() {
  try {
    const player = await pubgApiService.getPlayer('playerName');
    const accountId = player.data[0].id;
    const stats = await pubgApiService.getPlayerStats(accountId);
    console.log('Player Stats:', stats);
  } catch (error) {
    console.error('Error:', error);
  }
}

main(); 