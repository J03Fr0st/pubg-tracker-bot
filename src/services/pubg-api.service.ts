import axios, { AxiosInstance } from 'axios';
import { PlayerSearchResult, PlayerStats, MatchDetails } from '../types/pubg-api.types';
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
  public async getPlayer(playerName: string): Promise<PlayerSearchResult> {
    return this.makeRequest<PlayerSearchResult>(`/players?filter[playerNames]=${playerName}`);
  }

  /**
   * Gets the lifetime stats for a player
   * @param accountId - The account ID of the player
   */
  public async getPlayerStats(accountId: string): Promise<PlayerStats> {
    return this.makeRequest<PlayerStats>(`/players/${accountId}/seasons/lifetime`);
  }

  /**
   * Gets the details of a specific match
   * @param matchId - The ID of the match to retrieve
   */
  public async getMatchDetails(matchId: string): Promise<MatchDetails> {
    return this.makeRequest<MatchDetails>(`/matches/${matchId}`);
  }
} 