import axios, { AxiosInstance } from 'axios';
import { RateLimiter } from '../utils/rate-limiter';

export class PubgApiService {
  private readonly apiClient: AxiosInstance;
  private readonly shard: string;
  private readonly rateLimiter: RateLimiter;

  constructor(apiKey: string, shard: string = 'steam') {
    this.shard = shard;
    this.apiClient = axios.create({
      baseURL: `https://api.pubg.com/shards/${shard}`,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/vnd.api+json'
      }
    });
    this.rateLimiter = new RateLimiter(10); // 10 requests per minute
  }

  /**
   * Makes a rate-limited API request
   * @param endpoint - API endpoint to call
   */
  private async makeRequest<T>(endpoint: string): Promise<T> {
    await this.rateLimiter.tryAcquire();
    try {
      const response = await this.apiClient.get<T>(endpoint, {
        timeout: 10000, // 10 second timeout
        timeoutErrorMessage: 'Request timed out while connecting to PUBG API'
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          // Handle rate limit exceeded
          const retryAfter = parseInt(error.response.headers['retry-after'] || '60', 10);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          return this.makeRequest<T>(endpoint);
        }
        // Add specific error message for timeouts
        if (error.code === 'ECONNABORTED') {
          throw new Error('Request timed out while connecting to PUBG API');
        }
        throw new Error(`PUBG API Error: ${error.response?.data?.errors?.[0]?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Searches for a player by their name
   * @param playerName - The name of the player to search for
   */
  public async getPlayer(playerName: string): Promise<PlayersResponse> {
    return this.makeRequest<PlayersResponse>(`/players?filter[playerNames]=${playerName}`);
  }

  /**
   * Gets the lifetime stats for multiple players
   * @param playerNames - Array of player names to retrieve stats for
   * @returns Promise containing stats for all requested players
   */
  public async getStatsforPlayers(playerNames: string[]): Promise<PlayersResponse> {
    if (playerNames.length > 10) {
      throw new Error('Cannot request stats for more than 10 players at a time.');
    }
    const playerNamesParam = playerNames.join(',');
    return this.makeRequest<PlayersResponse>(`/players?filter[playerNames]=${playerNamesParam}`);
  }

  /**
   * Gets the details of a specific match
   * @param matchId - The ID of the match to retrieve
   */
  public async getMatchDetails(matchId: string): Promise<MatchesResponse> {
    return this.makeRequest<MatchesResponse>(`matches/${matchId}`);
  }
} 
