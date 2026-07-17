import { PubgClient } from '@j03fr0st/pubg-ts';
import { Client, GatewayIntentBits, REST } from 'discord.js';
import { createApplication } from '../../src/app';
import type { AppConfig } from '../../src/config/config';
import { createPrismaClient } from '../../src/data/prisma.client';
import { MatchRepository } from '../../src/data/repositories/match.repository';
import { PlayerRepository } from '../../src/data/repositories/player.repository';
import { ProcessedMatchRepository } from '../../src/data/repositories/processed-match.repository';
import { SeasonCacheRepository } from '../../src/data/repositories/season-cache.repository';
import { TelemetryRepository } from '../../src/data/repositories/telemetry.repository';
import { CoachingDecisionEngineService } from '../../src/services/coaching-decision-engine.service';
import { CoachingNarratorService } from '../../src/services/coaching-narrator.service';
import { CoachingPipelineService } from '../../src/services/coaching-pipeline.service';
import { DiscordBotService } from '../../src/services/discord-bot.service';
import { MatchInterpreter } from '../../src/services/match-interpreter.service';
import { MatchMonitorService } from '../../src/services/match-monitor.service';
import { MatchPresentationService } from '../../src/services/match-presentation.service';
import { OpenRouterCoachingLlmClient } from '../../src/services/openrouter-coaching-llm-client.service';
import { PlayerStatsService } from '../../src/services/player-stats.service';
import { TelemetryProcessorService } from '../../src/services/telemetry-processor.service';

const prisma = {
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
};
const pubgClient = {};
const discordClient = { on: jest.fn() };
const rest = { setToken: jest.fn().mockReturnThis() };

jest.mock('../../src/data/prisma.client', () => ({
  createPrismaClient: jest.fn(() => prisma),
}));
jest.mock('@j03fr0st/pubg-ts', () => ({
  PubgClient: jest.fn(() => pubgClient),
}));
jest.mock('discord.js', () => {
  const actual = jest.requireActual('discord.js');
  return {
    ...actual,
    Client: jest.fn(() => discordClient),
    REST: jest.fn(() => rest),
  };
});
jest.mock('../../src/data/repositories/match.repository');
jest.mock('../../src/data/repositories/player.repository');
jest.mock('../../src/data/repositories/processed-match.repository');
jest.mock('../../src/data/repositories/season-cache.repository');
jest.mock('../../src/data/repositories/telemetry.repository');
jest.mock('../../src/services/coaching-decision-engine.service');
jest.mock('../../src/services/coaching-narrator.service');
jest.mock('../../src/services/coaching-pipeline.service');
jest.mock('../../src/services/discord-bot.service');
jest.mock('../../src/services/match-interpreter.service');
jest.mock('../../src/services/match-monitor.service');
jest.mock('../../src/services/match-presentation.service');
jest.mock('../../src/services/openrouter-coaching-llm-client.service');
jest.mock('../../src/services/player-stats.service');
jest.mock('../../src/services/telemetry-processor.service');

const validConfig: AppConfig = {
  discord: {
    token: 'discord-token',
    clientId: 'discord-client-id',
    channelId: 'discord-channel-id',
  },
  pubg: {
    apiKey: 'pubg-api-key',
    shard: 'steam',
    maxRequestsPerMinute: 10,
  },
  database: { url: 'postgresql://user:pass@localhost:5432/pubg' },
  monitoring: {
    checkIntervalMs: 90_000,
    maxMatchesToProcess: 3,
  },
  llm: {
    coachingEnabled: true,
    provider: 'openrouter',
    openRouterApiKey: 'openrouter-key',
    openRouterModel: 'openrouter-model',
    timeoutMs: 8_000,
  },
};

