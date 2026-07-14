import { PubgClient } from '@j03fr0st/pubg-ts';
import { Client, EmbedBuilder, Events, PermissionFlagsBits } from 'discord.js';
import { PlayerRepository } from '../../src/data/repositories/player.repository';
import { TelemetryRepository } from '../../src/data/repositories/telemetry.repository';
import { CoachingPipelineService } from '../../src/services/coaching-pipeline.service';
import { DiscordBotService } from '../../src/services/discord-bot.service';
import { MatchInterpreter } from '../../src/services/match-interpreter.service';
import {
  type MatchPresentationDependencies,
  MatchPresentationService,
} from '../../src/services/match-presentation.service';
import { PlayerStatsService } from '../../src/services/player-stats.service';
import { TelemetryProcessorService } from '../../src/services/telemetry-processor.service';
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

function createPresentation(): MatchPresentationService {
  const pubgClient = new PubgClient({ apiKey: 'test-api-key', shard: 'steam' });
  const dependencies: MatchPresentationDependencies = {
    pubgClient,
    telemetryRepository: new TelemetryRepository(),
    telemetryProcessor: new TelemetryProcessorService(),
    playerStatsService: new PlayerStatsService(pubgClient, 'steam'),
    coachingPipeline: new CoachingPipelineService({
      analyze: () => [],
      narrate: async () => ({ sections: [] }),
    }),
  };
  return new MatchPresentationService(dependencies);
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

  it('delegates presentation and sends 12 small embeds in exact 10/2 batches', async () => {
    const presentation = createPresentation();
    const embeds = Array.from({ length: 12 }, (_, index) =>
      new EmbedBuilder().setTitle(`Embed ${index + 1}`)
    );
    const createEmbeds = jest.spyOn(presentation, 'createEmbeds').mockResolvedValue(embeds);
    const bot = new DiscordBotService('test-api-key', 'steam', presentation);
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
    const bot = new DiscordBotService('test-api-key', 'steam', presentation);
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
    const bot = new DiscordBotService('test-api-key', 'steam', presentation);
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
    const bot = new DiscordBotService('test-api-key', 'steam', presentation);
    const channel = createTextChannel();
    jest.mocked(latestDiscordClient().channels.fetch).mockResolvedValue(channel);

    await expect(bot.sendMatchSummary('channel-123', createSummary())).rejects.toThrow(
      "Embed text length 6001 exceeds Discord's 6000-character message limit"
    );
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('sends real basic presentation output through the gateway', async () => {
    const bot = new DiscordBotService('test-api-key', 'steam', createPresentation());
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

  it('delegates manual processmatch presentation and batches rich output within both limits', async () => {
    const presentation = createPresentation();
    const embeds = Array.from({ length: 12 }, (_, index) => createRichEmbed(index + 1, 1000));
    const createEmbeds = jest.spyOn(presentation, 'createEmbeds').mockResolvedValue(embeds);
    new DiscordBotService('test-api-key', 'steam', presentation);
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

  it('uses the production presentation factory for manual processmatch output', async () => {
    const expectedEmbeds = [createRichEmbed(1)];
    const createEmbeds = jest
      .spyOn(MatchPresentationService.prototype, 'createEmbeds')
      .mockResolvedValue(expectedEmbeds);
    new DiscordBotService('test-api-key', 'steam');
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
    expect(interaction.editReply).toHaveBeenCalledWith({ embeds: expectedEmbeds });
  });

  it('explains Missing Access returned while sending a batch', async () => {
    const bot = new DiscordBotService('test-api-key', 'steam', createPresentation());
    const channel = createTextChannel();
    channel.send.mockRejectedValue({ code: 50001, message: 'Missing Access' });
    jest.mocked(latestDiscordClient().channels.fetch).mockResolvedValue(channel);

    await expect(bot.sendMatchSummary('channel-123', createSummary())).rejects.toThrow(
      'Discord bot cannot access channel channel-123. Discord error 50001 Missing Access.'
    );
  });

  it('explains when Discord cannot fetch the configured channel', async () => {
    const bot = new DiscordBotService('test-api-key', 'steam', createPresentation());
    jest
      .mocked(latestDiscordClient().channels.fetch)
      .mockRejectedValue({ code: 50001, message: 'Missing Access' });

    await expect(bot.sendMatchSummary('missing-channel', createSummary())).rejects.toThrow(
      'Discord bot cannot access channel missing-channel. Discord error 50001 Missing Access.'
    );
  });

  it('rejects before sending when the bot cannot view the channel', async () => {
    const bot = new DiscordBotService('test-api-key', 'steam', createPresentation());
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
    const bot = new DiscordBotService('test-api-key', 'steam', createPresentation());
    const channel = createTextChannel();
    channel.type = 11;
    jest.mocked(latestDiscordClient().channels.fetch).mockResolvedValue(channel);

    await expect(bot.sendMatchSummary('channel-123', createSummary())).rejects.toThrow(
      'Configured Discord channel channel-123 must be a normal guild text channel. Resolved type=11.'
    );
    expect(channel.send).not.toHaveBeenCalled();
  });
});
