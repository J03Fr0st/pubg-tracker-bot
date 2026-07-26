import { PubgClient } from '@j03fr0st/pubg-ts';
import { Client, EmbedBuilder, Events, PermissionFlagsBits, REST } from 'discord.js';
import { MatchRepository } from '../../src/data/repositories/match.repository';
import { PlayerRepository } from '../../src/data/repositories/player.repository';
import { ProcessedMatchRepository } from '../../src/data/repositories/processed-match.repository';
import { SeasonCacheRepository } from '../../src/data/repositories/season-cache.repository';
import { TelemetryRepository } from '../../src/data/repositories/telemetry.repository';
import { CoachingDetectorRegistryService } from '../../src/services/coaching-detector-registry.service';
import {
  CoachingCandidateRankerService,
  CoachingNarrativeBuilderService,
} from '../../src/services/coaching-insight-ranking.service';
import { CoachingNarratorService } from '../../src/services/coaching-narrator.service';
import { CoachingPipelineService } from '../../src/services/coaching-pipeline.service';
import {
  DamageConversionDetector,
  FailedResetDetector,
  MovementExposureDetector,
  RecoveryDecisionDetector,
  TeamSpacingDetector,
} from '../../src/services/core-coaching-detectors.service';
import { DiscordBotService } from '../../src/services/discord-bot.service';
import { EncounterSegmenterService } from '../../src/services/encounter-segmenter.service';
import {
  ArmorDisadvantageDetector,
  CarryContextDetector,
  LifecycleAccuracyDetector,
  RedeployContextDetector,
  UtilityUsageDetector,
  VehicleDecisionDetector,
  ZoneRotationDetector,
} from '../../src/services/match-context-coaching-detectors.service';
import { MatchInterpreter } from '../../src/services/match-interpreter.service';
import {
  type MatchPresentationDependencies,
  MatchPresentationService,
} from '../../src/services/match-presentation.service';
import { PlayerStateProjectorService } from '../../src/services/player-state-projector.service';
import { PlayerStatsService } from '../../src/services/player-stats.service';
import { TelemetryContextEnricherService } from '../../src/services/telemetry-context-enricher.service';
import { TelemetryProcessorService } from '../../src/services/telemetry-processor.service';
import { TelemetryTimelineBuilderService } from '../../src/services/telemetry-timeline-builder.service';
import { TimelineCoachingAnalyzerService } from '../../src/services/timeline-coaching-analyzer.service';
import { TimelineCoachingShadowService } from '../../src/services/timeline-coaching-shadow.service';
import { makeMatchResponse } from '../fixtures/match-response.fixture';
import { makeMatchParticipantStats, makeMatchSummary } from '../fixtures/match-summary.fixture';

jest.mock('@j03fr0st/pubg-ts', () => {
  const actual = jest.requireActual('@j03fr0st/pubg-ts');
  return {
    ...actual,
    PubgClient: jest.fn().mockImplementation((options) => {
      const client = new actual.PubgClient(options);
      client.matches.getMatch = jest.fn();
      return client;
    }),
  };
});

jest.mock('discord.js', () => {
  const actual = jest.requireActual('discord.js');
  return {
    ...actual,
    Client: jest.fn().mockImplementation(() => ({
      user: { id: 'bot-123', tag: 'Tracker#0001' },
      on: jest.fn(),
      login: jest.fn().mockResolvedValue('logged-in'),
      channels: { fetch: jest.fn() },
    })),
  };
});

const prisma = {} as never;

function createPresentation(): MatchPresentationService {
  const pubgClient = new PubgClient({ apiKey: 'test-api-key', shard: 'steam' });
  const dependencies: MatchPresentationDependencies = {
    pubgClient,
    telemetryRepository: new TelemetryRepository(prisma),
    telemetryProcessor: new TelemetryProcessorService(),
    playerStatsService: new PlayerStatsService(
      pubgClient,
      'steam',
      new SeasonCacheRepository(prisma)
    ),
    coachingPipeline: new CoachingPipelineService({
      analyze: () => [],
      narrate: async () => ({ sections: [] }),
    }),
  };
  return new MatchPresentationService(dependencies);
}

