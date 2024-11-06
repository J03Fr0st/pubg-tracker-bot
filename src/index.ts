import { PubgApiService } from './services/pubg-api.service';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const pubgApiService = new PubgApiService(process.env.PUBG_API_KEY as string);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pubg-stats';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

async function main() {
  try {
    const stats = await pubgApiService.getStatsForPlayers(['J03Fr0st']);
    console.log('Player Stats:', stats);
  } catch (error) {
    console.error('Error:', error);
  }
}

main(); 