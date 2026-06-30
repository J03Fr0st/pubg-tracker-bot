import type { LogPlayerKillV2, LogPlayerMakeGroggy, LogPlayerTakeDamage } from '@j03fr0st/pubg-ts';
import { CoachingNarratorService } from '../../src/services/coaching-narrator.service';
import { DiscordBotService } from '../../src/services/discord-bot.service';
import { TelemetryProcessorService } from '../../src/services/telemetry-processor.service';
import type { DiscordMatchGroupSummary } from '../../src/types/discord-match-summary.types';

// Mock the Discord.js client and components
jest.mock('discord.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    login: jest.fn().mockResolvedValue('logged_in'),
    channels: {
      fetch: jest.fn().mockResolvedValue({
        isTextBased: jest.fn().mockReturnValue(true),
        type: 0,
        permissionsFor: jest.fn().mockReturnValue({
          has: jest.fn().mockReturnValue(true),
        }),
        send: jest.fn().mockResolvedValue({ id: 'message_id' }),
      }),
    },
  })),
  ChannelType: { GuildText: 0 },
  Events: { InteractionCreate: 'interactionCreate' },
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 2,
    MessageContent: 4,
  },
  PermissionFlagsBits: {
    ViewChannel: BigInt(1),
    SendMessages: BigInt(2),
    EmbedLinks: BigInt(4),
  },
  EmbedBuilder: jest.fn().mockImplementation(() => {
    const data: Record<string, unknown> = {};
    return {
      setTitle: jest.fn(function (this: unknown, title: string) {
        data.title = title;
        return this;
      }),
      setDescription: jest.fn(function (this: unknown, description: string) {
        data.description = description;
        return this;
      }),
      setColor: jest.fn(function (this: unknown, color: number) {
        data.color = color;
        return this;
      }),
      setFooter: jest.fn(function (this: unknown, footer: unknown) {
        data.footer = footer;
        return this;
      }),
      setTimestamp: jest.fn(function (this: unknown, timestamp: Date) {
        data.timestamp = timestamp;
        return this;
      }),
      addFields: jest.fn().mockReturnThis(),
      toJSON: jest.fn(() => data),
    };
  }),
  REST: jest.fn().mockImplementation(() => ({
    setToken: jest.fn().mockReturnThis(),
    put: jest.fn().mockResolvedValue([]),
  })),
  Routes: {
    applicationCommands: jest.fn().mockReturnValue('mock_route'),
  },
  SlashCommandBuilder: jest.fn().mockImplementation(() => ({
    setName: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    addStringOption: jest.fn().mockReturnThis(),
  })),
}));

// Mock the PUBG client
jest.mock('@j03fr0st/pubg-ts', () => ({
  assetManager: {
    getDamageCauserName: jest.fn(),
    getGameModeName: jest.fn(),
    getMapName: jest.fn(),
  },
  DAMAGE_CAUSER_NAME: {},
  DamageInfoUtils: {
    getFirst: jest.fn((damageInfo) => {
      if (!damageInfo) return null;
      return Array.isArray(damageInfo) ? (damageInfo[0] ?? null) : damageInfo;
    }),
  },
  GAME_MODES: {},
  MAP_NAMES: {},
  PubgClient: jest.fn().mockImplementation(() => ({
    telemetry: {
      getTelemetryData: jest.fn(),
    },
  })),
}));

// Mock environment variables
process.env.DISCORD_TOKEN = 'mock_discord_token';
process.env.DISCORD_CLIENT_ID = 'mock_client_id';

// Helper function to create valid player stats
function createPlayerStats(overrides: any = {}) {
  return {
    kills: 0,
    assists: 0,
    DBNOs: 0,
    damageDealt: 0,
    headshotKills: 0,
    longestKill: 0,
    revives: 0,
    timeSurvived: 0,
    walkDistance: 0,
    rideDistance: 0,
    swimDistance: 0,
    weaponsAcquired: 0,
    boosts: 0,
    heals: 0,
    killPlace: 50,
    winPlace: 50,
    deathType: 'byplayer',
    killStreaks: 0,
    name: 'DefaultPlayer',
    roadKills: 0,
    teamKills: 0,
    vehicleDestroys: 0,
    ...overrides,
  };
}

