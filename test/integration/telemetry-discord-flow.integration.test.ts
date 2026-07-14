import {
  type LogHeal,
  type LogPlayerKillV2,
  type LogPlayerMakeGroggy,
  type LogPlayerTakeDamage,
  PubgClient,
} from '@j03fr0st/pubg-ts';
import { Client } from 'discord.js';
import { MatchRepository } from '../../src/data/repositories/match.repository';
import { PlayerRepository } from '../../src/data/repositories/player.repository';
import { TelemetryRepository } from '../../src/data/repositories/telemetry.repository';
import { CoachingNarratorService } from '../../src/services/coaching-narrator.service';
import { DiscordBotService } from '../../src/services/discord-bot.service';
import { MatchInterpreter } from '../../src/services/match-interpreter.service';
import { PlayerStatsService } from '../../src/services/player-stats.service';
import { TelemetryProcessorService } from '../../src/services/telemetry-processor.service';
import { makeMatchResponse } from '../fixtures/match-response.fixture';
import {
  MATCH_PLAYED_AT,
  makeMatchParticipantStats,
  makeMatchSummary,
  matchEventAt,
} from '../fixtures/match-summary.fixture';

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
    assets: {
      getDamageCauserName: jest.fn(),
      getGameModeName: jest.fn(),
      getMapName: jest.fn(),
    },
    matches: {
      getMatch: jest.fn(),
      getTelemetry: jest.fn(),
    },
  })),
}));

// Mock environment variables
process.env.DISCORD_TOKEN = 'mock_discord_token';
process.env.DISCORD_CLIENT_ID = 'mock_client_id';

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

function getLatestMockInstance<T>(mockConstructor: unknown, name: string): T {
  const result = (mockConstructor as jest.Mock).mock.results.at(-1)?.value as T | undefined;
  if (!result) {
    throw new Error(`${name} mock was not constructed`);
  }
  return result;
}

