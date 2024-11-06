import axios, { AxiosInstance } from 'axios';
import { RateLimiter } from '../utils/rate-limiter';
import { PlayerRepository } from '../data/repositories/player.repository';
import { MatchRepository } from '../data/repositories/match.repository';

export class PubgApiService {
  private readonly apiClient: AxiosInstance;
  private readonly shard: string;
  private readonly rateLimiter: RateLimiter;
  private readonly playerRepository: PlayerRepository;
  private readonly matchRepository: MatchRepository;

  constructor(
    apiKey: string, 
    shard: string = 'steam',
    playerRepository: PlayerRepository = new PlayerRepository(),
    matchRepository: MatchRepository = new MatchRepository()
  ) {
    this.shard = shard;
    this.apiClient = axios.create({
      baseURL: `https://api.pubg.com/shards/${shard}`,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/vnd.api+json'
      }
    });
    this.rateLimiter = new RateLimiter(10);
    this.playerRepository = playerRepository;
    this.matchRepository = matchRepository;
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
   * Searches for a player by their name and saves to database
   */
  public async getPlayer(playerName: string): Promise<PlayersResponse> {
    const response = await this.makeRequest<PlayersResponse>(`/players?filter[playerNames]=${playerName}`);
    // Save player data using repository
    await Promise.all(response.data.map(player => this.playerRepository.savePlayer(player)));
    return response;
  }

  /**
   * Gets the lifetime stats for multiple players
   * @param playerNames - Array of player names to retrieve stats for
   * @returns Promise containing stats for all requested players
   */
  public async getStatsForPlayers(playerNames: string[]): Promise<PlayersResponse> {
    if (playerNames.length > 10) {
      throw new Error('Cannot request stats for more than 10 players at a time.');
    }
    const playerNamesParam = playerNames.join(',');
    const response = await this.makeRequest<PlayersResponse>(`/players?filter[playerNames]=${playerNamesParam}`);
    
    // Save player data using repository
    await Promise.all(response.data.map(player => this.playerRepository.savePlayer(player)));
    return response;
  }

  /**
   * Gets the match details and saves to database
   */
  public async getMatchDetails(matchId: string): Promise<MatchesResponse> {
    const response = await this.makeRequest<MatchesResponse>(`matches/${matchId}?include=participants`);
    const participants = response.included.filter(
      (item): item is Participant => item.type === 'participant'
    );
    
    await this.matchRepository.saveMatch(response.data, participants);
    return response;
  }
} 
