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
import { CoachingDetectorRegistryService } from './services/coaching-detector-registry.service';
import {
  CoachingCandidateRankerService,
  CoachingNarrativeBuilderService,
} from './services/coaching-insight-ranking.service';
import { CoachingNarratorService } from './services/coaching-narrator.service';
import { CoachingPipelineService } from './services/coaching-pipeline.service';
import {
  DamageConversionDetector,
  FailedResetDetector,
  MovementExposureDetector,
  RecoveryDecisionDetector,
  TeamSpacingDetector,
} from './services/core-coaching-detectors.service';
import { DiscordBotService } from './services/discord-bot.service';
import { EncounterSegmenterService } from './services/encounter-segmenter.service';
import {
  ArmorDisadvantageDetector,
  CarryContextDetector,
  LifecycleAccuracyDetector,
  RedeployContextDetector,
  UtilityUsageDetector,
  VehicleDecisionDetector,
  ZoneRotationDetector,
} from './services/match-context-coaching-detectors.service';
import { MatchInterpreter } from './services/match-interpreter.service';
import { MatchMonitorService } from './services/match-monitor.service';
import { MatchPresentationService } from './services/match-presentation.service';
import { OpenRouterCoachingLlmClient } from './services/openrouter-coaching-llm-client.service';
import { PlayerStateProjectorService } from './services/player-state-projector.service';
import { PlayerStatsService } from './services/player-stats.service';
import { TelemetryContextEnricherService } from './services/telemetry-context-enricher.service';
import { TelemetryProcessorService } from './services/telemetry-processor.service';
import { TelemetryTimelineBuilderService } from './services/telemetry-timeline-builder.service';
import { TimelineCoachingAnalyzerService } from './services/timeline-coaching-analyzer.service';
import { TimelineCoachingShadowService } from './services/timeline-coaching-shadow.service';

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
  const timelineBuilder = new TelemetryTimelineBuilderService();
  const stateProjector = new PlayerStateProjectorService();
  const encounterSegmenter = new EncounterSegmenterService();
  const timelineShadow = new TimelineCoachingShadowService(
    timelineBuilder,
    stateProjector,
    encounterSegmenter
  );
  const contextEnricher = new TelemetryContextEnricherService();
  const detectorRegistry = new CoachingDetectorRegistryService([
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
  ]);
  const candidateRanker = new CoachingCandidateRankerService();
  const narrativeBuilder = new CoachingNarrativeBuilderService();
  const timelineAnalyzer = new TimelineCoachingAnalyzerService(
    timelineShadow,
    contextEnricher,
    detectorRegistry,
    candidateRanker,
    narrativeBuilder
  );
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
    analyze: (analysis, players, rawEvents) =>
      timelineAnalyzer.analyze(analysis, players, rawEvents),
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
