import fetch from 'node-fetch';
import { Match, MatchStats } from '../models/match';

interface PubgApiMatch {
  data: {
    id: string;
    attributes: {
      createdAt: string;
      gameMode: string;
      mapName: string;
      stats: {
        [key: string]: {
          kills: number;
          damageDealt: number;
          winPlace: number;
          timeSurvived: number;
        };
      };
    };
  };
}

export class PubgApiService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.pubg.com/shards/steam';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  public async getPlayerMatches(playerName: string): Promise<string[]> {
    const response = await this.makeRequest(
      `/players?filter[playerNames]=${encodeURIComponent(playerName)}`
    );

    const data = await response.json();
    if (!data.data?.[0]?.relationships?.matches?.data) {
      throw new Error('Player not found or no matches available');
    }

    return data.data[0].relationships.matches.data
      .map((match: { id: string }) => match.id);
  }

  public async getMatch(matchId: string): Promise<Match | null> {
    const response = await this.makeRequest(`/matches/${matchId}`);
    const data = await response.json() as PubgApiMatch;

    if (!data.data) {
      return null;
    }

    const { attributes } = data.data;
    const players: Record<string, MatchStats> = {};

    // Convert PUBG API stats format to our format
    Object.entries(attributes.stats).forEach(([playerName, stats]) => {
      players[playerName] = {
        kills: stats.kills,
        damageDealt: stats.damageDealt,
        winPlace: stats.winPlace,
        timeSurvived: stats.timeSurvived
      };
    });

    return {
      id: matchId,
      gameMode: attributes.gameMode,
      mapName: attributes.mapName,
      createdAt: attributes.createdAt,
      players
    };
  }

  private async makeRequest(endpoint: string): Promise<Response> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/vnd.api+json'
      }
    });

    if (!response.ok) {
      throw new Error(`PUBG API error: ${response.status} ${response.statusText}`);
    }

    return response;
  }
} 