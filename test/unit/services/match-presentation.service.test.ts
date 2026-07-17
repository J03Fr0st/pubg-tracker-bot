import { PubgClient, type TelemetryEvent } from '@j03fr0st/pubg-ts';
import { EmbedBuilder } from 'discord.js';
import { SeasonCacheRepository } from '../../../src/data/repositories/season-cache.repository';
import { TelemetryRepository } from '../../../src/data/repositories/telemetry.repository';
import { CoachingDecisionEngineService } from '../../../src/services/coaching-decision-engine.service';
import { CoachingPipelineService } from '../../../src/services/coaching-pipeline.service';
import {
  type MatchPresentationDependencies,
  MatchPresentationService,
} from '../../../src/services/match-presentation.service';
import { PlayerStatsService } from '../../../src/services/player-stats.service';
import { TelemetryProcessorService } from '../../../src/services/telemetry-processor.service';
import type { MatchAnalysis, PlayerAnalysis } from '../../../src/types/analytics-results.types';
import * as logger from '../../../src/utils/logger';
import { MatchColorUtil } from '../../../src/utils/match-colors.util';
import { makeMatchParticipantStats, makeMatchSummary } from '../../fixtures/match-summary.fixture';

function createDependencies(): MatchPresentationDependencies {
  const pubgClient = new PubgClient({ apiKey: 'test-api-key', shard: 'steam' });
  const prisma = {} as never;
  return {
    pubgClient,
    telemetryRepository: new TelemetryRepository(prisma),
    telemetryProcessor: new TelemetryProcessorService(),
    playerStatsService: new PlayerStatsService(
      pubgClient,
      'steam',
      new SeasonCacheRepository(prisma)
    ),
    coachingPipeline: new CoachingPipelineService({
      decisionEngine: new CoachingDecisionEngineService(),
      narrate: async () => ({ sections: [] }),
    }),
  };
}

function createPlayerAnalysis(pubgId: string, playerName: string): PlayerAnalysis {
  return {
    pubgId,
    playerName,
    matchStartTime: new Date('2026-07-14T08:00:00.000Z'),
    killEvents: [],
    knockdownEvents: [],
    damageEvents: [],
    reviveEvents: [],
    deathEvents: [],
    knockedDownEvents: [],
    weaponStats: [],
    killChains: [],
    calculatedAssists: [],
    totalDamageDealt: 450,
    totalDamageTaken: 125,
    kdRatio: 2,
    avgKillDistance: 80,
    headshotPercentage: 50,
    killsPerMinute: 0.1,
  };
}

function createMatchAnalysis(matchId: string, pubgId: string, playerName: string): MatchAnalysis {
  return {
    matchId,
    playerAnalyses: new Map([[pubgId, createPlayerAnalysis(pubgId, playerName)]]),
    processingTimeMs: 5,
    totalEventsProcessed: 0,
  };
}

