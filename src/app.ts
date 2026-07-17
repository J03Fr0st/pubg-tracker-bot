import { PubgClient } from '@j03fr0st/pubg-ts';
import { Client, GatewayIntentBits, REST } from 'discord.js';
import type { PrismaClient } from '../generated/prisma/client';
import type { AppConfig } from './config/config';
import { createPrismaClient } from './data/prisma.client';
import { MatchRepository } from './data/repositories/match.repository';
import { PlayerRepository } from './data/repositories/player.repository';
import { ProcessedMatchRepository } from './data/repositories/processed-match.repository';
import { SeasonCacheRepository } from './data/repositories/season-cache.repository';
import { TelemetryRepository } from './data/repositories/telemetry.repository';
import { CoachingDecisionEngineService } from './services/coaching-decision-engine.service';
import { CoachingNarratorService } from './services/coaching-narrator.service';
import { CoachingPipelineService } from './services/coaching-pipeline.service';
import { DiscordBotService } from './services/discord-bot.service';
import { FightContextBuilderService } from './services/fight-context-builder.service';
import { MatchInterpreter } from './services/match-interpreter.service';
import { MatchMonitorService } from './services/match-monitor.service';
import { MatchPresentationService } from './services/match-presentation.service';
import { OpenRouterCoachingLlmClient } from './services/openrouter-coaching-llm-client.service';
import { PlayerStatsService } from './services/player-stats.service';
import { TelemetryProcessorService } from './services/telemetry-processor.service';

export interface Application {
  prisma: PrismaClient;
  discordBot: DiscordBotService;
  matchMonitor: MatchMonitorService;
}

export function createApplication(config: AppConfig): Application {
  const prisma = createPrismaClient(config.database.url);
  const pubgClient = new PubgClient({
    apiKey: config.pubg.apiKey,
    shard: config.pubg.shard,
  });

  const playerRepository = new PlayerRepository(prisma);
  const processedMatchRepository = new ProcessedMatchRepository(prisma);
  const matchRepository = new MatchRepository(prisma);
  const telemetryRepository = new TelemetryRepository(prisma);
  const seasonCacheRepository = new SeasonCacheRepository(prisma);

  const playerStatsService = new PlayerStatsService(
    pubgClient,
    config.pubg.shard,
    seasonCacheRepository
  );
  const telemetryProcessor = new TelemetryProcessorService();
  const fightContextBuilder = new FightContextBuilderService();
  const coachingDecisionEngine = new CoachingDecisionEngineService();
  const llmClient =
    config.llm.coachingEnabled && config.llm.openRouterApiKey && config.llm.openRouterModel
      ? new OpenRouterCoachingLlmClient({
          apiKey: config.llm.openRouterApiKey,
          model: config.llm.openRouterModel,
          timeoutMs: config.llm.timeoutMs,
        })
      : undefined;
  const coachingNarrator = new CoachingNarratorService(llmClient, {
    enabled: Boolean(llmClient),
    maxLineLength: 240,
  });
  const coachingPipeline = new CoachingPipelineService({
    analyze: (analysis, monitoredPlayers, damage, resetEvents) =>
      coachingDecisionEngine.createInsights(
        fightContextBuilder.buildFightContexts(
          analysis,
          monitoredPlayers,
          damage,
          resetEvents
        )
      ),
    narrate: (insights) => coachingNarrator.narrate(insights),
  });
  const matchInterpreter = new MatchInterpreter();
  const matchPresentation = new MatchPresentationService({
    pubgClient,
    telemetryRepository,
    telemetryProcessor,
    playerStatsService,
    coachingPipeline,
  });

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });
  const rest = new REST().setToken(config.discord.token);
  const discordBot = new DiscordBotService({
    client,
    rest,
    token: config.discord.token,
    clientId: config.discord.clientId,
    pubgClient,
    playerRepository,
    processedMatchRepository,
    matchInterpreter,
    matchPresentation,
  });
  const matchMonitor = new MatchMonitorService({
    discordBot,
    pubgClient,
    playerRepository,
    processedMatchRepository,
    matchRepository,
    matchInterpreter,
    options: {
      checkIntervalMs: config.monitoring.checkIntervalMs,
      channelId: config.discord.channelId,
      maxMatchesToProcess: config.monitoring.maxMatchesToProcess,
    },
  });

  return { prisma, discordBot, matchMonitor };
}
