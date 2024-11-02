import { CommandHandler } from '../../handlers/command-handler';
import { Config } from '../../config/config';
import { Message } from 'discord.js';

describe('CommandHandler', () => {
  let handler: CommandHandler;
  let mockConfig: Config;
  let mockMessage: jest.Mocked<Message>;

  beforeEach(() => {
    mockConfig = {
      DISCORD_TOKEN: 'test_token',
      PUBG_API_KEY: 'test_api_key',
      MONITOR_CHANNEL_ID: 'test_channel',
      COMMAND_PREFIX: '!'
    };

    mockMessage = {
      content: '',
      reply: jest.fn(),
      author: { bot: false }
    } as unknown as jest.Mocked<Message>;

    handler = new CommandHandler(mockConfig);
  });

  describe('handleMessage', () => {
    it('should ignore messages not starting with prefix', async () => {
      mockMessage.content = 'not a command';
      await handler.handleMessage(mockMessage);
      expect(mockMessage.reply).not.toHaveBeenCalled();
    });

    it('should handle addplayer command', async () => {
      mockMessage.content = '!addplayer TestPlayer';
      await handler.handleMessage(mockMessage);
      expect(mockMessage.reply).toHaveBeenCalledWith(
        expect.stringContaining('TestPlayer')
      );
    });
  });
}); 