describe('Telemetry Discord Flow Integration', () => {
  let discordBotService: DiscordBotService;
  let mockTelemetryData: any[];
  let cacheReadSpy: jest.SpiedFunction<TelemetryRepository['getTelemetry']>;
  let cacheWriteSpy: jest.SpiedFunction<TelemetryRepository['saveTelemetry']>;
  let matchReadSpy: jest.SpiedFunction<MatchRepository['findMatch']>;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    cacheReadSpy = jest
      .spyOn(TelemetryRepository.prototype, 'getTelemetry')
      .mockResolvedValue({ kind: 'miss' });
    cacheWriteSpy = jest
      .spyOn(TelemetryRepository.prototype, 'saveTelemetry')
      .mockResolvedValue(undefined);
    matchReadSpy = jest.spyOn(MatchRepository.prototype, 'findMatch').mockResolvedValue(null);

    discordBotService = new DiscordBotService('mock_api_key', 'steam');
    (discordBotService as any).coachingNarrator = new CoachingNarratorService(undefined, {
      enabled: false,
      maxLineLength: 240,
    });

    // Setup mock telemetry data
    mockTelemetryData = [
      {
        _D: matchEventAt(0),
        _T: 'LogPlayerKillV2',
        killer: { name: 'TestPlayer1' },
        victim: { name: 'Enemy1' },
        damageCauserName: 'WeapAK47_C',
        distance: 15000,
        damageReason: 'HeadShot',
      } as LogPlayerKillV2,
      // Add death event where TestPlayer1 gets killed
      {
        _D: matchEventAt(120),
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
        _D: matchEventAt(90),
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
        _D: matchEventAt(5),
        _T: 'LogPlayerTakeDamage',
        attacker: { name: 'TestPlayer1' },
        victim: { name: 'Enemy1' },
        damageCauserName: 'WeapAK47_C',
        damage: 50,
      } as LogPlayerTakeDamage,
      {
        _D: matchEventAt(10),
        _T: 'LogPlayerMakeGroggy',
        attacker: { name: 'TestPlayer1' },
        victim: { name: 'Enemy2' },
        damageCauserName: 'WeapM416_C',
        distance: 12000,
      } as LogPlayerMakeGroggy,
    ];
  });

  afterEach(() => {
    cacheReadSpy.mockRestore();
    cacheWriteSpy.mockRestore();
    matchReadSpy.mockRestore();
  });

  it('keeps telemetry events within the canonical match window', () => {
    const matchStart = MATCH_PLAYED_AT.getTime();
    const matchEnd = matchStart + 30 * 60 * 1000;

    expect(
      mockTelemetryData.every((event) => {
        const eventTime = new Date(event._D).getTime();
        return eventTime >= matchStart && eventTime <= matchEnd;
      })
    ).toBe(true);
  });

  it('presents /processmatch through the canonical match interpretation', async () => {
    const response = makeMatchResponse();
    const interpreter = new MatchInterpreter();
    const expected = interpreter.createSummary(interpreter.interpret(makeMatchResponse()), [
      'Player1',
    ]);
    if (!expected) {
      throw new Error('Expected fixture to include Player1');
    }
    const mockPubgClient = getLatestMockInstance<{
      matches: { getMatch: jest.Mock; getTelemetry: jest.Mock };
    }>(PubgClient, 'PubgClient');
    const mockClient = getLatestMockInstance<{
      on: jest.Mock;
      channels: { fetch: jest.Mock };
    }>(Client, 'Client');
    const interactionHandler = mockClient.on.mock.calls.find(
      ([event]: [string]) => event === 'interactionCreate'
    )?.[1];
    if (!interactionHandler) {
      throw new Error('Discord interaction handler was not registered');
    }
    const getAllPlayers = jest
      .spyOn(PlayerRepository.prototype, 'getAllPlayers')
      .mockResolvedValue([
        {
          id: 'player-1',
          pubgId: 'account.1',
          name: 'Player1',
          shardId: 'steam',
          patchVersion: '36.1.1',
          titleId: 'bluehole-pubg',
          lastMatchAt: null,
          createdAt: new Date('2026-07-14T07:00:00.000Z'),
          updatedAt: new Date('2026-07-14T07:00:00.000Z'),
        },
      ]);
    mockPubgClient.matches.getMatch.mockResolvedValue(response);
    mockPubgClient.matches.getTelemetry.mockResolvedValue([]);
    const createSummarySpy = jest.spyOn(MatchInterpreter.prototype, 'createSummary');
    const interaction = {
      commandName: 'processmatch',
      isChatInputCommand: jest.fn().mockReturnValue(true),
      user: { username: 'Tester' },
      options: { getString: jest.fn().mockReturnValue('match-xyz') },
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      followUp: jest.fn().mockResolvedValue(undefined),
      replied: false,
      deferred: true,
    };

    try {
      await interactionHandler(interaction);

      const manualEmbeds = interaction.editReply.mock.calls[0][0].embeds.map(
        (embed: { toJSON(): unknown }) => embed.toJSON()
      );
      const automaticChannel = createMockTextChannel();
      mockClient.channels.fetch.mockResolvedValue(automaticChannel);
      await discordBotService.sendMatchSummary('automatic-channel', expected);
      const automaticEmbeds = automaticChannel.send.mock.calls
        .flatMap((call) => call[0].embeds)
        .map((embed) => embed.toJSON());

      expect(createSummarySpy).toHaveReturnedWith(expected);
      expect(manualEmbeds).toEqual(automaticEmbeds);
      expect(mockPubgClient.matches.getMatch).toHaveBeenCalledTimes(1);
    } finally {
      createSummarySpy.mockRestore();
      getAllPlayers.mockRestore();
    }
  });

  describe('sendMatchSummary with telemetry processing', () => {
    it('should create enhanced embeds when telemetry data is available', async () => {
      const mockSummary = makeMatchSummary({
        matchId: 'test-match-123',
        mapName: 'Erangel',
        gameMode: 'squad',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-123',
        players: [
          {
            name: 'TestPlayer1',
            pubgId: 'account.TestPlayer1',
            stats: makeMatchParticipantStats({
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
            }),
          },
        ],
      });

      // Mock the telemetry fetch to return our test data
      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.matches.getTelemetry.mockResolvedValue(mockTelemetryData);

      // Mock the channel send
      const mockChannel = createMockTextChannel();
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await discordBotService.sendMatchSummary('test-channel-id', mockSummary);

      // Verify telemetry was fetched
      expect(mockPubgClient.matches.getTelemetry).toHaveBeenCalledWith(mockSummary.matchId);

      // Verify channel.send was called (should send multiple embeds)
      expect(mockChannel.send).toHaveBeenCalled();
      const sendCalls = mockChannel.send.mock.calls;
      expect(sendCalls.length).toBeGreaterThan(0);

      // Verify embeds were created (at least main embed + player embeds)
      const firstCall = sendCalls[0][0];
      expect(firstCall.embeds).toBeDefined();
      expect(firstCall.embeds.length).toBe(1);
    });

    it('renders identical enriched coaching output from live and cached telemetry', async () => {
      const mockSummary = makeMatchSummary({
        matchId: 'test-match-123',
        mapName: 'Erangel',
        gameMode: 'squad',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-123',
        players: [
          {
            name: 'IntegrationPlayer',
            pubgId: 'tracked-1',
            stats: makeMatchParticipantStats({
              damageDealt: 0,
              timeSurvived: 1122,
              winPlace: 5,
            }),
          },
        ],
      });
      const rawEvents = [
        {
          _D: matchEventAt(1110),
          _T: 'LogHeal',
          character: { name: 'IntegrationPlayer', accountId: 'tracked-1' },
          item: { itemId: 'Item_Heal_FirstAid_C' },
          healAmount: 40,
        } as LogHeal,
        {
          _D: matchEventAt(1116),
          _T: 'LogPlayerTakeDamage',
          attacker: { name: 'EnemyOne', accountId: 'enemy-1' },
          victim: { name: 'IntegrationPlayer', accountId: 'tracked-1' },
          damage: 83,
          damageCauserName: 'WeapBerylM762_C',
        } as LogPlayerTakeDamage,
        {
          _D: matchEventAt(1122),
          _T: 'LogPlayerKillV2',
          killer: { name: 'EnemyOne', accountId: 'enemy-1' },
          victim: { name: 'IntegrationPlayer', accountId: 'tracked-1' },
          damageCauserName: 'WeapBerylM762_C',
          distance: 4200,
        } as LogPlayerKillV2,
      ];
      const matchAnalysis = await new TelemetryProcessorService().processMatchTelemetry(
        rawEvents,
        mockSummary.matchId,
        mockSummary.playedAt,
        ['IntegrationPlayer']
      );
      const participants = [
        {
          id: 'tracked-participant',
          matchId: mockSummary.matchId,
          rosterId: 'roster-1',
          pubgId: 'tracked-1',
          name: 'IntegrationPlayer',
          ...makeMatchParticipantStats({
            damageDealt: 0,
            timeSurvived: 1122,
            winPlace: 5,
          }),
        },
        {
          id: 'enemy-participant',
          matchId: mockSummary.matchId,
          rosterId: 'roster-2',
          pubgId: 'enemy-1',
          name: 'EnemyOne',
          ...makeMatchParticipantStats({
            kills: 1,
            damageDealt: 83,
            timeSurvived: 1200,
            winPlace: 1,
          }),
        },
      ];
      const matchData = {
        id: 'db-match-1',
        matchId: mockSummary.matchId,
        gameMode: mockSummary.gameMode,
        mapName: mockSummary.mapName,
        duration: 1800,
        isCustomMatch: false,
        seasonState: 'progress',
        shardId: 'steam',
        telemetryUrl: mockSummary.telemetryUrl ?? '',
        playedAt: mockSummary.playedAt,
        createdAt: mockSummary.playedAt,
        participants,
        rosters: [],
      };
      cacheReadSpy
        .mockReset()
        .mockResolvedValueOnce({ kind: 'miss' })
        .mockResolvedValueOnce({ kind: 'hit', rawEvents, matchAnalysis });
      matchReadSpy.mockResolvedValue(matchData);
      const seasonStatsSpy = jest
        .spyOn(PlayerStatsService.prototype, 'getSeasonStats')
        .mockResolvedValue(
          new Map([
            ['tracked-1', { kd: 1.0, adr: 150 }],
            ['enemy-1', { kd: 1.5, adr: 225 }],
          ])
        );
      const mockPubgClient = getLatestMockInstance<{
        matches: { getTelemetry: jest.Mock };
      }>(PubgClient, 'PubgClient');
      mockPubgClient.matches.getTelemetry.mockResolvedValue(rawEvents);
      const liveChannel = createMockTextChannel();
      const cachedChannel = createMockTextChannel();
      const mockClient = getLatestMockInstance<{
        channels: { fetch: jest.Mock };
      }>(Client, 'Client');
      mockClient.channels.fetch
        .mockResolvedValueOnce(liveChannel)
        .mockResolvedValueOnce(cachedChannel);

      try {
        await discordBotService.sendMatchSummary('live-channel-id', mockSummary);
        await discordBotService.sendMatchSummary('cached-channel-id', mockSummary);

        const liveEmbeds = liveChannel.send.mock.calls
          .flatMap((call) => call[0].embeds)
          .map((embed) => embed.toJSON());
        const cachedEmbeds = cachedChannel.send.mock.calls
          .flatMap((call) => call[0].embeds)
          .map((embed) => embed.toJSON());
        const sentTitles = cachedEmbeds.map((embed) => embed.title);
        const mainDescription = cachedEmbeds.find(
          (embed) => embed.title === '🎮 PUBG Match Summary'
        )?.description;

        expect(cachedEmbeds).toEqual(liveEmbeds);
        expect(sentTitles).toContain('Coaching');
        expect(sentTitles).toContain('🎮 PUBG Match Summary');
        expect(sentTitles).toContain('Player: IntegrationPlayer');
        expect(mainDescription).toContain('⚔️ Opponent Difficulty: **Hard** (75/100, 1 opponent)');
        expect(mainDescription).toContain(
          '🏟️ Lobby Difficulty: **Standard** (63/100, 2 players: 2 humans, 0 bots)'
        );
        expect(cacheReadSpy).toHaveBeenCalledTimes(2);
        expect(cacheWriteSpy).toHaveBeenCalledTimes(1);
        expect(matchReadSpy).toHaveBeenCalledTimes(2);
        expect(seasonStatsSpy).toHaveBeenCalledTimes(2);
        expect(mockPubgClient.matches.getTelemetry).toHaveBeenCalledTimes(1);
      } finally {
        seasonStatsSpy.mockRestore();
      }
    });

    it('does not retry cached presentation through live telemetry when enrichment fails', async () => {
      const mockSummary = makeMatchSummary({
        matchId: 'test-match-cache-presentation-failure',
        mapName: 'Erangel',
        gameMode: 'squad',
        teamRank: 5,
        telemetryUrl:
          'https://telemetry-cdn.playbattlegrounds.com/test-match-cache-presentation-failure',
        players: [
          {
            name: 'TestPlayer1',
            pubgId: 'account.TestPlayer1',
            stats: makeMatchParticipantStats({ winPlace: 5 }),
          },
        ],
      });
      const matchAnalysis = await new TelemetryProcessorService().processMatchTelemetry(
        mockTelemetryData,
        mockSummary.matchId,
        mockSummary.playedAt,
        ['TestPlayer1']
      );
      cacheReadSpy
        .mockReset()
        .mockResolvedValue({ kind: 'hit', rawEvents: mockTelemetryData, matchAnalysis });
      matchReadSpy.mockRejectedValue(new Error('participant lookup failed'));
      const mockPubgClient = getLatestMockInstance<{
        matches: { getTelemetry: jest.Mock };
      }>(PubgClient, 'PubgClient');
      mockPubgClient.matches.getTelemetry.mockResolvedValue(mockTelemetryData);
      const mockChannel = createMockTextChannel();
      const mockClient = getLatestMockInstance<{
        channels: { fetch: jest.Mock };
      }>(Client, 'Client');
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await discordBotService.sendMatchSummary('test-channel-id', mockSummary);

      expect(cacheReadSpy).toHaveBeenCalledWith(mockSummary.matchId);
      expect(mockPubgClient.matches.getTelemetry).not.toHaveBeenCalled();
      expect(matchReadSpy).toHaveBeenCalledTimes(1);
      expect(cacheWriteSpy).not.toHaveBeenCalled();
    });

    it('fetches live telemetry once when the cached row is corrupt', async () => {
      const mockSummary = makeMatchSummary({
        matchId: 'test-match-corrupt-cache',
        mapName: 'Erangel',
        gameMode: 'squad',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-corrupt-cache',
        players: [
          {
            name: 'TestPlayer1',
            pubgId: 'account.TestPlayer1',
            stats: makeMatchParticipantStats({ winPlace: 5 }),
          },
        ],
      });
      cacheReadSpy.mockReset().mockResolvedValue({
        kind: 'corrupt',
        reason: 'invalid matchStartTime',
      });
      const mockPubgClient = getLatestMockInstance<{
        matches: { getTelemetry: jest.Mock };
      }>(PubgClient, 'PubgClient');
      mockPubgClient.matches.getTelemetry.mockResolvedValue(mockTelemetryData);
      const mockChannel = createMockTextChannel();
      const mockClient = getLatestMockInstance<{
        channels: { fetch: jest.Mock };
      }>(Client, 'Client');
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await discordBotService.sendMatchSummary('test-channel-id', mockSummary);

      expect(cacheReadSpy).toHaveBeenCalledWith(mockSummary.matchId);
      expect(mockPubgClient.matches.getTelemetry).toHaveBeenCalledTimes(1);
      expect(mockPubgClient.matches.getTelemetry).toHaveBeenCalledWith(mockSummary.matchId);
      expect(mockChannel.send).toHaveBeenCalled();
    });

    it('still sends live telemetry embeds when the cache write fails', async () => {
      const mockSummary = makeMatchSummary({
        matchId: 'test-match-cache-write-failure',
        mapName: 'Erangel',
        gameMode: 'squad',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-cache-write-failure',
        players: [
          {
            name: 'TestPlayer1',
            pubgId: 'account.TestPlayer1',
            stats: makeMatchParticipantStats({ winPlace: 5 }),
          },
        ],
      });
      cacheWriteSpy.mockRejectedValue(new Error('cache unavailable'));
      const mockPubgClient = getLatestMockInstance<{
        matches: { getTelemetry: jest.Mock };
      }>(PubgClient, 'PubgClient');
      mockPubgClient.matches.getTelemetry.mockResolvedValue(mockTelemetryData);
      const mockChannel = createMockTextChannel();
      const mockClient = getLatestMockInstance<{
        channels: { fetch: jest.Mock };
      }>(Client, 'Client');
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await discordBotService.sendMatchSummary('test-channel-id', mockSummary);

      expect(cacheWriteSpy).toHaveBeenCalled();
      expect(mockChannel.send).toHaveBeenCalled();
      const sentTitles = mockChannel.send.mock.calls
        .flatMap((call) => call[0].embeds)
        .map((embed) => embed.toJSON().title);
      expect(sentTitles).toContain('🎮 PUBG Match Summary');
      expect(sentTitles).toContain('Player: TestPlayer1');
    });

    it('should fallback to basic embeds when telemetry processing fails', async () => {
      const mockSummary = makeMatchSummary({
        matchId: 'test-match-456',
        mapName: 'Sanhok',
        gameMode: 'duo',
        teamRank: 3,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-456',
        players: [
          {
            name: 'TestPlayer2',
            pubgId: 'account.TestPlayer2',
            stats: makeMatchParticipantStats({
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
            }),
          },
        ],
      });

      // Mock telemetry fetch to throw an error
      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.matches.getTelemetry.mockRejectedValue(new Error('Telemetry fetch failed'));

      // Mock the channel send
      const mockChannel = createMockTextChannel();
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      // Should not throw an error, should fallback gracefully
      await expect(
        discordBotService.sendMatchSummary('test-channel-id', mockSummary)
      ).resolves.toBeUndefined();

      // Verify telemetry fetch was attempted
      expect(mockPubgClient.matches.getTelemetry).toHaveBeenCalledWith(mockSummary.matchId);

      // Verify basic embeds were still sent
      expect(mockChannel.send).toHaveBeenCalled();
    });

    it('should use basic embeds when no telemetry URL is provided', async () => {
      const mockSummary = makeMatchSummary({
        matchId: 'test-match-789',
        mapName: 'Miramar',
        gameMode: 'solo',
        teamRank: 1,
        telemetryUrl: undefined, // No telemetry URL
        players: [
          {
            name: 'TestPlayer3',
            pubgId: 'account.TestPlayer3',
            stats: makeMatchParticipantStats({
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
            }),
          },
        ],
      });

      // Mock the channel send
      const mockChannel = createMockTextChannel();
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      const mockPubgClient = (discordBotService as any).pubgClient;

      await discordBotService.sendMatchSummary('test-channel-id', mockSummary);

      // Verify telemetry was NOT fetched since no URL
      expect(mockPubgClient.matches.getTelemetry).not.toHaveBeenCalled();

      // Verify basic embeds were sent
      expect(mockChannel.send).toHaveBeenCalled();
    });

    it('should process multiple players with telemetry data', async () => {
      const extendedTelemetryData = [
        ...mockTelemetryData,
        // Add events for Player2
        {
          _D: matchEventAt(60),
          _T: 'LogPlayerKillV2',
          killer: { name: 'Player2' },
          victim: { name: 'Enemy3' },
          damageCauserName: 'WeapSCAR_C',
          distance: 18000,
          damageReason: 'NonSpecific',
        } as LogPlayerKillV2,
        {
          _D: matchEventAt(55),
          _T: 'LogPlayerTakeDamage',
          attacker: { name: 'Player2' },
          victim: { name: 'Enemy3' },
          damageCauserName: 'WeapSCAR_C',
          damage: 80,
        } as LogPlayerTakeDamage,
      ];

      const mockSummary = makeMatchSummary({
        matchId: 'test-match-multi',
        mapName: 'Vikendi',
        gameMode: 'squad',
        teamRank: 2,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-multi',
        players: [
          {
            name: 'TestPlayer1',
            pubgId: 'account.TestPlayer1',
            stats: makeMatchParticipantStats({
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
            }),
          },
          {
            name: 'Player2',
            pubgId: 'account.Player2',
            stats: makeMatchParticipantStats({
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
            }),
          },
        ],
      });

      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.matches.getTelemetry.mockResolvedValue(extendedTelemetryData);

      const mockChannel = createMockTextChannel();
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await discordBotService.sendMatchSummary('test-channel-id', mockSummary);

      // Verify telemetry processing was called
      expect(mockPubgClient.matches.getTelemetry).toHaveBeenCalledWith(mockSummary.matchId);

      // Verify multiple embeds were sent (main + 2 players)
      expect(mockChannel.send).toHaveBeenCalledTimes(3); // Main embed + 2 player embeds
    });

    it('should handle telemetry processor service errors gracefully', async () => {
      const mockSummary = makeMatchSummary({
        matchId: 'test-match-error',
        mapName: 'Erangel',
        gameMode: 'squad',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-error',
        players: [
          {
            name: 'TestPlayer1',
            pubgId: 'account.TestPlayer1',
            stats: makeMatchParticipantStats({
              kills: 1,
              DBNOs: 1,
              damageDealt: 150,
              longestKill: 100,
              timeSurvived: 900,
              walkDistance: 1200,
              killPlace: 20,
              winPlace: 5,
            }),
          },
        ],
      });

      // Mock telemetry to return invalid data that causes processor to fail
      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.matches.getTelemetry.mockResolvedValue([
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
      const mockSummary = makeMatchSummary({
        matchId: 'test-match-coaching',
        mapName: 'Erangel',
        gameMode: 'squad',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-coaching',
        players: [
          {
            name: 'TestPlayer1',
            pubgId: 'account.TestPlayer1',
            stats: makeMatchParticipantStats({
              kills: 0,
              DBNOs: 0,
              damageDealt: 0,
              longestKill: 0,
              timeSurvived: 1122,
              winPlace: 5,
            }),
          },
        ],
      });

      const coachingTelemetry = [
        {
          _D: matchEventAt(1116),
          _T: 'LogPlayerTakeDamage',
          attacker: { name: 'EnemyOne' },
          victim: { name: 'TestPlayer1' },
          damage: 83,
          damageCauserName: 'WeapBerylM762_C',
        } as LogPlayerTakeDamage,
        {
          _D: matchEventAt(1122),
          _T: 'LogPlayerKillV2',
          killer: { name: 'EnemyOne' },
          victim: { name: 'TestPlayer1' },
          damageCauserName: 'WeapBerylM762_C',
          distance: 4200,
        } as LogPlayerKillV2,
      ];

      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.matches.getTelemetry.mockResolvedValue(coachingTelemetry);

      const mockChannel = createMockTextChannel();
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await discordBotService.sendMatchSummary('test-channel-id', mockSummary);

      const serializedEmbeds = mockChannel.send.mock.calls
        .flatMap((call) => call[0].embeds)
        .map((embed) => embed.toJSON());
      const sentTitles = serializedEmbeds.map((embed) => embed.title);

      expect(sentTitles).toContain('🎮 PUBG Match Summary');
      expect(sentTitles).toContain('Player: TestPlayer1');
      expect(sentTitles).toContain('Coaching');
      expect(JSON.stringify(serializedEmbeds)).toContain('TestPlayer1 - Decisive mistake');
      expect(JSON.stringify(serializedEmbeds)).toContain('Decisive mistake');
      expect(JSON.stringify(serializedEmbeds)).toContain('EnemyOne');
      expect(JSON.stringify(serializedEmbeds)).toContain('83 damage');
    });

    it('adds pattern to fix only when repeated coaching evidence exists', async () => {
      const mockSummary = makeMatchSummary({
        matchId: 'test-match-coaching-pattern',
        mapName: 'Erangel',
        gameMode: 'squad',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-coaching-pattern',
        players: [
          {
            name: 'TestPlayer1',
            pubgId: 'account.TestPlayer1',
            stats: makeMatchParticipantStats({ winPlace: 5 }),
          },
        ],
      });

      const telemetry = [
        {
          _D: matchEventAt(600),
          _T: 'LogPlayerTakeDamage',
          attacker: { name: 'EnemyOne' },
          victim: { name: 'TestPlayer1' },
          damage: 83,
        },
        {
          _D: matchEventAt(606),
          _T: 'LogPlayerMakeGroggy',
          attacker: { name: 'EnemyOne' },
          victim: { name: 'TestPlayer1' },
        },
        {
          _D: matchEventAt(1116),
          _T: 'LogPlayerTakeDamage',
          attacker: { name: 'EnemyTwo' },
          victim: { name: 'TestPlayer1' },
          damage: 90,
        },
        {
          _D: matchEventAt(1122),
          _T: 'LogPlayerKillV2',
          killer: { name: 'EnemyTwo' },
          victim: { name: 'TestPlayer1' },
        },
      ];

      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.matches.getTelemetry.mockResolvedValue(telemetry);

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
      const mockSummary = makeMatchSummary({
        matchId: 'test-match-coaching-fallback',
        mapName: 'Erangel',
        gameMode: 'squad',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-coaching-fallback',
        players: [
          {
            name: 'TestPlayer1',
            pubgId: 'account.TestPlayer1',
            stats: makeMatchParticipantStats({
              kills: 0,
              DBNOs: 0,
              damageDealt: 0,
              timeSurvived: 1122,
              winPlace: 5,
            }),
          },
        ],
      });

      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.matches.getTelemetry.mockResolvedValue([
        {
          _D: matchEventAt(1116),
          _T: 'LogPlayerTakeDamage',
          attacker: { name: 'EnemyOne' },
          victim: { name: 'TestPlayer1' },
          damage: 83,
        } as LogPlayerTakeDamage,
        {
          _D: matchEventAt(1122),
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
      const mockSummary = makeMatchSummary({
        matchId: 'test-match-difficulty',
        mapName: 'Erangel',
        gameMode: 'squad',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-match-difficulty',
        players: [
          {
            name: 'TestPlayer1',
            pubgId: 'tracked-1',
            stats: makeMatchParticipantStats({
              kills: 0,
              DBNOs: 0,
              damageDealt: 0,
              timeSurvived: 1122,
              winPlace: 5,
            }),
          },
        ],
      });

      const telemetry = [
        {
          _D: matchEventAt(120),
          _T: 'LogPlayerKillV2',
          killer: { name: 'EnemyOne', accountId: 'enemy-1' },
          victim: { name: 'TestPlayer1', accountId: 'tracked-1' },
          damageCauserName: 'WeapBerylM762_C',
        } as LogPlayerKillV2,
      ];

      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.matches.getTelemetry.mockResolvedValue(telemetry);

      // Force the live telemetry path and avoid DB-backed lookups
      (discordBotService as any).telemetryRepository = {
        getTelemetry: jest.fn().mockResolvedValue({ kind: 'miss' }),
        saveTelemetry: jest.fn().mockResolvedValue(undefined),
      };
      (discordBotService as any).matchRepository = {
        findMatch: jest.fn().mockResolvedValue(null),
      };
      (discordBotService as any).playerStatsService = {
        getSeasonStats: jest.fn().mockResolvedValue(new Map([['enemy-1', { kd: 1.5, adr: 225 }]])),
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
      const mockSummary = makeMatchSummary({
        matchId: 'test-bot-opponent',
        mapName: 'Erangel',
        gameMode: 'squad',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-bot-opponent',
        players: [
          {
            name: 'TestPlayer1',
            pubgId: 'tracked-1',
            stats: makeMatchParticipantStats({
              kills: 1,
              DBNOs: 0,
              damageDealt: 100,
              timeSurvived: 1122,
              winPlace: 5,
            }),
          },
        ],
      });

      const telemetry = [
        {
          _D: matchEventAt(60),
          _T: 'LogPlayerKillV2',
          killer: { name: 'TestPlayer1', accountId: 'tracked-1' },
          victim: { name: 'BotEnemy', accountId: 'ai.1' },
          damageCauserName: 'WeapBerylM762_C',
        } as LogPlayerKillV2,
        {
          _D: matchEventAt(120),
          _T: 'LogPlayerKillV2',
          killer: { name: 'EnemyOne', accountId: 'enemy-1' },
          victim: { name: 'TestPlayer1', accountId: 'tracked-1' },
          damageCauserName: 'WeapBerylM762_C',
        } as LogPlayerKillV2,
      ];

      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.matches.getTelemetry.mockResolvedValue(telemetry);

      (discordBotService as any).telemetryRepository = {
        getTelemetry: jest.fn().mockResolvedValue({ kind: 'miss' }),
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
      const mockSummary = makeMatchSummary({
        matchId: 'test-lobby-difficulty',
        mapName: 'Erangel',
        gameMode: 'squad',
        teamRank: 5,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/test-lobby-difficulty',
        players: [
          {
            name: 'TestPlayer1',
            pubgId: 'tracked-1',
            stats: makeMatchParticipantStats({
              kills: 0,
              DBNOs: 0,
              damageDealt: 0,
              timeSurvived: 1122,
              winPlace: 5,
            }),
          },
        ],
      });

      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.matches.getTelemetry.mockResolvedValue([]);

      (discordBotService as any).telemetryRepository = {
        getTelemetry: jest.fn().mockResolvedValue({ kind: 'miss' }),
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
      const mockSummary = makeMatchSummary({
        matchId: 'integration-test-match',
        mapName: 'Erangel',
        gameMode: 'duo',
        teamRank: 4,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/integration-test-match',
        players: [
          {
            name: 'IntegrationPlayer',
            pubgId: 'account.IntegrationPlayer',
            stats: makeMatchParticipantStats(),
          },
        ],
      });

      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.matches.getTelemetry.mockResolvedValue(mockTelemetryData);

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
      const mockSummary = makeMatchSummary({
        matchId: 'timeline-test-match',
        mapName: 'Erangel',
        gameMode: 'duo',
        teamRank: 4,
        telemetryUrl: 'https://telemetry-cdn.playbattlegrounds.com/timeline-test-match',
        players: [
          {
            name: 'TestPlayer1',
            pubgId: 'account.TestPlayer1',
            stats: makeMatchParticipantStats(),
          },
        ],
      });

      const mockPubgClient = (discordBotService as any).pubgClient;
      mockPubgClient.matches.getTelemetry.mockResolvedValue(mockTelemetryData);

      const mockChannel = createMockTextChannel();
      const mockClient = (discordBotService as any).client;
      mockClient.channels.fetch.mockResolvedValue(mockChannel);

      await discordBotService.sendMatchSummary('test-channel-id', mockSummary);

      // Verify channel.send was called
      expect(mockChannel.send).toHaveBeenCalled();
    });
  });
});