function createTimelinePresentation(): MatchPresentationService {
  const pubgClient = new PubgClient({ apiKey: 'test-api-key', shard: 'steam' });
  const timeline = new TimelineCoachingShadowService(
    new TelemetryTimelineBuilderService(),
    new PlayerStateProjectorService(),
    new EncounterSegmenterService()
  );
  const analyzer = new TimelineCoachingAnalyzerService(
    timeline,
    new TelemetryContextEnricherService(),
    new CoachingDetectorRegistryService([
      new LifecycleAccuracyDetector(),
      new FailedResetDetector(),
      new TeamSpacingDetector(),
      new DamageConversionDetector(),
      new MovementExposureDetector(),
      new RecoveryDecisionDetector(),
      new ZoneRotationDetector(),
      new ArmorDisadvantageDetector(),
      new UtilityUsageDetector(),
      new VehicleDecisionDetector(),
      new CarryContextDetector(),
      new RedeployContextDetector(),
    ]),
    new CoachingCandidateRankerService(),
    new CoachingNarrativeBuilderService()
  );
  const narrator = new CoachingNarratorService(undefined, {
    enabled: false,
    maxLineLength: 240,
  });
  return new MatchPresentationService({
    pubgClient,
    telemetryRepository: new TelemetryRepository(prisma),
    telemetryProcessor: new TelemetryProcessorService(),
    playerStatsService: new PlayerStatsService(
      pubgClient,
      'steam',
      new SeasonCacheRepository(prisma)
    ),
    coachingPipeline: new CoachingPipelineService({
      analyze: (analysis, players, events) => analyzer.analyze(analysis, players, events),
      narrate: (insights) => narrator.narrate(insights),
    }),
  });
}

function createBot(presentation: MatchPresentationService): DiscordBotService {
  const pubgClient = new PubgClient({ apiKey: 'test-api-key', shard: 'steam' });
  return new DiscordBotService({
    client: new Client({ intents: [] }),
    rest: new REST(),
    token: 'test-token',
    clientId: 'test-client-id',
    pubgClient,
    playerRepository: new PlayerRepository(prisma),
    processedMatchRepository: new ProcessedMatchRepository(prisma),
    matchInterpreter: new MatchInterpreter(),
    matchPresentation: presentation,
  });
}

function latestDiscordClient() {
  const client = jest.mocked(Client).mock.results.at(-1)?.value;
  if (!client) {
    throw new Error('Expected Discord client to be constructed');
  }
  return client;
}

function createTextChannel() {
  return {
    id: 'channel-123',
    name: 'pubg',
    type: 0,
    guild: { id: 'guild-123', name: 'PUBG Guild' },
    isTextBased: jest.fn().mockReturnValue(true),
    permissionsFor: jest.fn().mockReturnValue({
      has: jest.fn().mockReturnValue(true),
    }),
    send: jest.fn().mockResolvedValue({ id: 'message-123' }),
  };
}

function createSummary() {
  return makeMatchSummary({
    matchId: 'channel-match',
    mapName: 'Baltic_Main',
    gameMode: 'squad',
    players: [
      {
        name: 'ChannelPlayer',
        pubgId: 'account.channel',
        stats: makeMatchParticipantStats(),
      },
    ],
  });
}

function createRichEmbed(index: number, descriptionLength = 500): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`Embed ${index}`)
    .setDescription('D'.repeat(descriptionLength))
    .setAuthor({ name: `Author ${index}` })
    .setFooter({ text: `Footer ${index}` })
    .addFields({ name: `Field ${index}`, value: 'V'.repeat(100) });
}

function latestPubgClient() {
  const client = jest.mocked(PubgClient).mock.results.at(-1)?.value;
  if (!client) {
    throw new Error('Expected PUBG client to be constructed');
  }
  return client;
}

function interactionHandler() {
  const registration = latestDiscordClient().on.mock.calls.find(
    (
      call: [
        string,
        (interaction: ReturnType<typeof createProcessMatchInteraction>) => Promise<void>,
      ]
    ) => call[0] === Events.InteractionCreate
  );
  if (!registration) {
    throw new Error('Expected interaction handler to be registered');
  }
  return registration[1];
}

