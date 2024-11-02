import { PubgMonitor } from '../../services/pubg-monitor';
import { Config } from '../../config/config';
import { Client, TextChannel } from 'discord.js';
import fetch, { Response } from 'node-fetch';

jest.mock('node-fetch');
jest.mock('discord.js');

describe('PubgMonitor', () => {
  let monitor: PubgMonitor;
  let mockConfig: Config;
  let mockClient: jest.Mocked<Client>;
  const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    mockConfig = {
      DISCORD_TOKEN: 'test_token',
      PUBG_API_KEY: 'test_api_key',
      MONITOR_CHANNEL_ID: 'test_channel',
      COMMAND_PREFIX: '!'
    };

    mockClient = {
      channels: {
        fetch: jest.fn()
      }
    } as unknown as jest.Mocked<Client>;

    monitor = new PubgMonitor(mockConfig, mockClient);
  });

  describe('checkPlayerMatches', () => {
    it('should fetch player matches from PUBG API', async () => {
      const mockResponse = {
        data: [{
          relationships: {
            matches: {
              data: [
                { id: 'match1' },
                { id: 'match2' }
              ]
            }
          }
        }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response);

      const matches = await monitor['checkPlayerMatches']('testPlayer');

      expect(matches).toEqual(['match1', 'match2']);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/players?filter[playerNames]=testPlayer'),
        expect.any(Object)
      );
    });

    it('should throw error when player not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] })
      } as Response);

      await expect(monitor['checkPlayerMatches']('nonexistentPlayer'))
        .rejects
        .toThrow('Player not found or no matches available');
    });
  });
}); 