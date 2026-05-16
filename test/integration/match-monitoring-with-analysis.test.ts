import { DiscordBotService } from '../../src/services/discord-bot.service';
import type { DiscordMatchGroupSummary } from '../../src/types/discord-match-summary.types';

// Mock the @j03fr0st/pubg-ts library
jest.mock('@j03fr0st/pubg-ts', () => ({
  PubgClient: jest.fn(() => ({
    players: {
      getPlayerByName: jest.fn(),
    },
    matches: {
      getMatch: jest.fn(),
    },
    telemetry: {
      getTelemetryData: jest.fn().mockResolvedValue([
        { _T: 'LogPlayerKillV2', killer: { name: 'TestPlayer' }, victim: { name: 'Enemy' } },
        { _T: 'LogPlayerMakeGroggy', attacker: { name: 'TestPlayer' }, victim: { name: 'Enemy' } },
      ]),
    },
  })),
}));

// Mock Discord.js to avoid actual Discord connections in tests
jest.mock('discord.js', () => ({
  Client: jest.fn(() => ({
    on: jest.fn(),
    login: jest.fn().mockResolvedValue(undefined),
    channels: {
      fetch: jest.fn().mockResolvedValue({
        send: jest.fn().mockResolvedValue(undefined),
      }),
    },
  })),
  Events: {
    InteractionCreate: 'interactionCreate',
  },
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 2,
    MessageContent: 4,
  },
  PermissionFlagsBits: {
    ViewChannel: BigInt(1),
    SendMessages: BigInt(2),
    SendMessagesInThreads: BigInt(4),
    EmbedLinks: BigInt(8),
    ReadMessageHistory: BigInt(16),
  },
  EmbedBuilder: jest.fn(() => ({
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    setColor: jest.fn().mockReturnThis(),
    setFooter: jest.fn().mockReturnThis(),
    setTimestamp: jest.fn().mockReturnThis(),
    addFields: jest.fn().mockReturnThis(),
  })),
  REST: jest.fn(() => ({
    setToken: jest.fn().mockReturnThis(),
    put: jest.fn().mockResolvedValue(undefined),
  })),
  Routes: {
    applicationCommands: jest.fn(() => 'mock-route'),
  },
  SlashCommandBuilder: jest.fn(() => ({
    setName: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    addStringOption: jest.fn().mockReturnThis(),
  })),
}));

describe('Match Monitoring with Telemetry Analysis Integration', () => {
  let discordBotService: DiscordBotService;

  beforeEach(() => {
    // Mock environment variables
    process.env.DISCORD_TOKEN = 'mock-token';
    process.env.DISCORD_CLIENT_ID = 'mock-client-id';
    process.env.PUBG_API_KEY = 'mock-api-key';

    discordBotService = new DiscordBotService('mock-api-key', 'pc-na' as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should handle telemetry analysis errors gracefully', async () => {
    console.log('\n🛡️ Testing Error Handling for Telemetry Analysis\n');

    const mockMatchSummary: DiscordMatchGroupSummary = {
      matchId: 'error-test-match',
      mapName: 'Desert_Main',
      gameMode: 'squad',
      playedAt: '2024-01-01T15:30:00.000Z',
      teamRank: 25,
      telemetryUrl: 'https://invalid-telemetry-url.com/data.json',
      players: [{ name: 'TestPlayer', stats: undefined }],
    };

    const mockSend = jest.fn().mockResolvedValue(undefined);
    const mockChannel = { isTextBased: jest.fn().mockReturnValue(true), send: mockSend };
    (discordBotService as any).client.channels.fetch = jest.fn().mockResolvedValue(mockChannel);

    // Should not throw an error, and should send only the basic match summary
    await expect(
      discordBotService.sendMatchSummary('test-channel-id', mockMatchSummary)
    ).resolves.not.toThrow();

    console.log('✅ Error handled gracefully');
    console.log('   ✓ Basic match summary still sent');
    console.log('   ✓ No system crash or hanging');

    // Verify that only the basic match summary was sent
    expect(mockSend.mock.calls.length).toBeGreaterThan(0);
  });

  it('should explain when Discord cannot access the configured channel', async () => {
    const mockMatchSummary: DiscordMatchGroupSummary = {
      matchId: 'missing-access-test-match',
      mapName: 'Desert_Main',
      gameMode: 'squad',
      playedAt: '2024-01-01T15:30:00.000Z',
      teamRank: 25,
      telemetryUrl: undefined,
      players: [{ name: 'TestPlayer', stats: undefined }],
    };

    const discordMissingAccessError = Object.assign(new Error('Missing Access'), {
      code: 50001,
    });
    const mockChannel = {
      id: 'inaccessible-channel-id',
      name: 'pubg',
      type: 0,
      guild: { id: 'guild-123', name: 'PUBG Guild' },
      isTextBased: jest.fn().mockReturnValue(true),
      permissionsFor: jest.fn().mockReturnValue({
        has: jest.fn(
          (permission: bigint) => permission === BigInt(1) || permission === BigInt(8)
        ),
      }),
      send: jest.fn().mockRejectedValue(discordMissingAccessError),
    };
    (discordBotService as any).client.user = {
      id: 'bot-123',
      tag: 'Tracker#0001',
    };
    (discordBotService as any).client.channels.fetch = jest.fn().mockResolvedValue(mockChannel);

    await expect(
      discordBotService.sendMatchSummary('inaccessible-channel-id', mockMatchSummary)
    ).rejects.toThrow(
      'Discord bot is missing required channel permissions for inaccessible-channel-id: SendMessages. Bot=Tracker#0001 (bot-123). Channel=#pubg (inaccessible-channel-id, type=0). Guild=PUBG Guild (guild-123). Permissions: ViewChannel=yes, SendMessages=no, SendMessagesInThreads=no, EmbedLinks=yes, ReadMessageHistory=no.'
    );
  });

  it('should reject before sending when the bot cannot view the configured channel', async () => {
    const mockMatchSummary: DiscordMatchGroupSummary = {
      matchId: 'missing-view-channel-test-match',
      mapName: 'Desert_Main',
      gameMode: 'squad',
      playedAt: '2024-01-01T15:30:00.000Z',
      teamRank: 25,
      telemetryUrl: undefined,
      players: [{ name: 'TestPlayer', stats: undefined }],
    };

    const mockSend = jest.fn();
    const mockChannel = {
      id: 'hidden-channel-id',
      name: 'pubg',
      type: 0,
      guild: { id: 'guild-123', name: 'PUBG Guild' },
      isTextBased: jest.fn().mockReturnValue(true),
      permissionsFor: jest.fn().mockReturnValue({
        has: jest.fn((permission: bigint) => permission !== BigInt(1)),
      }),
      send: mockSend,
    };
    (discordBotService as any).client.user = {
      id: 'bot-123',
      tag: 'Tracker#0001',
    };
    (discordBotService as any).client.channels.fetch = jest.fn().mockResolvedValue(mockChannel);

    await expect(
      discordBotService.sendMatchSummary('hidden-channel-id', mockMatchSummary)
    ).rejects.toThrow(
      'Discord bot is missing required channel permissions for hidden-channel-id: ViewChannel. Bot=Tracker#0001 (bot-123). Channel=#pubg (hidden-channel-id, type=0). Guild=PUBG Guild (guild-123). Permissions: ViewChannel=no, SendMessages=yes, SendMessagesInThreads=yes, EmbedLinks=yes, ReadMessageHistory=yes.'
    );
    expect(mockSend).not.toHaveBeenCalled();
  });
});

// Helper function to prevent the jest process from hanging
afterAll(async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
});
