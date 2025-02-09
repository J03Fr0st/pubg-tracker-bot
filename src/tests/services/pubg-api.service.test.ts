import { PubgApiService } from '../../services/pubg-api.service';
import { RateLimiter } from '../../utils/rate-limiter';
import { AxiosInstance } from 'axios';
import { PlayersResponse } from '../../types/pubg-player-api.types';

describe('PubgApiService', () => {
  let pubgApiService: PubgApiService;
  let mockApiClient: jest.Mocked<AxiosInstance>;
  let mockRateLimiter: jest.Mocked<RateLimiter>;

  beforeEach(() => {
    mockApiClient = {
      get: jest.fn(),
      defaults: { headers: { common: {} } },
      interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
      getUri: jest.fn(),
      head: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      patch: jest.fn(),
      postForm: jest.fn(),
      putForm: jest.fn(),
      patchForm: jest.fn(),
      request: jest.fn()
    } as any;
    mockRateLimiter = {
      tryAcquire: jest.fn().mockResolvedValue(undefined)
    } as any;

    pubgApiService = new PubgApiService(
      'test-api-key',
      'steam',
      undefined,
      mockApiClient,
      mockRateLimiter
    );
  });

  it('should be defined', () => {
    expect(pubgApiService).toBeDefined();
  });

  describe('getPlayer', () => {
    it('should call the API with the correct player name', async () => {
      const playerName = 'testPlayer';
      const expectedEndpoint = `/players?filter[playerNames]=${playerName}`;
      mockApiClient.get.mockResolvedValue({  { } });

      await pubgApiService.getPlayer(playerName);

      expect(mockApiClient.get).toHaveBeenCalledWith(expectedEndpoint, expect.anything());
    });

    it('should return the player data from the API', async () => {
      const playerName = 'testPlayer';
      const expectedResponse: PlayersResponse = {
         [],
        links: {
          self: 'test'
        },
        meta: {}
      };
      mockApiClient.get.mockResolvedValue({  expectedResponse });

      const result = await pubgApiService.getPlayer(playerName);

      expect(result).toEqual(expectedResponse);
    });
  });
});