describe('createApplication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rest.setToken.mockReturnThis();
  });

  it('constructs and exposes one explicit application graph with shared clients', async () => {
    const app = createApplication(validConfig);

    const playerRepository = jest.mocked(PlayerRepository).mock.instances[0];
    const processedMatchRepository = jest.mocked(ProcessedMatchRepository).mock.instances[0];
    const matchRepository = jest.mocked(MatchRepository).mock.instances[0];
    const telemetryRepository = jest.mocked(TelemetryRepository).mock.instances[0];
    const seasonCacheRepository = jest.mocked(SeasonCacheRepository).mock.instances[0];
    const playerStatsService = jest.mocked(PlayerStatsService).mock.instances[0];
    const telemetryProcessor = jest.mocked(TelemetryProcessorService).mock.instances[0];
    const coachingDecisionEngine = jest.mocked(CoachingDecisionEngineService).mock.instances[0];
    const llmClient = jest.mocked(OpenRouterCoachingLlmClient).mock.instances[0];
    const coachingNarrator = jest.mocked(CoachingNarratorService).mock.instances[0];
    const coachingPipeline = jest.mocked(CoachingPipelineService).mock.instances[0];
    const matchInterpreter = jest.mocked(MatchInterpreter).mock.instances[0];
    const matchPresentation = jest.mocked(MatchPresentationService).mock.instances[0];
    const discordBot = jest.mocked(DiscordBotService).mock.instances[0];
    const matchMonitor = jest.mocked(MatchMonitorService).mock.instances[0];

    expect(createPrismaClient).toHaveBeenCalledTimes(1);
    expect(createPrismaClient).toHaveBeenCalledWith(validConfig.database.url);
    expect(PubgClient).toHaveBeenCalledTimes(1);
    expect(PubgClient).toHaveBeenCalledWith({
      apiKey: validConfig.pubg.apiKey,
      shard: validConfig.pubg.shard,
    });

    expect(PlayerRepository).toHaveBeenCalledTimes(1);
    expect(PlayerRepository).toHaveBeenCalledWith(prisma);
    expect(ProcessedMatchRepository).toHaveBeenCalledTimes(1);
    expect(ProcessedMatchRepository).toHaveBeenCalledWith(prisma);
    expect(MatchRepository).toHaveBeenCalledTimes(1);
    expect(MatchRepository).toHaveBeenCalledWith(prisma);
    expect(TelemetryRepository).toHaveBeenCalledTimes(1);
    expect(TelemetryRepository).toHaveBeenCalledWith(prisma);
    expect(SeasonCacheRepository).toHaveBeenCalledTimes(1);
    expect(SeasonCacheRepository).toHaveBeenCalledWith(prisma);

    expect(PlayerStatsService).toHaveBeenCalledTimes(1);
    expect(PlayerStatsService).toHaveBeenCalledWith(
      pubgClient,
      validConfig.pubg.shard,
      seasonCacheRepository
    );
    expect(TelemetryProcessorService).toHaveBeenCalledTimes(1);
    expect(TelemetryProcessorService).toHaveBeenCalledWith();
    expect(CoachingDecisionEngineService).toHaveBeenCalledTimes(1);
    expect(CoachingDecisionEngineService).toHaveBeenCalledWith();
    expect(OpenRouterCoachingLlmClient).toHaveBeenCalledTimes(1);
    expect(OpenRouterCoachingLlmClient).toHaveBeenCalledWith({
      apiKey: validConfig.llm.openRouterApiKey,
      model: validConfig.llm.openRouterModel,
      timeoutMs: validConfig.llm.timeoutMs,
    });
    expect(CoachingNarratorService).toHaveBeenCalledTimes(1);
    expect(CoachingNarratorService).toHaveBeenCalledWith(llmClient, {
      enabled: true,
      maxLineLength: 240,
    });
    expect(CoachingPipelineService).toHaveBeenCalledTimes(1);
    expect(CoachingPipelineService).toHaveBeenCalledWith({
      decisionEngine: coachingDecisionEngine,
      narrate: expect.any(Function),
    });
    expect(MatchInterpreter).toHaveBeenCalledTimes(1);
    expect(MatchInterpreter).toHaveBeenCalledWith();
    expect(MatchPresentationService).toHaveBeenCalledTimes(1);
    expect(MatchPresentationService).toHaveBeenCalledWith({
      pubgClient,
      telemetryRepository,
      telemetryProcessor,
      playerStatsService,
      coachingPipeline,
    });

    expect(Client).toHaveBeenCalledTimes(1);
    expect(Client).toHaveBeenCalledWith({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
    expect(REST).toHaveBeenCalledTimes(1);
    expect(REST).toHaveBeenCalledWith();
    expect(rest.setToken).toHaveBeenCalledTimes(1);
    expect(rest.setToken).toHaveBeenCalledWith(validConfig.discord.token);

    expect(DiscordBotService).toHaveBeenCalledTimes(1);
    expect(DiscordBotService).toHaveBeenCalledWith({
      client: discordClient,
      rest,
      token: validConfig.discord.token,
      clientId: validConfig.discord.clientId,
      pubgClient,
      playerRepository,
      processedMatchRepository,
      matchInterpreter,
      matchPresentation,
    });
    expect(MatchMonitorService).toHaveBeenCalledTimes(1);
    expect(MatchMonitorService).toHaveBeenCalledWith({
      discordBot,
      pubgClient,
      playerRepository,
      processedMatchRepository,
      matchRepository,
      matchInterpreter,
      options: {
        checkIntervalMs: validConfig.monitoring.checkIntervalMs,
        channelId: validConfig.discord.channelId,
        maxMatchesToProcess: validConfig.monitoring.maxMatchesToProcess,
      },
    });

    expect(app).toEqual({ prisma, discordBot, matchMonitor });

    await app.prisma.$connect();
    await app.discordBot.initialize();
    await app.matchMonitor.startMonitoring();
    app.matchMonitor.stopMonitoring();
    await app.prisma.$disconnect();

    expect(prisma.$connect).toHaveBeenCalledTimes(1);
    expect(jest.mocked(discordBot?.initialize)).toHaveBeenCalledTimes(1);
    expect(jest.mocked(matchMonitor?.startMonitoring)).toHaveBeenCalledTimes(1);
    expect(jest.mocked(matchMonitor?.stopMonitoring)).toHaveBeenCalledTimes(1);
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);

    expect(coachingDecisionEngine).toBeDefined();
    expect(coachingNarrator).toBeDefined();
  });
});