describe('MatchPresentationService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the main and basic player embeds without telemetry work', async () => {
    const deps = createDependencies();
    const cacheRead = jest.spyOn(deps.telemetryRepository, 'getTelemetry');
    const liveTelemetry = jest.spyOn(deps.pubgClient.matches, 'getTelemetry');
    const processTelemetry = jest.spyOn(deps.telemetryProcessor, 'processMatchTelemetry');
    const seasonStats = jest.spyOn(deps.playerStatsService, 'getSeasonStats');
    const coaching = jest.spyOn(deps.coachingPipeline, 'run');
    const service = new MatchPresentationService(deps);
    const summary = makeMatchSummary({
      matchId: 'basic-match',
      mapName: 'Baltic_Main',
      gameMode: 'squad',
      rosterParticipants: [
        {
          name: 'BasicPlayer',
          pubgId: 'account.basic',
          stats: makeMatchParticipantStats({
            DBNOs: 2,
            assists: 1,
            damageDealt: 321.4,
            headshotKills: 1,
            kills: 2,
            longestKill: 87.6,
            timeSurvived: 900,
            walkDistance: 1250,
          }),
        },
      ],
    });

    const embeds = await service.createEmbeds(summary);

    expect(embeds).toHaveLength(2);
    expect(embeds[0].data.title).toBe('🎮 PUBG Match Summary');
    expect(embeds[0].data.description).toContain('⚔️ Total Kills: **2**');
    expect(embeds[1].data).toMatchObject({
      title: 'Player: BasicPlayer',
      description: expect.stringContaining('💥 Damage: 321 (1 assists)'),
    });
    expect(cacheRead).not.toHaveBeenCalled();
    expect(liveTelemetry).not.toHaveBeenCalled();
    expect(processTelemetry).not.toHaveBeenCalled();
    expect(seasonStats).not.toHaveBeenCalled();
    expect(coaching).not.toHaveBeenCalled();
  });

  it('uses roster participants for totals and order but enhances only monitored players', async () => {
    const deps = createDependencies();
    const matchAnalysis = createMatchAnalysis('role-match', 'account.monitored', 'MonitoredPlayer');
    jest.spyOn(deps.telemetryRepository, 'getTelemetry').mockResolvedValue({
      kind: 'hit',
      matchAnalysis,
      rawEvents: [],
    });
    jest.spyOn(deps.playerStatsService, 'getSeasonStats').mockResolvedValue(new Map());
    const coaching = jest.spyOn(deps.coachingPipeline, 'run').mockResolvedValue({ kind: 'empty' });
    const service = new MatchPresentationService(deps);
    const monitored = {
      name: 'MonitoredPlayer',
      pubgId: 'account.monitored',
      rosterId: 'roster-1',
      stats: makeMatchParticipantStats({ kills: 2, damageDealt: 200 }),
    };
    const teammate = {
      name: 'RosterTeammate',
      pubgId: 'account.teammate',
      rosterId: 'roster-1',
      stats: makeMatchParticipantStats({ kills: 1, damageDealt: 100 }),
    };
    const summary = makeMatchSummary({
      matchId: 'role-match',
      mapName: 'Baltic_Main',
      gameMode: 'squad',
      telemetryUrl: 'https://telemetry.example/role-match',
      rosterParticipants: [monitored, teammate],
      monitoredPlayers: [monitored],
      lobbyParticipants: [
        monitored,
        teammate,
        {
          name: 'LobbyOpponent',
          pubgId: 'account.opponent',
          rosterId: 'roster-2',
          stats: makeMatchParticipantStats(),
        },
      ],
    });

    const embeds = await service.createEmbeds(summary);

    expect(embeds[0].data.description).toContain('👥 Squad Size: **2 players**');
    expect(embeds[0].data.description).toContain('⚔️ Total Kills: **3**');
    expect(embeds[0].data.description).toContain('💥 Total Damage: **300**');
    expect(embeds.slice(1, 3).map((embed) => embed.data.title)).toEqual([
      'Player: MonitoredPlayer',
      'Player: RosterTeammate',
    ]);
    expect(embeds[1].data.description).toContain('⚔️ **COMBAT STATS**');
    expect(embeds[2].data.description).toContain('⚔️ Kills: 1');
    expect(embeds[2].data.description).not.toContain('⚔️ **COMBAT STATS**');
    expect(coaching).toHaveBeenCalledWith({
      matchAnalysis,
      monitoredPlayers: [monitored],
      telemetryEvents: [],
    });
  });

  it('creates enhanced player embeds from live telemetry', async () => {
    const deps = createDependencies();
    jest.spyOn(deps.telemetryRepository, 'getTelemetry').mockResolvedValue({ kind: 'miss' });
    jest.spyOn(deps.telemetryRepository, 'saveTelemetry').mockResolvedValue(undefined);
    const liveTelemetry = jest.spyOn(deps.pubgClient.matches, 'getTelemetry').mockResolvedValue([]);
    const processTelemetry = jest
      .spyOn(deps.telemetryProcessor, 'processMatchTelemetry')
      .mockResolvedValue(createMatchAnalysis('live-match', 'account.live', 'LivePlayer'));
    jest.spyOn(deps.playerStatsService, 'getSeasonStats').mockResolvedValue(new Map());
    jest.spyOn(deps.coachingPipeline, 'run').mockResolvedValue({ kind: 'empty' });
    const service = new MatchPresentationService(deps);
    const summary = makeMatchSummary({
      matchId: 'live-match',
      mapName: 'Baltic_Main',
      gameMode: 'squad',
      telemetryUrl: 'https://telemetry.example/live-match',
      rosterParticipants: [
        {
          name: 'LivePlayer',
          pubgId: 'account.live',
          stats: makeMatchParticipantStats({ kills: 2, damageDealt: 450 }),
        },
      ],
    });

    const embeds = await service.createEmbeds(summary);

    expect(embeds[1].data.description).toContain('⚔️ **COMBAT STATS**');
    expect(liveTelemetry).toHaveBeenCalledWith('live-match');
    expect(processTelemetry).toHaveBeenCalledWith(
      [],
      'live-match',
      summary.playedAt,
      summary.monitoredPlayers
    );
  });

  it('keeps enhanced delivery nonblocking when saving the live telemetry cache fails', async () => {
    const deps = createDependencies();
    const rawEvents: TelemetryEvent[] = [
      {
        _D: '2026-07-14T08:00:00.000Z',
        _T: 'FixtureEvent',
        common: { isGame: 1 },
      },
    ];
    const matchAnalysis = createMatchAnalysis('cache-save-failure', 'account.live', 'LivePlayer');
    jest.spyOn(deps.telemetryRepository, 'getTelemetry').mockResolvedValue({ kind: 'miss' });
    const saveTelemetry = jest
      .spyOn(deps.telemetryRepository, 'saveTelemetry')
      .mockRejectedValue(new Error('cache unavailable'));
    jest.spyOn(deps.pubgClient.matches, 'getTelemetry').mockResolvedValue(rawEvents);
    jest.spyOn(deps.telemetryProcessor, 'processMatchTelemetry').mockResolvedValue(matchAnalysis);
    jest.spyOn(deps.playerStatsService, 'getSeasonStats').mockResolvedValue(new Map());
    jest.spyOn(deps.coachingPipeline, 'run').mockResolvedValue({ kind: 'empty' });
    jest.spyOn(logger, 'debug').mockImplementation();
    const service = new MatchPresentationService(deps);
    const summary = makeMatchSummary({
      matchId: 'cache-save-failure',
      mapName: 'Baltic_Main',
      gameMode: 'squad',
      telemetryUrl: 'https://telemetry.example/cache-save-failure',
      rosterParticipants: [
        {
          name: 'LivePlayer',
          pubgId: 'account.live',
          stats: makeMatchParticipantStats(),
        },
      ],
    });

    const embeds = await service.createEmbeds(summary);

    expect(saveTelemetry).toHaveBeenCalledWith(rawEvents, matchAnalysis);
    expect(embeds[1].data.description).toContain('⚔️ **COMBAT STATS**');
  });

  it('renders identical full embed data from the same live and cached telemetry fixture', async () => {
    const deps = createDependencies();
    const matchAnalysis = createMatchAnalysis('cache-parity', 'account.parity', 'ParityPlayer');
    const rawEvents: TelemetryEvent[] = [];
    jest
      .spyOn(deps.telemetryRepository, 'getTelemetry')
      .mockResolvedValueOnce({ kind: 'miss' })
      .mockResolvedValueOnce({ kind: 'hit', matchAnalysis, rawEvents });
    jest.spyOn(deps.telemetryRepository, 'saveTelemetry').mockResolvedValue(undefined);
    jest.spyOn(deps.pubgClient.matches, 'getTelemetry').mockResolvedValue(rawEvents);
    jest.spyOn(deps.telemetryProcessor, 'processMatchTelemetry').mockResolvedValue(matchAnalysis);
    jest.spyOn(deps.playerStatsService, 'getSeasonStats').mockResolvedValue(new Map());
    jest.spyOn(deps.coachingPipeline, 'run').mockResolvedValue({ kind: 'empty' });
    const service = new MatchPresentationService(deps);
    const summary = makeMatchSummary({
      matchId: 'cache-parity',
      mapName: 'Baltic_Main',
      gameMode: 'squad',
      telemetryUrl: 'https://telemetry.example/cache-parity',
      rosterParticipants: [
        {
          name: 'ParityPlayer',
          pubgId: 'account.parity',
          stats: makeMatchParticipantStats(),
        },
      ],
    });

    const live = await service.createEmbeds(summary);
    const cached = await service.createEmbeds(summary);

    expect(cached.map((embed) => embed.toJSON())).toEqual(live.map((embed) => embed.toJSON()));
  });

  it('uses cached telemetry without a live fetch and still creates coaching', async () => {
    const deps = createDependencies();
    const matchAnalysis = createMatchAnalysis('cached-match', 'account.cached', 'CachedPlayer');
    jest.spyOn(deps.telemetryRepository, 'getTelemetry').mockResolvedValue({
      kind: 'hit',
      matchAnalysis,
      rawEvents: [],
    });
    const liveTelemetry = jest.spyOn(deps.pubgClient.matches, 'getTelemetry');
    const processTelemetry = jest.spyOn(deps.telemetryProcessor, 'processMatchTelemetry');
    jest.spyOn(deps.playerStatsService, 'getSeasonStats').mockResolvedValue(new Map());
    const coaching = jest.spyOn(deps.coachingPipeline, 'run').mockResolvedValue({
      kind: 'ok',
      insights: [],
      narration: {
        sections: [{ playerName: 'CachedPlayer', lines: ['Hold the stronger angle.'] }],
      },
    });
    const service = new MatchPresentationService(deps);
    const summary = makeMatchSummary({
      matchId: 'cached-match',
      mapName: 'Baltic_Main',
      gameMode: 'squad',
      telemetryUrl: 'https://telemetry.example/cached-match',
      rosterParticipants: [
        {
          name: 'CachedPlayer',
          pubgId: 'account.cached',
          stats: makeMatchParticipantStats(),
        },
      ],
    });

    const embeds = await service.createEmbeds(summary);

    expect(embeds.map((embed) => embed.data.title)).toContain('Coaching');
    expect(embeds.at(-1)?.data.description).toContain('Hold the stronger angle.');
    expect(liveTelemetry).not.toHaveBeenCalled();
    expect(processTelemetry).not.toHaveBeenCalled();
    expect(coaching).toHaveBeenCalledWith({
      matchAnalysis,
      monitoredPlayers: summary.monitoredPlayers,
      telemetryEvents: [],
    });
  });

  it('calculates opponent difficulty from unique encountered opponents', async () => {
    const deps = createDependencies();
    const matchAnalysis = createMatchAnalysis('opponent-match', 'account.tracked', 'TrackedPlayer');
    const playerAnalysis = matchAnalysis.playerAnalyses.get('account.tracked');
    if (!playerAnalysis) {
      throw new Error('Expected tracked player analysis');
    }
    playerAnalysis.killEvents = JSON.parse(
      JSON.stringify([
        {
          _D: '2026-07-14T08:01:00.000Z',
          _T: 'LogPlayerKillV2',
          killer: { name: 'TrackedPlayer', accountId: 'account.tracked' },
          victim: { name: 'EnemyA', accountId: 'account.enemy-a' },
        },
        {
          _D: '2026-07-14T08:02:00.000Z',
          _T: 'LogPlayerKillV2',
          killer: { name: 'TrackedPlayer', accountId: 'account.tracked' },
          victim: { name: 'EnemyA', accountId: 'account.enemy-a' },
        },
        {
          _D: '2026-07-14T08:03:00.000Z',
          _T: 'LogPlayerKillV2',
          killer: { name: 'TrackedPlayer', accountId: 'account.tracked' },
          victim: { name: 'EnemyB', accountId: 'account.enemy-b' },
        },
      ])
    );
    jest.spyOn(deps.telemetryRepository, 'getTelemetry').mockResolvedValue({
      kind: 'hit',
      matchAnalysis,
      rawEvents: [],
    });
    const seasonStats = jest.spyOn(deps.playerStatsService, 'getSeasonStats').mockResolvedValue(
      new Map([
        ['account.enemy-a', { kd: 1.5, adr: 225 }],
        ['account.enemy-b', { kd: 1.5, adr: 225 }],
      ])
    );
    jest.spyOn(deps.coachingPipeline, 'run').mockResolvedValue({ kind: 'empty' });
    const service = new MatchPresentationService(deps);
    const summary = makeMatchSummary({
      matchId: 'opponent-match',
      mapName: 'Baltic_Main',
      gameMode: 'squad',
      telemetryUrl: 'https://telemetry.example/opponent-match',
      rosterParticipants: [
        {
          name: 'TrackedPlayer',
          pubgId: 'account.tracked',
          stats: makeMatchParticipantStats(),
        },
      ],
      lobbyParticipants: [],
    });

    const embeds = await service.createEmbeds(summary);

    expect(embeds[0].data.description).toContain(
      '⚔️ Opponent Difficulty: **Hard** (75/100, 2 opponents)'
    );
    expect(seasonStats).toHaveBeenCalledWith(['account.enemy-a', 'account.enemy-b'], 'squad');
  });

  it('uses summary lobby players, counts bots, and omits humans without stats', async () => {
    const deps = createDependencies();
    const matchAnalysis = createMatchAnalysis('lobby-match', 'account.ranked', 'LobbyPlayer');
    jest.spyOn(deps.telemetryRepository, 'getTelemetry').mockResolvedValue({
      kind: 'hit',
      matchAnalysis,
      rawEvents: [],
    });
    const seasonStats = jest
      .spyOn(deps.playerStatsService, 'getSeasonStats')
      .mockResolvedValue(new Map([['account.ranked', { kd: 2, adr: 300 }]]));
    jest.spyOn(deps.coachingPipeline, 'run').mockResolvedValue({ kind: 'empty' });
    const service = new MatchPresentationService(deps);
    const rankedPlayer = {
      name: 'LobbyPlayer',
      pubgId: 'account.ranked',
      stats: makeMatchParticipantStats(),
    };
    const summary = makeMatchSummary({
      matchId: 'lobby-match',
      mapName: 'Baltic_Main',
      gameMode: 'squad',
      telemetryUrl: 'https://telemetry.example/lobby-match',
      rosterParticipants: [rankedPlayer],
      lobbyParticipants: [
        rankedPlayer,
        {
          name: 'MissingStats',
          pubgId: 'account.missing',
          stats: makeMatchParticipantStats(),
        },
        {
          name: 'BotPlayer',
          pubgId: 'ai.bot-player',
          stats: makeMatchParticipantStats(),
        },
      ],
    });

    const embeds = await service.createEmbeds(summary);

    expect(embeds[0].data.description).toContain(
      '🏟️ Lobby Difficulty: **Standard** (50/100, 2 players: 1 human, 1 bot)'
    );
    expect(seasonStats).toHaveBeenCalledWith(['account.ranked', 'account.missing'], 'squad');
  });

  it('keeps long enhanced timelines within the Discord description limit', async () => {
    const deps = createDependencies();
    const matchAnalysis = createMatchAnalysis(
      'timeline-match',
      'account.timeline',
      'TimelinePlayer'
    );
    const playerAnalysis = matchAnalysis.playerAnalyses.get('account.timeline');
    if (!playerAnalysis) {
      throw new Error('Expected timeline player analysis');
    }
    playerAnalysis.killEvents = JSON.parse(
      JSON.stringify(
        Array.from({ length: 100 }, (_, index) => ({
          _D: new Date(Date.UTC(2026, 6, 14, 8, index, 0)).toISOString(),
          _T: 'LogPlayerKillV2',
          killer: { name: 'TimelinePlayer', accountId: 'account.timeline' },
          victim: {
            name: `EnemyWithAnIntentionallyLongName${index}`,
            accountId: `account.enemy-${index}`,
            teamId: index + 2,
          },
          damageCauserName: 'WeapBerylM762_C',
          distance: 4200,
        }))
      )
    );
    jest.spyOn(deps.telemetryRepository, 'getTelemetry').mockResolvedValue({
      kind: 'hit',
      matchAnalysis,
      rawEvents: [],
    });
    jest.spyOn(deps.playerStatsService, 'getSeasonStats').mockResolvedValue(new Map());
    jest.spyOn(deps.coachingPipeline, 'run').mockResolvedValue({ kind: 'empty' });
    const service = new MatchPresentationService(deps);
    const summary = makeMatchSummary({
      matchId: 'timeline-match',
      mapName: 'Baltic_Main',
      gameMode: 'squad',
      telemetryUrl: 'https://telemetry.example/timeline-match',
      rosterParticipants: [
        {
          name: 'TimelinePlayer',
          pubgId: 'account.timeline',
          stats: makeMatchParticipantStats(),
        },
      ],
      lobbyParticipants: [],
    });

    const embeds = await service.createEmbeds(summary);
    const description = embeds[1].data.description ?? '';

    expect(description).toContain('**TIMELINE**');
    expect(description.length).toBeLessThanOrEqual(4096);
    expect(description).toContain('⏰ Survival: 0min • 0.0km');
    expect(description).toContain(
      '🎯 [2D Replay](https://pubg.sh/TimelinePlayer/steam/timeline-match)'
    );
    expect(description).toMatch(
      /⏰ Survival: 0min • 0\.0km\n\n🎯 \[2D Replay\]\(https:\/\/pubg\.sh\/TimelinePlayer\/steam\/timeline-match\)$/
    );
    const timeline = description.split('\n\n⏰ Survival:')[0].split('**TIMELINE**\n')[1];
    expect((timeline.match(/\[/g) ?? []).length).toBe((timeline.match(/\]/g) ?? []).length);
    expect((timeline.match(/\(/g) ?? []).length).toBe((timeline.match(/\)/g) ?? []).length);
  });

  it('warns for corrupt cache data and falls back to live telemetry', async () => {
    const deps = createDependencies();
    jest.spyOn(deps.telemetryRepository, 'getTelemetry').mockResolvedValue({
      kind: 'corrupt',
      reason: 'invalid matchStartTime',
    });
    jest.spyOn(deps.telemetryRepository, 'saveTelemetry').mockResolvedValue(undefined);
    const liveTelemetry = jest.spyOn(deps.pubgClient.matches, 'getTelemetry').mockResolvedValue([]);
    jest
      .spyOn(deps.telemetryProcessor, 'processMatchTelemetry')
      .mockResolvedValue(createMatchAnalysis('corrupt-match', 'account.corrupt', 'CorruptPlayer'));
    jest.spyOn(deps.playerStatsService, 'getSeasonStats').mockResolvedValue(new Map());
    jest.spyOn(deps.coachingPipeline, 'run').mockResolvedValue({ kind: 'empty' });
    const warning = jest.spyOn(logger, 'warn').mockImplementation();
    const service = new MatchPresentationService(deps);
    const summary = makeMatchSummary({
      matchId: 'corrupt-match',
      mapName: 'Baltic_Main',
      gameMode: 'squad',
      telemetryUrl: 'https://telemetry.example/corrupt-match',
      rosterParticipants: [
        {
          name: 'CorruptPlayer',
          pubgId: 'account.corrupt',
          stats: makeMatchParticipantStats(),
        },
      ],
      lobbyParticipants: [],
    });

    const embeds = await service.createEmbeds(summary);

    expect(warning).toHaveBeenCalledWith(
      'Ignoring corrupt telemetry cache for corrupt-match: invalid matchStartTime'
    );
    expect(liveTelemetry).toHaveBeenCalledWith('corrupt-match');
    expect(embeds[1].data.description).toContain('⚔️ **COMBAT STATS**');
  });

  it('warns and treats a cache lookup failure as a live telemetry miss', async () => {
    const deps = createDependencies();
    const matchAnalysis = createMatchAnalysis(
      'cache-error-match',
      'account.cache-error',
      'CacheErrorPlayer'
    );
    const playerAnalysis = matchAnalysis.playerAnalyses.get('account.cache-error');
    if (!playerAnalysis) {
      throw new Error('Expected cache error player analysis');
    }
    playerAnalysis.killEvents = JSON.parse(
      JSON.stringify([
        {
          _D: '2026-07-14T08:01:00.000Z',
          _T: 'LogPlayerKillV2',
          killer: { name: 'CacheErrorPlayer', accountId: 'account.cache-error' },
          victim: { name: 'Enemy', accountId: 'account.enemy' },
        },
      ])
    );
    const cacheRead = jest
      .spyOn(deps.telemetryRepository, 'getTelemetry')
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce({ kind: 'miss' });
    jest.spyOn(deps.telemetryRepository, 'saveTelemetry').mockResolvedValue(undefined);
    const liveTelemetry = jest.spyOn(deps.pubgClient.matches, 'getTelemetry').mockResolvedValue([]);
    jest.spyOn(deps.telemetryProcessor, 'processMatchTelemetry').mockResolvedValue(matchAnalysis);
    jest.spyOn(deps.playerStatsService, 'getSeasonStats').mockResolvedValue(
      new Map([
        ['account.enemy', { kd: 1.5, adr: 225 }],
        ['account.lobby-enemy', { kd: 2, adr: 300 }],
      ])
    );
    jest.spyOn(deps.coachingPipeline, 'run').mockResolvedValue({
      kind: 'ok',
      insights: [],
      narration: {
        sections: [{ playerName: 'CacheErrorPlayer', lines: ['Keep the stronger angle.'] }],
      },
    });
    const warning = jest.spyOn(logger, 'warn').mockImplementation();
    const service = new MatchPresentationService(deps);
    const summary = makeMatchSummary({
      matchId: 'cache-error-match',
      mapName: 'Baltic_Main',
      gameMode: 'squad',
      telemetryUrl: 'https://telemetry.example/cache-error-match',
      rosterParticipants: [
        {
          name: 'CacheErrorPlayer',
          pubgId: 'account.cache-error',
          stats: makeMatchParticipantStats(),
        },
      ],
      lobbyParticipants: [
        {
          name: 'LobbyEnemy',
          pubgId: 'account.lobby-enemy',
          stats: makeMatchParticipantStats(),
        },
      ],
    });

    const cacheErrorEmbeds = await service.createEmbeds(summary);

    expect(cacheRead).toHaveBeenCalledTimes(1);
    expect(liveTelemetry).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(
      'Failed to read telemetry cache for cache-error-match: Error: database unavailable'
    );
    expect(cacheErrorEmbeds[0].data.description).toContain('Opponent Difficulty:');
    expect(cacheErrorEmbeds[0].data.description).toContain('Lobby Difficulty:');
    expect(cacheErrorEmbeds[1].data.description).toContain('⚔️ **COMBAT STATS**');
    expect(cacheErrorEmbeds.at(-1)?.data.description).toContain('Keep the stronger angle.');

    const cacheMissEmbeds = await service.createEmbeds(summary);

    expect(cacheErrorEmbeds.map((embed) => embed.toJSON())).toEqual(
      cacheMissEmbeds.map((embed) => embed.toJSON())
    );
  });

  it('returns basic embeds when telemetry loading fails', async () => {
    const deps = createDependencies();
    jest.spyOn(deps.telemetryRepository, 'getTelemetry').mockResolvedValue({ kind: 'miss' });
    jest
      .spyOn(deps.pubgClient.matches, 'getTelemetry')
      .mockRejectedValue(new Error('telemetry unavailable'));
    const coaching = jest.spyOn(deps.coachingPipeline, 'run');
    jest.spyOn(logger, 'error').mockImplementation();
    const service = new MatchPresentationService(deps);
    const summary = makeMatchSummary({
      matchId: 'failed-telemetry-match',
      mapName: 'Baltic_Main',
      gameMode: 'squad',
      telemetryUrl: 'https://telemetry.example/failed-telemetry-match',
      rosterParticipants: [
        {
          name: 'FallbackPlayer',
          pubgId: 'account.fallback',
          stats: makeMatchParticipantStats({ kills: 1 }),
        },
      ],
    });

    const embeds = await service.createEmbeds(summary);

    expect(embeds).toHaveLength(2);
    expect(embeds[1].data.description).toContain('⚔️ Kills: 1');
    expect(embeds[1].data.description).not.toContain('⚔️ **COMBAT STATS**');
    expect(coaching).not.toHaveBeenCalled();
  });

  it('returns a pristine main and basic embeds when enhanced rendering fails late', async () => {
    const deps = createDependencies();
    const service = new MatchPresentationService(deps);
    const player = {
      name: 'PristinePlayer',
      pubgId: 'account.pristine',
      stats: makeMatchParticipantStats({ kills: 1, damageDealt: 175 }),
    };
    const basicSummary = makeMatchSummary({
      matchId: 'pristine-fallback',
      mapName: 'Baltic_Main',
      gameMode: 'squad',
      rosterParticipants: [player],
      lobbyParticipants: [],
    });
    const expected = await service.createEmbeds(basicSummary);
    const matchAnalysis = createMatchAnalysis(
      'pristine-fallback',
      'account.pristine',
      'PristinePlayer'
    );
    const playerAnalysis = matchAnalysis.playerAnalyses.get('account.pristine');
    if (!playerAnalysis) {
      throw new Error('Expected pristine player analysis');
    }
    playerAnalysis.killEvents = JSON.parse(
      JSON.stringify([
        {
          _D: '2026-07-14T08:01:00.000Z',
          _T: 'LogPlayerKillV2',
          killer: { name: 'PristinePlayer', accountId: 'account.pristine' },
          victim: { name: 'Enemy', accountId: 'account.enemy' },
        },
      ])
    );
    jest.spyOn(deps.telemetryRepository, 'getTelemetry').mockResolvedValue({
      kind: 'hit',
      matchAnalysis,
      rawEvents: [],
    });
    jest
      .spyOn(deps.playerStatsService, 'getSeasonStats')
      .mockResolvedValue(new Map([['account.enemy', { kd: 1.5, adr: 225 }]]));
    jest.spyOn(deps.coachingPipeline, 'run').mockResolvedValue({ kind: 'empty' });
    const setDescription = EmbedBuilder.prototype.setDescription;
    jest.spyOn(EmbedBuilder.prototype, 'setDescription').mockImplementation(function (
      this: EmbedBuilder,
      description: string | null
    ) {
      if (description?.includes('**COMBAT STATS**')) {
        throw new Error('late player render failure');
      }
      return setDescription.call(this, description);
    });
    jest.spyOn(logger, 'error').mockImplementation();
    const enhancedSummary = makeMatchSummary({
      matchId: 'pristine-fallback',
      mapName: 'Baltic_Main',
      gameMode: 'squad',
      telemetryUrl: 'https://telemetry.example/pristine-fallback',
      rosterParticipants: [player],
      lobbyParticipants: [],
    });

    const actual = await service.createEmbeds(enhancedSummary);

    expect(actual.map((embed) => embed.toJSON())).toEqual(expected.map((embed) => embed.toJSON()));
    expect(actual[0].data.description).not.toContain('Difficulty:');
  });

  it('keeps match and enhanced player embeds when coaching fails', async () => {
    const deps = createDependencies();
    const matchAnalysis = createMatchAnalysis(
      'coaching-failure',
      'account.coached',
      'CoachedPlayer'
    );
    jest.spyOn(deps.telemetryRepository, 'getTelemetry').mockResolvedValue({
      kind: 'hit',
      matchAnalysis,
      rawEvents: [],
    });
    jest.spyOn(deps.playerStatsService, 'getSeasonStats').mockResolvedValue(new Map());
    jest.spyOn(deps.coachingPipeline, 'run').mockRejectedValue(new Error('narrator unavailable'));
    jest.spyOn(logger, 'error').mockImplementation();
    const service = new MatchPresentationService(deps);
    const summary = makeMatchSummary({
      matchId: 'coaching-failure',
      mapName: 'Baltic_Main',
      gameMode: 'squad',
      telemetryUrl: 'https://telemetry.example/coaching-failure',
      rosterParticipants: [
        {
          name: 'CoachedPlayer',
          pubgId: 'account.coached',
          stats: makeMatchParticipantStats(),
        },
      ],
      lobbyParticipants: [],
    });

    const embeds = await service.createEmbeds(summary);

    expect(embeds.map((embed) => embed.data.title)).toEqual([
      '🎮 PUBG Match Summary',
      'Player: CoachedPlayer',
    ]);
    expect(embeds[1].data.description).toContain('⚔️ **COMBAT STATS**');
  });

  it('preserves Johannesburg time, labels, missing rank, timestamp, and match color', async () => {
    const deps = createDependencies();
    const service = new MatchPresentationService(deps);
    const summary = makeMatchSummary({
      matchId: 'stable-format-match',
      mapName: 'Baltic_Main',
      gameMode: 'squad',
      rosterParticipants: [
        {
          name: 'FormatPlayer',
          pubgId: 'account.format',
          stats: makeMatchParticipantStats(),
        },
      ],
    });

    const [mainEmbed] = await service.createEmbeds(summary);

    expect(mainEmbed.data.description).toContain('⏰ **2026/07/14 10:00**');
    expect(mainEmbed.data.description).toContain('🗺️ **Erangel (Remastered)** • Squad TPP');
    expect(mainEmbed.data.description).toContain('🏆 Placement: **N/A**');
    expect(mainEmbed.data.timestamp).toBe(summary.playedAt.toISOString());
    expect(mainEmbed.data.color).toBe(MatchColorUtil.generateMatchColor('stable-format-match'));
  });

  it('falls back to raw map and mode codes when the asset catalog returns empty labels', async () => {
    const deps = createDependencies();
    jest.spyOn(deps.pubgClient.assets, 'getMapName').mockReturnValue('');
    jest.spyOn(deps.pubgClient.assets, 'getGameModeName').mockReturnValue('');
    const service = new MatchPresentationService(deps);
    const summary = makeMatchSummary({
      matchId: 'empty-catalog-labels',
      mapName: 'Unknown_Main',
      gameMode: 'unknown-mode',
      rosterParticipants: [
        {
          name: 'FormatPlayer',
          pubgId: 'account.format',
          stats: makeMatchParticipantStats(),
        },
      ],
    });

    const [mainEmbed] = await service.createEmbeds(summary);

    expect(mainEmbed.data.description).toContain('🗺️ **Unknown_Main** • unknown-mode');
  });
});