function createMockTextChannel() {
  return {
    isTextBased: jest.fn().mockReturnValue(true),
    type: 0,
    permissionsFor: jest.fn().mockReturnValue({
      has: jest.fn().mockReturnValue(true),
    }),
    send: jest.fn().mockResolvedValue({ id: 'sent_message_id' }),
  };
}

describe('Telemetry Discord Flow Integration', () => {
  let discordBotService: DiscordBotService;
  let mockTelemetryData: any[];

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    discordBotService = new DiscordBotService('mock_api_key', 'steam');
    (discordBotService as any).coachingNarrator = new CoachingNarratorService(undefined, {
      enabled: false,
      maxLineLength: 240,
    });

    // Setup mock telemetry data
    mockTelemetryData = [
      {
        _D: '2024-01-01T10:00:00.000Z',
        _T: 'LogPlayerKillV2',
        killer: { name: 'TestPlayer1' },
        victim: { name: 'Enemy1' },
        damageCauserName: 'WeapAK47_C',
        distance: 15000,
        damageReason: 'HeadShot',
      } as LogPlayerKillV2,
      // Add death event where TestPlayer1 gets killed
      {
        _D: '2024-01-01T10:02:00.000Z',
        _T: 'LogPlayerKillV2',
        killer: { name: 'Enemy2' },
        victim: { name: 'TestPlayer1' },
        damageCauserName: 'WeapSCAR_C',
        distance: 8500,
        damageReason: 'NonSpecific',
        killerDamageInfo: [
          {
            damageCauserName: 'WeapSCAR_C',
            distance: 8500,
          },
        ],
      } as LogPlayerKillV2,
      // Add knockdown event where TestPlayer1 gets knocked down
      {
        _D: '2024-01-01T10:01:30.000Z',
        _T: 'LogPlayerMakeGroggy',
        attacker: { name: 'Enemy3' },
        victim: { name: 'TestPlayer1' },
        damageCauserName: 'WeapM416_C',
        distance: 6200,
        groggyDamage: [
          {
            damageCauserName: 'WeapM416_C',
            distance: 6200,
          },
        ],
      } as LogPlayerMakeGroggy,
      {
        _D: '2024-01-01T09:59:55.000Z',
        _T: 'LogPlayerTakeDamage',
        attacker: { name: 'TestPlayer1' },
        victim: { name: 'Enemy1' },
        damageCauserName: 'WeapAK47_C',
        damage: 50,
      } as LogPlayerTakeDamage,
      {
        _D: '2024-01-01T09:59:50.000Z',
        _T: 'LogPlayerMakeGroggy',
        attacker: { name: 'TestPlayer1' },
        victim: { name: 'Enemy2' },
        damageCauserName: 'WeapM416_C',
        distance: 12000,
      } as LogPlayerMakeGroggy,
    ];
  });

  describe('sendMatchSummary with telemetry processing', () => {
    it('should create enhanced embeds when telemetry data is available', async () => {
      const mockSummary: DiscordMatchGroupSummary = {
        matchId: 'test-match-123',
        mapName: 'Erangel',
        gameMode: 'squad',
        playedAt: '2024-01-01T10:00:00.000Z',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-123',
        players: [
          {
            name: 'TestPlayer1',
            stats: createPlayerStats({
              kills: 2,
              assists: 1,
              DBNOs: 3,
              damageDealt: 450,
              headshotKills: 1,
              longestKill: 150,
              timeSurvived: 1800,
              walkDistance: 2500,
              rideDistance: 1000,
              killPlace: 15,
              winPlace: 5,
              killStreaks: 1,
              name: 'TestPlayer1',
            }),
          },
        ],
      };

      // Mock the telemetry fetch to return our test data
      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.telemetry.getTelemetryData.mockResolvedValue(mockTelemetryData);

      // Mock the channel send
      const mockChannel = createMockTextChannel();
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await discordBotService.sendMatchSummary('test-channel-id', mockSummary);

      // Verify telemetry was fetched
      expect(mockPubgClient.telemetry.getTelemetryData).toHaveBeenCalledWith(
        mockSummary.telemetryUrl
      );

      // Verify channel.send was called (should send multiple embeds)
      expect(mockChannel.send).toHaveBeenCalled();
      const sendCalls = mockChannel.send.mock.calls;
      expect(sendCalls.length).toBeGreaterThan(0);

      // Verify embeds were created (at least main embed + player embeds)
      const firstCall = sendCalls[0][0];
      expect(firstCall.embeds).toBeDefined();
      expect(firstCall.embeds.length).toBe(1);
    });

    it('should fallback to basic embeds when telemetry processing fails', async () => {
      const mockSummary: DiscordMatchGroupSummary = {
        matchId: 'test-match-456',
        mapName: 'Sanhok',
        gameMode: 'duo',
        playedAt: '2024-01-01T11:00:00.000Z',
        teamRank: 3,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-456',
        players: [
          {
            name: 'TestPlayer2',
            stats: createPlayerStats({
              kills: 1,
              assists: 2,
              DBNOs: 1,
              damageDealt: 200,
              longestKill: 75,
              revives: 1,
              timeSurvived: 1200,
              walkDistance: 1800,
              rideDistance: 500,
              killPlace: 25,
              winPlace: 3,
              name: 'TestPlayer2',
            }),
          },
        ],
      };

      // Mock telemetry fetch to throw an error
      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.telemetry.getTelemetryData.mockRejectedValue(
        new Error('Telemetry fetch failed')
      );

      // Mock the channel send
      const mockChannel = createMockTextChannel();
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      // Should not throw an error, should fallback gracefully
      await expect(
        discordBotService.sendMatchSummary('test-channel-id', mockSummary)
      ).resolves.toBeUndefined();

      // Verify telemetry fetch was attempted
      expect(mockPubgClient.telemetry.getTelemetryData).toHaveBeenCalledWith(
        mockSummary.telemetryUrl
      );

      // Verify basic embeds were still sent
      expect(mockChannel.send).toHaveBeenCalled();
    });

    it('should use basic embeds when no telemetry URL is provided', async () => {
      const mockSummary: DiscordMatchGroupSummary = {
        matchId: 'test-match-789',
        mapName: 'Miramar',
        gameMode: 'solo',
        playedAt: '2024-01-01T12:00:00.000Z',
        teamRank: 1,
        telemetryUrl: undefined, // No telemetry URL
        players: [
          {
            name: 'TestPlayer3',
            stats: createPlayerStats({
              kills: 8,
              DBNOs: 8,
              damageDealt: 800,
              headshotKills: 3,
              longestKill: 250,
              timeSurvived: 1950,
              walkDistance: 3200,
              rideDistance: 2000,
              swimDistance: 100,
              killPlace: 1,
              winPlace: 1,
              killStreaks: 2,
              name: 'TestPlayer3',
            }),
          },
        ],
      };

      // Mock the channel send
      const mockChannel = createMockTextChannel();
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      const mockPubgClient = (discordBotService as any).pubgClient;

      await discordBotService.sendMatchSummary('test-channel-id', mockSummary);

      // Verify telemetry was NOT fetched since no URL
      expect(mockPubgClient.telemetry.getTelemetryData).not.toHaveBeenCalled();

      // Verify basic embeds were sent
      expect(mockChannel.send).toHaveBeenCalled();
    });

    it('should process multiple players with telemetry data', async () => {
      const extendedTelemetryData = [
        ...mockTelemetryData,
        // Add events for Player2
        {
          _D: '2024-01-01T10:01:00.000Z',
          _T: 'LogPlayerKillV2',
          killer: { name: 'Player2' },
          victim: { name: 'Enemy3' },
          damageCauserName: 'WeapSCAR_C',
          distance: 18000,
          damageReason: 'NonSpecific',
        } as LogPlayerKillV2,
        {
          _D: '2024-01-01T10:00:55.000Z',
          _T: 'LogPlayerTakeDamage',
          attacker: { name: 'Player2' },
          victim: { name: 'Enemy3' },
          damageCauserName: 'WeapSCAR_C',
          damage: 80,
        } as LogPlayerTakeDamage,
      ];

      const mockSummary: DiscordMatchGroupSummary = {
        matchId: 'test-match-multi',
        mapName: 'Vikendi',
        gameMode: 'squad',
        playedAt: '2024-01-01T10:00:00.000Z',
        teamRank: 2,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-multi',
        players: [
          {
            name: 'TestPlayer1',
            stats: createPlayerStats({
              kills: 2,
              assists: 1,
              DBNOs: 2,
              damageDealt: 300,
              headshotKills: 1,
              longestKill: 150,
              timeSurvived: 1800,
              walkDistance: 2500,
              rideDistance: 1000,
              killPlace: 5,
              winPlace: 2,
              name: 'TestPlayer1',
            }),
          },
          {
            name: 'Player2',
            stats: createPlayerStats({
              kills: 1,
              DBNOs: 1,
              damageDealt: 200,
              longestKill: 180,
              revives: 1,
              timeSurvived: 1800,
              walkDistance: 2200,
              rideDistance: 800,
              killPlace: 8,
              winPlace: 2,
              name: 'Player2',
            }),
          },
        ],
      };

      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.telemetry.getTelemetryData.mockResolvedValue(extendedTelemetryData);

      const mockChannel = createMockTextChannel();
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await discordBotService.sendMatchSummary('test-channel-id', mockSummary);

      // Verify telemetry processing was called
      expect(mockPubgClient.telemetry.getTelemetryData).toHaveBeenCalledWith(
        mockSummary.telemetryUrl
      );

      // Verify multiple embeds were sent (main + 2 players)
      expect(mockChannel.send).toHaveBeenCalledTimes(3); // Main embed + 2 player embeds
    });

    it('should handle telemetry processor service errors gracefully', async () => {
      const mockSummary: DiscordMatchGroupSummary = {
        matchId: 'test-match-error',
        mapName: 'Erangel',
        gameMode: 'squad',
        playedAt: '2024-01-01T10:00:00.000Z',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-error',
        players: [
          {
            name: 'TestPlayer1',
            stats: createPlayerStats({
              kills: 1,
              DBNOs: 1,
              damageDealt: 150,
              longestKill: 100,
              timeSurvived: 900,
              walkDistance: 1200,
              killPlace: 20,
              winPlace: 5,
              name: 'TestPlayer1',
            }),
          },
        ],
      };

      // Mock telemetry to return invalid data that causes processor to fail
      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.telemetry.getTelemetryData.mockResolvedValue([
        { invalid: 'data', structure: true }, // Invalid telemetry data
      ]);

      const mockChannel = createMockTextChannel();
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      // Should handle the error and fallback to basic embeds
      await expect(
        discordBotService.sendMatchSummary('test-channel-id', mockSummary)
      ).resolves.toBeUndefined();

      // Verify basic embeds were still sent as fallback
      expect(mockChannel.send).toHaveBeenCalled();
    });

    it('should append a coaching embed when telemetry produces a strong coaching insight', async () => {
      const mockSummary: DiscordMatchGroupSummary = {
        matchId: 'test-match-coaching',
        mapName: 'Erangel',
        gameMode: 'squad',
        playedAt: '2024-01-01T10:00:00.000Z',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-coaching',
        players: [
          {
            name: 'TestPlayer1',
            stats: createPlayerStats({
              kills: 0,
              DBNOs: 0,
              damageDealt: 0,
              longestKill: 0,
              timeSurvived: 1122,
              winPlace: 5,
              name: 'TestPlayer1',
            }),
          },
        ],
      };

      const coachingTelemetry = [
        {
          _D: '2024-01-01T10:18:36.000Z',
          _T: 'LogPlayerTakeDamage',
          attacker: { name: 'EnemyOne' },
          victim: { name: 'TestPlayer1' },
          damage: 83,
          damageCauserName: 'WeapBerylM762_C',
        } as LogPlayerTakeDamage,
        {
          _D: '2024-01-01T10:18:42.000Z',
          _T: 'LogPlayerKillV2',
          killer: { name: 'EnemyOne' },
          victim: { name: 'TestPlayer1' },
          damageCauserName: 'WeapBerylM762_C',
          distance: 4200,
        } as LogPlayerKillV2,
      ];

      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.telemetry.getTelemetryData.mockResolvedValue(coachingTelemetry);

      const mockChannel = createMockTextChannel();
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await discordBotService.sendMatchSummary('test-channel-id', mockSummary);

      const serializedEmbeds = mockChannel.send.mock.calls
        .flatMap((call) => call[0].embeds)
        .map((embed) => embed.toJSON());

      expect(serializedEmbeds.some((embed) => embed.title === 'Coaching')).toBe(true);
      expect(JSON.stringify(serializedEmbeds)).toContain('TestPlayer1 - Decisive mistake');
      expect(JSON.stringify(serializedEmbeds)).toContain('Decisive mistake');
      expect(JSON.stringify(serializedEmbeds)).toContain('EnemyOne');
      expect(JSON.stringify(serializedEmbeds)).toContain('83 damage');
    });

    it('adds pattern to fix only when repeated coaching evidence exists', async () => {
      const mockSummary: DiscordMatchGroupSummary = {
        matchId: 'test-match-coaching-pattern',
        mapName: 'Erangel',
        gameMode: 'squad',
        playedAt: '2024-01-01T10:00:00.000Z',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-coaching-pattern',
        players: [
          {
            name: 'TestPlayer1',
            stats: createPlayerStats({ name: 'TestPlayer1', winPlace: 5 }),
          },
        ],
      };

      const telemetry = [
        {
          _D: '2024-01-01T10:10:00.000Z',
          _T: 'LogPlayerTakeDamage',
          attacker: { name: 'EnemyOne' },
          victim: { name: 'TestPlayer1' },
          damage: 83,
        },
        {
          _D: '2024-01-01T10:10:06.000Z',
          _T: 'LogPlayerMakeGroggy',
          attacker: { name: 'EnemyOne' },
          victim: { name: 'TestPlayer1' },
        },
        {
          _D: '2024-01-01T10:18:36.000Z',
          _T: 'LogPlayerTakeDamage',
          attacker: { name: 'EnemyTwo' },
          victim: { name: 'TestPlayer1' },
          damage: 90,
        },
        {
          _D: '2024-01-01T10:18:42.000Z',
          _T: 'LogPlayerKillV2',
          killer: { name: 'EnemyTwo' },
          victim: { name: 'TestPlayer1' },
        },
      ];

      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.telemetry.getTelemetryData.mockResolvedValue(telemetry);

      const mockChannel = createMockTextChannel();
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await discordBotService.sendMatchSummary('test-channel-id', mockSummary);

      const serialized = JSON.stringify(
        mockChannel.send.mock.calls.flatMap((call) => call[0].embeds).map((embed) => embed.toJSON())
      );

      expect(serialized).toContain('Decisive mistake');
      expect(serialized).toContain('Pattern to fix');
    });

    it('should still post match summary when coaching narration fails', async () => {
      const mockSummary: DiscordMatchGroupSummary = {
        matchId: 'test-match-coaching-fallback',
        mapName: 'Erangel',
        gameMode: 'squad',
        playedAt: '2024-01-01T10:00:00.000Z',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-coaching-fallback',
        players: [
          {
            name: 'TestPlayer1',
            stats: createPlayerStats({
              kills: 0,
              DBNOs: 0,
              damageDealt: 0,
              timeSurvived: 1122,
              winPlace: 5,
              name: 'TestPlayer1',
            }),
          },
        ],
      };

      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.telemetry.getTelemetryData.mockResolvedValue([
        {
          _D: '2024-01-01T10:18:36.000Z',
          _T: 'LogPlayerTakeDamage',
          attacker: { name: 'EnemyOne' },
          victim: { name: 'TestPlayer1' },
          damage: 83,
        } as LogPlayerTakeDamage,
        {
          _D: '2024-01-01T10:18:42.000Z',
          _T: 'LogPlayerKillV2',
          killer: { name: 'EnemyOne' },
          victim: { name: 'TestPlayer1' },
        } as LogPlayerKillV2,
      ]);

      (discordBotService as any).coachingNarrator = {
        narrate: jest.fn().mockRejectedValue(new Error('Narration failed')),
      };

      const mockChannel = createMockTextChannel();
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await expect(
        discordBotService.sendMatchSummary('test-channel-id', mockSummary)
      ).resolves.toBeUndefined();
      expect(mockChannel.send).toHaveBeenCalled();
    });

    it('includes opponent difficulty on the main summary when opponent season stats exist', async () => {
      const mockSummary: DiscordMatchGroupSummary = {
        matchId: 'test-match-difficulty',
        mapName: 'Erangel',
        gameMode: 'squad',
        playedAt: '2024-01-01T10:00:00.000Z',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-difficulty',
        players: [
          {
            name: 'TestPlayer1',
            pubgId: 'tracked-1',
            stats: createPlayerStats({
              kills: 0,
              DBNOs: 0,
              damageDealt: 0,
              timeSurvived: 1122,
              winPlace: 5,
              name: 'TestPlayer1',
            }),
          },
        ],
      };

      const telemetry = [
        {
          _D: '2024-01-01T10:02:00.000Z',
          _T: 'LogPlayerKillV2',
          killer: { name: 'EnemyOne', accountId: 'enemy-1' },
          victim: { name: 'TestPlayer1', accountId: 'tracked-1' },
          damageCauserName: 'WeapBerylM762_C',
        } as LogPlayerKillV2,
      ];

      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.telemetry.getTelemetryData.mockResolvedValue(telemetry);

      // Force the live telemetry path and avoid DB-backed lookups
      (discordBotService as any).telemetryRepository = {
        getCachedAnalyses: jest.fn().mockResolvedValue(null),
        saveTelemetry: jest.fn().mockResolvedValue(undefined),
      };
      (discordBotService as any).matchRepository = {
        findMatch: jest.fn().mockResolvedValue(null),
      };
      (discordBotService as any).playerStatsService = {
        getSeasonStats: jest
          .fn()
          .mockResolvedValue(new Map([['enemy-1', { kd: 1.5, adr: 225 }]])),
      };

      const mockChannel = createMockTextChannel();
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await discordBotService.sendMatchSummary('test-channel-id', mockSummary);

      const firstCall = mockChannel.send.mock.calls[0][0];
      const mainEmbed = firstCall.embeds[0].toJSON();

      expect(mainEmbed.description).toContain(
        '⚔️ Opponent Difficulty: **Hard** (75/100, 1 opponent)'
      );
    });

    it('excludes bot opponents from the season stats lookup', async () => {
      const mockSummary: DiscordMatchGroupSummary = {
        matchId: 'test-bot-opponent',
        mapName: 'Erangel',
        gameMode: 'squad',
        playedAt: '2024-01-01T10:00:00.000Z',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-bot-opponent',
        players: [
          {
            name: 'TestPlayer1',
            pubgId: 'tracked-1',
            stats: createPlayerStats({
              kills: 1,
              DBNOs: 0,
              damageDealt: 100,
              timeSurvived: 1122,
              winPlace: 5,
              name: 'TestPlayer1',
            }),
          },
        ],
      };

      const telemetry = [
        {
          _D: '2024-01-01T10:01:00.000Z',
          _T: 'LogPlayerKillV2',
          killer: { name: 'TestPlayer1', accountId: 'tracked-1' },
          victim: { name: 'BotEnemy', accountId: 'ai.1' },
          damageCauserName: 'WeapBerylM762_C',
        } as LogPlayerKillV2,
        {
          _D: '2024-01-01T10:02:00.000Z',
          _T: 'LogPlayerKillV2',
          killer: { name: 'EnemyOne', accountId: 'enemy-1' },
          victim: { name: 'TestPlayer1', accountId: 'tracked-1' },
          damageCauserName: 'WeapBerylM762_C',
        } as LogPlayerKillV2,
      ];

      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.telemetry.getTelemetryData.mockResolvedValue(telemetry);

      (discordBotService as any).telemetryRepository = {
        getCachedAnalyses: jest.fn().mockResolvedValue(null),
        saveTelemetry: jest.fn().mockResolvedValue(undefined),
      };
      (discordBotService as any).matchRepository = {
        findMatch: jest.fn().mockResolvedValue(null),
      };
      const getSeasonStats = jest
        .fn()
        .mockResolvedValue(new Map([['enemy-1', { kd: 1.5, adr: 225 }]]));
      (discordBotService as any).playerStatsService = { getSeasonStats };

      const mockChannel = createMockTextChannel();
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await discordBotService.sendMatchSummary('test-channel-id', mockSummary);

      expect(getSeasonStats).toHaveBeenCalled();
      const requestedAccountIds = getSeasonStats.mock.calls[0][0];
      expect(requestedAccountIds).not.toContain('ai.1');
      expect(requestedAccountIds).toContain('enemy-1');
    });

    it('includes lobby difficulty with bots on the main summary when participants are saved', async () => {
      const mockSummary: DiscordMatchGroupSummary = {
        matchId: 'test-lobby-difficulty',
        mapName: 'Erangel',
        gameMode: 'squad',
        playedAt: '2024-01-01T10:00:00.000Z',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-lobby-difficulty',
        players: [
          {
            name: 'TestPlayer1',
            pubgId: 'tracked-1',
            stats: createPlayerStats({
              kills: 0,
              DBNOs: 0,
              damageDealt: 0,
              timeSurvived: 1122,
              winPlace: 5,
              name: 'TestPlayer1',
            }),
          },
        ],
      };

      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.telemetry.getTelemetryData.mockResolvedValue([]);

      (discordBotService as any).telemetryRepository = {
        getCachedAnalyses: jest.fn().mockResolvedValue(null),
        saveTelemetry: jest.fn().mockResolvedValue(undefined),
      };
      (discordBotService as any).matchRepository = {
        findMatch: jest.fn().mockResolvedValue({
          participants: [
            { pubgId: 'tracked-1', kills: 0, damageDealt: 0, winPlace: 5 },
            { pubgId: 'enemy-1', kills: 0, damageDealt: 0, winPlace: 5 },
            { pubgId: 'enemy-1', kills: 0, damageDealt: 0, winPlace: 5 },
            { pubgId: 'ai.1', kills: 0, damageDealt: 0, winPlace: 5 },
            { pubgId: 'ai.1', kills: 0, damageDealt: 0, winPlace: 5 },
          ],
        }),
      };
      (discordBotService as any).playerStatsService = {
        getSeasonStats: jest.fn().mockResolvedValue(
          new Map([
            ['tracked-1', { kd: 1.0, adr: 150 }],
            ['enemy-1', { kd: 2.0, adr: 300 }],
          ])
        ),
      };

      const mockChannel = createMockTextChannel();
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await discordBotService.sendMatchSummary('test-channel-id', mockSummary);

      const firstCall = mockChannel.send.mock.calls[0][0];
      const mainEmbed = firstCall.embeds[0].toJSON();

      expect(mainEmbed.description).toContain(
        '🏟️ Lobby Difficulty: **Standard** (50/100, 3 players: 2 humans, 1 bot)'
      );
    });
  });

  describe('telemetry processor integration', () => {
    it('should create telemetry processor instance in constructor', () => {
      const telemetryProcessor = (discordBotService as any).telemetryProcessor;
      expect(telemetryProcessor).toBeInstanceOf(TelemetryProcessorService);
    });

    it('should pass correct parameters to telemetry processor', async () => {
      const mockSummary: DiscordMatchGroupSummary = {
        matchId: 'integration-test-match',
        mapName: 'Erangel',
        gameMode: 'duo',
        playedAt: '2024-01-01T10:30:00.000Z',
        teamRank: 4,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/integration-test-match',
        players: [{ name: 'IntegrationPlayer', stats: undefined }],
      };

      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.telemetry.getTelemetryData.mockResolvedValue(mockTelemetryData);

      const mockChannel = createMockTextChannel();
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      // Spy on the telemetry processor
      const telemetryProcessor = (discordBotService as any).telemetryProcessor;
      const processSpy = jest.spyOn(telemetryProcessor, 'processMatchTelemetry');

      await discordBotService.sendMatchSummary('test-channel-id', mockSummary);

      // Verify the processor was called with correct parameters
      expect(processSpy).toHaveBeenCalledWith(
        mockTelemetryData, // telemetryData
        'integration-test-match', // matchId
        expect.any(Date), // matchDate
        ['IntegrationPlayer'] // trackedPlayerNames
      );

      processSpy.mockRestore();
    });

    it('should process timeline events with damage data', async () => {
      const mockSummary: DiscordMatchGroupSummary = {
        matchId: 'timeline-test-match',
        mapName: 'Erangel',
        gameMode: 'duo',
        playedAt: '2024-01-01T10:30:00.000Z',
        teamRank: 4,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/timeline-test-match',
        players: [{ name: 'TestPlayer1', stats: undefined }],
      };

      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.telemetry.getTelemetryData.mockResolvedValue(mockTelemetryData);

      const mockChannel = createMockTextChannel();
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await discordBotService.sendMatchSummary('test-channel-id', mockSummary);

      // Verify channel.send was called
      expect(mockChannel.send).toHaveBeenCalled();
    });
  });
});
