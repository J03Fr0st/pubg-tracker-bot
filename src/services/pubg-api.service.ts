import axios, { AxiosInstance } from 'axios';
import { RateLimiter } from '../utils/rate-limiter';
import { PubgStorageService } from '../services/pubg-storage.service';
import { PlayersResponse } from '../types/pubg-player-api.types';
import { Asset, MatchesResponse } from '../types/pubg-matches-api.types';
import { LogPlayerKillV2, LogPlayerMakeGroggy } from '../types/pubg-telemetry.types';
import { api, warn, error } from '../utils/logger';

export class PubgApiService {
  private readonly apiClient: AxiosInstance;
  private readonly shard: string;
  private readonly rateLimiter: RateLimiter;
  private readonly storageService: PubgStorageService;

  constructor(
    apiKey: string,
    shard: string = 'steam',
    storageService: PubgStorageService = new PubgStorageService(),
    apiClient?: AxiosInstance,
    rateLimiter?: RateLimiter
  ) {
    this.shard = shard;
    this.apiClient = apiClient ?? axios.create({
      baseURL: `https://api.pubg.com/shards/${shard}`,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/vnd.api+json'
      }
    });
    this.rateLimiter = rateLimiter ?? new RateLimiter(10);
    this.storageService = storageService;
  }

  /**
   * Makes a rate-limited API request
   * @param endpoint - API endpoint to call
   * @param retryCount - Number of retries attempted (used internally)
   */
  public async makeRequest<T>(endpoint: string, retryCount = 0): Promise<T> {
    const MAX_RETRIES = 3;

    await this.rateLimiter.tryAcquire();
    try {
      // Only log API requests in debug mode to reduce noise
      if (process.env.NODE_ENV === 'development') {
        api(`Making API request to ${endpoint}`);
      }
      const response = await this.apiClient.get<T>(endpoint, {
        timeout: 10000, // 10 second timeout
        timeoutErrorMessage: 'Request timed out while connecting to PUBG API'
      });
      return response.data;
    } catch (apiError) {
      if (axios.isAxiosError(apiError)) {
        // Handle rate limit exceeded
        if (apiError.response?.status === 429) {
          const retryAfter = parseInt(apiError.response.headers['retry-after'] || '60', 10);
          warn(`Rate limit exceeded. Retrying after ${retryAfter} seconds.`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          return this.makeRequest<T>(endpoint, retryCount);
        }

        // Handle server errors (5xx) with retry
        if (apiError.response?.status && apiError.response.status >= 500 && retryCount < MAX_RETRIES) {
          const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
          warn(`Server error (${apiError.response.status}). Retry ${retryCount + 1}/${MAX_RETRIES} after ${delay}ms.`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.makeRequest<T>(endpoint, retryCount + 1);
        }

        // Add specific error message for timeouts
        if (apiError.code === 'ECONNABORTED') {
          if (retryCount < MAX_RETRIES) {
            const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
            warn(`Request timed out. Retry ${retryCount + 1}/${MAX_RETRIES} after ${delay}ms.`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return this.makeRequest<T>(endpoint, retryCount + 1);
          }
          throw new Error('Request timed out while connecting to PUBG API after multiple retries');
        }

        // Handle other errors
        const errorMessage = apiError.response?.data?.errors?.[0]?.message || apiError.message;
        error(`PUBG API Error: ${errorMessage}`, {
          status: apiError.response?.status,
          endpoint,
          errorCode: apiError.code
        });
        throw new Error(`PUBG API Error: ${errorMessage}`);
      }

      // Handle non-Axios errors
      error(`Unexpected error in PUBG API request:`, apiError as Error);
      throw apiError;
    }
  }

  /**
   * Searches for a player by their name and saves to database
   */
  public async getPlayer(playerName: string): Promise<PlayersResponse> {
    const response = await this.makeRequest<PlayersResponse>(`/players?filter[playerNames]=${playerName}`);    
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
    
    const startTime = Date.now();
    const playerNamesParam = playerNames.join(',');
    const response = await this.makeRequest<PlayersResponse>(`/players?filter[playerNames]=${playerNamesParam}`);

    // Save player data using storage service
    for (const player of response.data) {
        await this.storageService.addPlayer(player);
    }
    
    // Log performance in debug mode
    if (process.env.NODE_ENV === 'development') {
      const duration = Date.now() - startTime;
      api(`Retrieved ${response.data.length} players in ${duration}ms`);
    }
    
    return response;
  }

  /**
   * Gets the match details and saves to database
   */
  public async getMatchDetails(matchId: string): Promise<MatchesResponse> {
    const response = await this.makeRequest<MatchesResponse>(`matches/${matchId}`);

    const asset = response.included.filter(
      (item): item is Asset => item.type === 'asset'
    );

    const telemetryUrl = asset[0].attributes.URL;    

    response.telemetryUrl = telemetryUrl;
    return response;
  }

  /**
   * Fetches telemetry data from the given URL and filters LogPlayerKillV2 events.
   * @param telemetryUrl The URL to fetch telemetry data from.
   * @param squadPlayerNames The names of players in the squad to filter events by.
   * @returns A promise that resolves to an array of filtered LogPlayerKillV2 events.
   */
  async fetchAndFilterLogPlayerKillV2Events(
    telemetryUrl: string,
    squadPlayerNames: string[]
  ): Promise<{ kills: LogPlayerKillV2[]; groggies: LogPlayerMakeGroggy[] }> {
    try {
      const response = await axios.get(telemetryUrl);
      const events: any[] = response.data;

      const kills = events
        .filter(event => event._T === 'LogPlayerKillV2')
        .filter((event: LogPlayerKillV2) => {
          const killerName = event.killer?.name;
          const victimName = event.victim?.name;
          const dBNOMaker = event.dBNOMaker?.name;
          const finisher = event.finisher?.name;

          return (
            (killerName && squadPlayerNames.includes(killerName)) ||
            (victimName && squadPlayerNames.includes(victimName)) ||
            (dBNOMaker && squadPlayerNames.includes(dBNOMaker)) ||
            (finisher && squadPlayerNames.includes(finisher)) ||
            (victimName && squadPlayerNames.includes(victimName))
          );
        });

      const groggies = events
        .filter(event => event._T === 'LogPlayerMakeGroggy')
        .filter((event: LogPlayerMakeGroggy) => {
          const attackerName = event.attacker?.name;
          const victimName = event.victim?.name;

          return (
            (attackerName && squadPlayerNames.includes(attackerName)) ||
            (victimName && squadPlayerNames.includes(victimName))
          );
        });

      return { kills, groggies };
    } catch (telemetryError) {
      error('Error fetching telemetry data:', telemetryError as Error);
      throw telemetryError;
    }
  }
} 