function createProcessMatchInteraction() {
  return {
    isChatInputCommand: jest.fn().mockReturnValue(true),
    commandName: 'processmatch',
    deferReply: jest.fn().mockResolvedValue(undefined),
    user: { username: 'Tester' },
    options: { getString: jest.fn().mockReturnValue('match-xyz') },
    editReply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
  };
}

function createExpectedManualSummary() {
  const interpreter = new MatchInterpreter();
  const summary = interpreter.createSummary(interpreter.interpret(makeMatchResponse()), [
    'Player1',
  ]);
  if (!summary) {
    throw new Error('Expected monitored player summary');
  }
  return summary;
}

describe('Discord match presentation gateway', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('constructs explicit services without loading config, repositories, or Prisma', () => {
    const requiredKeys = [
      'DISCORD_TOKEN',
      'DISCORD_CLIENT_ID',
      'DISCORD_CHANNEL_ID',
      'PUBG_API_KEY',
      'DATABASE_URL',
    ] as const;
    const previousValues = requiredKeys.map((key) => process.env[key]);
    for (const key of requiredKeys) delete process.env[key];
    const forbiddenModules = [
      '../../src/config/config',
      '../../src/data/prisma.client',
      '../../src/data/repositories/player.repository',
      '../../src/data/repositories/processed-match.repository',
      '../../src/data/repositories/match.repository',
      '../../src/data/repositories/season-cache.repository',
    ];
    for (const modulePath of forbiddenModules) {
      jest.doMock(modulePath, () => {
        throw new Error(`Module must not load for explicit dependencies: ${modulePath}`);
      });
    }

    try {
      jest.isolateModules(() => {
        const { DiscordBotService: IsolatedDiscordBotService } = jest.requireActual(
          '../../src/services/discord-bot.service'
        ) as typeof import('../../src/services/discord-bot.service');
        const { MatchMonitorService: IsolatedMatchMonitorService } = jest.requireActual(
          '../../src/services/match-monitor.service'
        ) as typeof import('../../src/services/match-monitor.service');
        const { PlayerStatsService: IsolatedPlayerStatsService } = jest.requireActual(
          '../../src/services/player-stats.service'
        ) as typeof import('../../src/services/player-stats.service');
        const pubgClient = new PubgClient({ apiKey: 'test-api-key', shard: 'steam' });
        const playerRepository = new PlayerRepository(prisma);
        const processedMatchRepository = new ProcessedMatchRepository(prisma);
        const matchRepository = new MatchRepository(prisma);
        const matchInterpreter = new MatchInterpreter();
        const discordBot = new IsolatedDiscordBotService({
          client: new Client({ intents: [] }),
          rest: new REST(),
          token: 'test-token',
          clientId: 'test-client-id',
          pubgClient,
          playerRepository,
          processedMatchRepository,
          matchInterpreter,
          matchPresentation: createPresentation(),
        });

        expect(
          () =>
            new IsolatedMatchMonitorService({
              discordBot,
              pubgClient,
              playerRepository,
              processedMatchRepository,
              matchRepository,
              matchInterpreter,
              options: {
                checkIntervalMs: 60_000,
                channelId: 'channel-123',
                maxMatchesToProcess: 2,
              },
            })
        ).not.toThrow();
        expect(
          () =>
            new IsolatedPlayerStatsService(pubgClient, 'steam', new SeasonCacheRepository(prisma))
        ).not.toThrow();
      });
    } finally {
      for (const modulePath of forbiddenModules) jest.dontMock(modulePath);
      requiredKeys.forEach((key, index) => {
        const value = previousValues[index];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      });
    }
  });

  it('initializes with the explicitly supplied REST and Discord credentials', async () => {
    const client = new Client({ intents: [] });
    const rest = {
      put: jest.fn().mockResolvedValue(undefined),
    } as unknown as REST;
    const pubgClient = new PubgClient({ apiKey: 'test-api-key', shard: 'steam' });
    const bot = new DiscordBotService({
      client,
      rest,
      token: 'explicit-token',
      clientId: 'explicit-client-id',
      pubgClient,
      playerRepository: new PlayerRepository(prisma),
      processedMatchRepository: new ProcessedMatchRepository(prisma),
      matchInterpreter: new MatchInterpreter(),
      matchPresentation: createPresentation(),
    });

    await bot.initialize();

    expect(rest.put).toHaveBeenCalledWith(expect.stringContaining('explicit-client-id'), {
      body: expect.any(Array),
    });
    expect(client.login).toHaveBeenCalledWith('explicit-token');
  });

  it('delegates presentation and sends 12 small embeds in exact 10/2 batches', async () => {
    const presentation = createPresentation();
    const embeds = Array.from({ length: 12 }, (_, index) =>
      new EmbedBuilder().setTitle(`Embed ${index + 1}`)
    );
    const createEmbeds = jest.spyOn(presentation, 'createEmbeds').mockResolvedValue(embeds);
    const bot = createBot(presentation);
    const channel = createTextChannel();
    jest.mocked(latestDiscordClient().channels.fetch).mockResolvedValue(channel);
    const summary = makeMatchSummary({
      matchId: 'batch-match',
      mapName: 'Baltic_Main',
      gameMode: 'squad',
      players: [
        {
          name: 'BatchPlayer',
          pubgId: 'account.batch',
          stats: makeMatchParticipantStats(),
        },
      ],
    });

    await bot.sendMatchSummary('channel-123', summary);

    expect(createEmbeds).toHaveBeenCalledWith(summary);
    expect(channel.send).toHaveBeenCalledTimes(2);
    expect(channel.send.mock.calls[0][0]).toEqual({ embeds: embeds.slice(0, 10) });
    expect(channel.send.mock.calls[1][0]).toEqual({ embeds: embeds.slice(10) });
  });

  it('accepts an exact 6000-character aggregate in one automatic message', async () => {
    const presentation = createPresentation();
    const embeds = [
      new EmbedBuilder().setDescription('A'.repeat(3000)),
      new EmbedBuilder().setDescription('B'.repeat(3000)),
    ];
    jest.spyOn(presentation, 'createEmbeds').mockResolvedValue(embeds);
    const bot = createBot(presentation);
    const channel = createTextChannel();
    jest.mocked(latestDiscordClient().channels.fetch).mockResolvedValue(channel);

    await bot.sendMatchSummary('channel-123', createSummary());

    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(channel.send).toHaveBeenCalledWith({ embeds });
  });

  it('splits automatic output when rich components push descriptions past 6000 characters', async () => {
    const presentation = createPresentation();
    const embeds = Array.from({ length: 6 }, (_, index) => createRichEmbed(index + 1, 1000));
    jest.spyOn(presentation, 'createEmbeds').mockResolvedValue(embeds);
    const bot = createBot(presentation);
    const channel = createTextChannel();
    jest.mocked(latestDiscordClient().channels.fetch).mockResolvedValue(channel);

    await bot.sendMatchSummary('channel-123', createSummary());

    expect(channel.send).toHaveBeenCalledTimes(2);
    expect(channel.send.mock.calls[0][0]).toEqual({ embeds: embeds.slice(0, 5) });
    expect(channel.send.mock.calls[1][0]).toEqual({ embeds: embeds.slice(5) });
  });

  it('rejects one over-6000-character embed before automatic delivery', async () => {
    const presentation = createPresentation();
    const oversized = new EmbedBuilder()
      .setDescription('D'.repeat(4096))
      .setFooter({ text: 'F'.repeat(1905) });
    jest.spyOn(presentation, 'createEmbeds').mockResolvedValue([oversized]);
    const bot = createBot(presentation);
    const channel = createTextChannel();
    jest.mocked(latestDiscordClient().channels.fetch).mockResolvedValue(channel);

    await expect(bot.sendMatchSummary('channel-123', createSummary())).rejects.toThrow(
      "Embed text length 6001 exceeds Discord's 6000-character message limit"
    );
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('sends real basic presentation output through the gateway', async () => {
    const bot = createBot(createPresentation());
    const channel = createTextChannel();
    jest.mocked(latestDiscordClient().channels.fetch).mockResolvedValue(channel);
    const summary = makeMatchSummary({
      matchId: 'smoke-match',
      mapName: 'Baltic_Main',
      gameMode: 'squad',
      players: [
        {
          name: 'SmokePlayer',
          pubgId: 'account.smoke',
          stats: makeMatchParticipantStats({ kills: 1 }),
        },
      ],
    });

    await bot.sendMatchSummary('channel-123', summary);

    const sentEmbeds = channel.send.mock.calls[0][0].embeds;
    expect(sentEmbeds.map((embed: EmbedBuilder) => embed.data.title)).toEqual([
      '🎮 PUBG Match Summary',
      'Player: SmokePlayer',
    ]);
  });

  it('delivers visible timeline coaching through Discord without false DBNO reset wording', async () => {
    const presentation = createTimelinePresentation();
    const presentationClient = latestPubgClient();
    const playedAt = new Date('2026-07-25T10:00:00.000Z');
    const tracked = {
      name: 'TimelinePlayer',
      accountId: 'account.timeline',
      location: { x: 0, y: 0, z: 0 },
    };
    const enemy = {
      name: 'Enemy',
      accountId: 'account.enemy',
      location: { x: 1000, y: 0, z: 0 },
    };
    const rawEvents = [
      {
        _T: 'LogPlayerTakeDamage',
        _D: '2026-07-25T10:00:02.000Z',
        common: { isGame: 1 },
        attacker: enemy,
        victim: tracked,
        damage: 100,
      },
      {
        _T: 'LogPlayerMakeGroggy',
        _D: '2026-07-25T10:00:02.000Z',
        common: { isGame: 1 },
        attacker: enemy,
        victim: tracked,
      },
      {
        _T: 'LogPlayerKillV2',
        _D: '2026-07-25T10:00:10.000Z',
        common: { isGame: 1 },
        killer: enemy,
        victim: tracked,
      },
    ] as never;
    jest.spyOn(TelemetryRepository.prototype, 'getTelemetry').mockResolvedValue({ kind: 'miss' });
    jest.spyOn(TelemetryRepository.prototype, 'saveTelemetry').mockResolvedValue(undefined);
    jest.spyOn(presentationClient.matches, 'getTelemetry').mockResolvedValue(rawEvents);
    jest.spyOn(PlayerStatsService.prototype, 'getSeasonStats').mockResolvedValue(new Map());
    const bot = createBot(presentation);
    const channel = createTextChannel();
    jest.mocked(latestDiscordClient().channels.fetch).mockResolvedValue(channel);
    const summary = makeMatchSummary({
      matchId: 'timeline-match',
      mapName: 'Baltic_Main',
      gameMode: 'squad',
      playedAt,
      telemetryUrl: 'https://telemetry.example/timeline-match',
      players: [
        {
          name: tracked.name,
          pubgId: tracked.accountId,
          stats: makeMatchParticipantStats(),
        },
      ],
      lobbyPlayers: [],
    });

    await bot.sendMatchSummary('channel-123', summary);

    const sentEmbeds = channel.send.mock.calls[0][0].embeds as EmbedBuilder[];
    const coaching = sentEmbeds.find((embed) => embed.data.title === 'Coaching');
    expect(coaching?.data.description).toContain('You took 100 damage while dealing 0');
    expect(coaching?.data.description).not.toContain('before creating a reset');
  });

  it('still delivers match embeds through Discord when coaching fails', async () => {
    const presentation = createPresentation();
    const presentationClient = latestPubgClient();
    jest
      .spyOn(CoachingPipelineService.prototype, 'run')
      .mockRejectedValue(new Error('coaching unavailable'));
    jest.spyOn(TelemetryRepository.prototype, 'getTelemetry').mockResolvedValue({ kind: 'miss' });
    jest.spyOn(TelemetryRepository.prototype, 'saveTelemetry').mockResolvedValue(undefined);
    jest.spyOn(presentationClient.matches, 'getTelemetry').mockResolvedValue([]);
    jest.spyOn(PlayerStatsService.prototype, 'getSeasonStats').mockResolvedValue(new Map());
    const bot = createBot(presentation);
    const channel = createTextChannel();
    jest.mocked(latestDiscordClient().channels.fetch).mockResolvedValue(channel);
    const summary = makeMatchSummary({
      matchId: 'coaching-failure-match',
      mapName: 'Baltic_Main',
      gameMode: 'squad',
      telemetryUrl: 'https://telemetry.example/coaching-failure-match',
      players: [
        {
          name: 'ResilientPlayer',
          pubgId: 'account.resilient',
          stats: makeMatchParticipantStats({ kills: 1 }),
        },
      ],
      lobbyPlayers: [],
    });

    await bot.sendMatchSummary('channel-123', summary);

    const sentEmbeds = channel.send.mock.calls[0][0].embeds as EmbedBuilder[];
    expect(sentEmbeds.map((embed) => embed.data.title)).toEqual([
      '🎮 PUBG Match Summary',
      'Player: ResilientPlayer',
    ]);
  });

  it('delegates manual processmatch presentation and batches rich output within both limits', async () => {
    const presentation = createPresentation();
    const embeds = Array.from({ length: 12 }, (_, index) => createRichEmbed(index + 1, 1000));
    const createEmbeds = jest.spyOn(presentation, 'createEmbeds').mockResolvedValue(embeds);
    createBot(presentation);
    jest.mocked(latestPubgClient().matches.getMatch).mockResolvedValue(makeMatchResponse());
    jest.spyOn(PlayerRepository.prototype, 'getAllPlayers').mockResolvedValue([
      {
        id: 'player-1',
        pubgId: 'account.1',
        name: 'Player1',
        shardId: 'steam',
        patchVersion: '36.1.1',
        titleId: 'bluehole-pubg',
        lastMatchAt: null,
        createdAt: new Date('2026-07-14T08:00:00.000Z'),
        updatedAt: new Date('2026-07-14T08:00:00.000Z'),
      },
    ]);
    const interaction = createProcessMatchInteraction();

    await interactionHandler()(interaction);

    expect(createEmbeds).toHaveBeenCalledWith(createExpectedManualSummary());
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    expect(interaction.followUp).toHaveBeenCalledTimes(2);
    const calls = [...interaction.editReply.mock.calls, ...interaction.followUp.mock.calls];
    expect(calls.flatMap(([payload]) => payload.embeds)).toEqual(embeds);
    expect(calls).toHaveLength(3);
  });

  it('explains Missing Access returned while sending a batch', async () => {
    const bot = createBot(createPresentation());
    const channel = createTextChannel();
    channel.send.mockRejectedValue({ code: 50001, message: 'Missing Access' });
    jest.mocked(latestDiscordClient().channels.fetch).mockResolvedValue(channel);

    await expect(bot.sendMatchSummary('channel-123', createSummary())).rejects.toThrow(
      'Discord bot cannot access channel channel-123. Discord error 50001 Missing Access.'
    );
  });

  it('explains when Discord cannot fetch the configured channel', async () => {
    const bot = createBot(createPresentation());
    jest
      .mocked(latestDiscordClient().channels.fetch)
      .mockRejectedValue({ code: 50001, message: 'Missing Access' });

    await expect(bot.sendMatchSummary('missing-channel', createSummary())).rejects.toThrow(
      'Discord bot cannot access channel missing-channel. Discord error 50001 Missing Access.'
    );
  });

  it('rejects before sending when the bot cannot view the channel', async () => {
    const bot = createBot(createPresentation());
    const channel = createTextChannel();
    channel.permissionsFor.mockReturnValue({
      has: jest.fn((permission: bigint) => permission !== PermissionFlagsBits.ViewChannel),
    });
    jest.mocked(latestDiscordClient().channels.fetch).mockResolvedValue(channel);

    await expect(bot.sendMatchSummary('channel-123', createSummary())).rejects.toThrow(
      'Discord bot is missing required channel permissions for channel-123: ViewChannel.'
    );
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('rejects thread channels because monitoring requires a guild text channel', async () => {
    const bot = createBot(createPresentation());
    const channel = createTextChannel();
    channel.type = 11;
    jest.mocked(latestDiscordClient().channels.fetch).mockResolvedValue(channel);

    await expect(bot.sendMatchSummary('channel-123', createSummary())).rejects.toThrow(
      'Configured Discord channel channel-123 must be a normal guild text channel. Resolved type=11.'
    );
    expect(channel.send).not.toHaveBeenCalled();
  });
});
