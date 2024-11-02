import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { Match } from '../models/match';

export class MatchRepository {
  private readonly storageFile: string;
  private matches: Match[];

  constructor() {
    this.storageFile = join(__dirname, '../../data/matches.json');
    this.matches = [];
  }

  public async initialize(): Promise<void> {
    try {
      const data = await readFile(this.storageFile, 'utf-8');
      this.matches = JSON.parse(data);
    } catch (error) {
      this.matches = [];
      await this.saveToFile();
    }
  }

  public async addMatch(match: Match): Promise<void> {
    if (await this.getMatch(match.id)) {
      return; // Match already exists
    }

    this.matches.push(match);
    await this.saveToFile();
  }

  public async getMatch(matchId: string): Promise<Match | undefined> {
    return this.matches.find(match => match.id === matchId);
  }

  public async getPlayerMatches(playerName: string, limit = 5): Promise<Match[]> {
    return this.matches
      .filter(match => playerName in match.players)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  private async saveToFile(): Promise<void> {
    try {
      await writeFile(
        this.storageFile,
        JSON.stringify(this.matches, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Failed to save matches to file:', error);
      throw new Error('Failed to save match data');
    }
  }
} 