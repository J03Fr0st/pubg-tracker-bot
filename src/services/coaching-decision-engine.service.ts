import type {
  LogHeal,
  LogItemUse,
  LogPlayerKillV2,
  LogPlayerMakeGroggy,
  LogPlayerTakeDamage,
} from '@j03fr0st/pubg-ts';
import {
  type CoachingScoringWeights,
  DEFAULT_COACHING_SCORING_WEIGHTS,
} from '../config/coaching-weights';
import type { PlayerAnalysis } from '../types/analytics-results.types';
import type {
  CoachingAnalysisInput,
  CoachingClaim,
  CoachingInsight,
  CoachingRating,
} from '../types/coaching.types';
import type { MatchPlayerIdentity } from '../types/match.types';
import { TelemetryGeometry } from '../utils/telemetry-geometry';

const COACHING_THRESHOLDS = {
  contextWindowSeconds: 45,
  heavyDamage: 60,
  minimumResetWindowSeconds: 6,
  patternMinimumCount: 2,
  maximumInsightsPerPlayer: 3,
  tradeRangeMeters: 60,
  meaningfulRepositionMeters: 15,
  heightAdvantageMeters: 10,
  tradeDamageWindowSeconds: 10,
  zonePressureWindowSeconds: 60,
  materialBlueZoneDamage: 25,
  stackedAngleDegrees: 25,
  minimumInsightScore: 0,
  aggressiveRepeekMinimumCount: 2,
  lateRotateMinimumCount: 1,
  isolatedEntryMinimumCount: 2,
  lowConversionMinimumCount: 2,
  highConfidenceProfileCount: 2,
  minimumHeightClaimMeters: 0,
  lowDamageConversionRatio: 0.5,
} as const;

type Position = { x: number; y: number; z?: number };
type DecisiveEvent = LogPlayerKillV2 | LogPlayerMakeGroggy;
type ActorWithPosition = { name?: string; accountId?: string; location?: Position };
type FightOutcome = 'knock' | 'death';
type FightDamageEvent = {
  timestamp: Date;
  matchTimeSeconds: number;
  attackerPubgId?: string;
  attackerName?: string;
  victimPubgId?: string;
  victimName?: string;
  damage: number;
  position?: Position;
};
type FightResetEvent = {
  timestamp: Date;
  matchTimeSeconds: number;
  itemId?: string;
  healAmount?: number;
};
type FightContext = {
  playerPubgId: string;
  playerName: string;
  enemyName?: string;
  outcome: FightOutcome;
  timestamp: Date;
  matchTimeSeconds: number;
  damageTaken: FightDamageEvent[];
  damageDealt: FightDamageEvent[];
  resetEvents: FightResetEvent[];
  blueZoneDamage: { damage: number; events: FightDamageEvent[]; windowSeconds: number };
  playerPosition?: Position;
  enemyPosition?: Position;
  closestTeammateName?: string;
  closestTeammatePosition?: Position;
  closestTeammateDistanceMeters?: number;
  teammateAngleFromPlayerToEnemyDegrees?: number;
  closestTeammateDamageToEnemy: FightDamageEvent[];
  enemyDistanceMeters?: number;
  tradeRangeConfidence: CoachingRating;
  repositionDistanceMeters?: number;
  heightDeltaMeters?: number;
  heightConfidence: CoachingRating;
  repeatedSameEnemy: boolean;
};

export class CoachingDecisionEngineService {
  public constructor(
    private readonly weights: CoachingScoringWeights = DEFAULT_COACHING_SCORING_WEIGHTS
  ) {}

  public createInsights(input: CoachingAnalysisInput): CoachingInsight[] {
    const contexts = this.buildFightContexts(input);
    return [...this.groupContextsByPlayer(contexts).values()].flatMap((playerContexts) => {
      const insights = [
        this.createDecisiveInsight(playerContexts),
        this.createPatternInsight(playerContexts),
        this.createFingerprintInsight(playerContexts),
      ];
      return insights
        .filter((insight): insight is CoachingInsight => Boolean(insight))
        .slice(0, COACHING_THRESHOLDS.maximumInsightsPerPlayer);
    });
  }

  private buildFightContexts(input: CoachingAnalysisInput): FightContext[] {
    const damageEvents = input.telemetryEvents.filter(
      (event): event is LogPlayerTakeDamage => event._T === 'LogPlayerTakeDamage'
    );
    const resetEvents = input.telemetryEvents.filter(
      (event): event is LogHeal | LogItemUse => event._T === 'LogHeal' || event._T === 'LogItemUse'
    );
    const contexts: FightContext[] = [];
    for (const player of input.monitoredPlayers) {
      const analysis = input.matchAnalysis.playerAnalyses.get(player.pubgId);
      if (!analysis) continue;
      for (const decisiveEvent of this.getDecisiveEvents(analysis)) {
        const context = this.buildContextForEvent(
          player,
          analysis,
          decisiveEvent,
          input.monitoredPlayers,
          input.matchAnalysis.playerAnalyses,
          damageEvents,
          resetEvents
        );
        if (context) contexts.push(context);
      }
    }
    return contexts.sort((left, right) => right.matchTimeSeconds - left.matchTimeSeconds);
  }

  private buildContextForEvent(
    player: MatchPlayerIdentity,
    analysis: PlayerAnalysis,
    decisiveEvent: DecisiveEvent,
    monitoredPlayers: readonly MatchPlayerIdentity[],
    analyses: ReadonlyMap<string, PlayerAnalysis>,
    damageEvents: LogPlayerTakeDamage[],
    resetEvents: Array<LogHeal | LogItemUse>
  ): FightContext | null {
    const timestamp = this.getEventTime(decisiveEvent);
    if (!timestamp) return null;
    const enemyName = this.getEnemyName(decisiveEvent);
    const enemyPubgId = this.getEnemyPubgId(decisiveEvent);
    const damageTaken = this.getDamageTaken(
      player.pubgId,
      timestamp,
      damageEvents,
      analysis.matchStartTime
    );
    const damageDealt = this.getDamageDealt(
      player.pubgId,
      timestamp,
      damageEvents,
      analysis.matchStartTime
    );
    const playerPosition = this.getActorPosition(decisiveEvent.victim);
    const enemyPosition = this.getEnemyPosition(decisiveEvent);
    const teammate = this.getClosestTeammate(
      player,
      playerPosition,
      monitoredPlayers,
      analyses,
      timestamp,
      damageEvents
    );
    return {
      playerPubgId: player.pubgId,
      playerName: analysis.playerName,
      enemyName,
      outcome: decisiveEvent._T === 'LogPlayerMakeGroggy' ? 'knock' : 'death',
      timestamp,
      matchTimeSeconds: TelemetryGeometry.secondsBetween(analysis.matchStartTime, timestamp),
      damageTaken,
      damageDealt,
      resetEvents: this.getResetEvents(
        player.pubgId,
        timestamp,
        resetEvents,
        analysis.matchStartTime
      ),
      blueZoneDamage: this.getBlueZoneDamage(
        player.pubgId,
        timestamp,
        damageEvents,
        analysis.matchStartTime
      ),
      playerPosition,
      enemyPosition,
      closestTeammateName: teammate?.player.name,
      closestTeammatePosition: teammate?.position,
      closestTeammateDistanceMeters: teammate?.distanceMeters,
      teammateAngleFromPlayerToEnemyDegrees:
        playerPosition && enemyPosition && teammate?.position
          ? TelemetryGeometry.angleDegrees(playerPosition, enemyPosition, teammate.position)
          : undefined,
      closestTeammateDamageToEnemy: this.getDamageFromPlayerToEnemy(
        teammate?.player.pubgId,
        enemyPubgId,
        timestamp,
        damageEvents,
        analysis.matchStartTime
      ),
      enemyDistanceMeters:
        playerPosition && enemyPosition
          ? TelemetryGeometry.distanceMeters(playerPosition, enemyPosition)
          : undefined,
      tradeRangeConfidence: teammate?.confidence ?? 'low',
      repositionDistanceMeters: this.getRepositionDistanceMeters(damageTaken, playerPosition),
      heightDeltaMeters:
        playerPosition && enemyPosition
          ? TelemetryGeometry.heightDeltaMeters(playerPosition, enemyPosition)
          : undefined,
      heightConfidence:
        playerPosition &&
        enemyPosition &&
        (TelemetryGeometry.heightDeltaMeters(playerPosition, enemyPosition) ?? 0) >=
          COACHING_THRESHOLDS.heightAdvantageMeters
          ? 'medium'
          : 'low',
      repeatedSameEnemy:
        Boolean(enemyPubgId) && damageTaken.some((event) => event.attackerPubgId === enemyPubgId),
    };
  }

  private getDecisiveEvents(analysis: PlayerAnalysis): DecisiveEvent[] {
    return [...analysis.deathEvents, ...analysis.knockedDownEvents].sort(
      (left, right) =>
        (this.getEventTime(right)?.getTime() ?? 0) - (this.getEventTime(left)?.getTime() ?? 0)
    );
  }

  private getDamageTaken(
    playerPubgId: string,
    decisiveTime: Date,
    events: LogPlayerTakeDamage[],
    matchStartTime: Date
  ): FightDamageEvent[] {
    return this.getDamageEvents(events, decisiveTime, matchStartTime).filter(
      (event) => event.victimPubgId === playerPubgId
    );
  }

  private getDamageDealt(
    playerPubgId: string,
    decisiveTime: Date,
    events: LogPlayerTakeDamage[],
    matchStartTime: Date
  ): FightDamageEvent[] {
    return this.getDamageEvents(events, decisiveTime, matchStartTime).filter(
      (event) => event.attackerPubgId === playerPubgId
    );
  }

  private getDamageEvents(
    events: LogPlayerTakeDamage[],
    decisiveTime: Date,
    matchStartTime: Date
  ): FightDamageEvent[] {
    return events
      .map((event) => this.toFightDamageEvent(event, matchStartTime))
      .filter((event): event is FightDamageEvent => Boolean(event))
      .filter((event) => {
        const seconds = TelemetryGeometry.signedSecondsBetween(event.timestamp, decisiveTime);
        return seconds >= 0 && seconds <= COACHING_THRESHOLDS.contextWindowSeconds;
      });
  }

  private toFightDamageEvent(
    event: LogPlayerTakeDamage,
    matchStartTime: Date
  ): FightDamageEvent | null {
    const timestamp = this.getEventTime(event);
    if (!timestamp) return null;
    return {
      timestamp,
      matchTimeSeconds: TelemetryGeometry.secondsBetween(matchStartTime, timestamp),
      attackerPubgId: event.attacker?.accountId,
      attackerName: event.attacker?.name,
      victimPubgId: event.victim?.accountId,
      victimName: event.victim?.name,
      damage: Math.round(event.damage),
      position: this.getActorPosition(event.victim),
    };
  }

  private getResetEvents(
    playerPubgId: string,
    decisiveTime: Date,
    events: Array<LogHeal | LogItemUse>,
    matchStartTime: Date
  ): FightResetEvent[] {
    return events
      .filter((event) => event.character?.accountId === playerPubgId)
      .map((event): FightResetEvent | null => {
        const timestamp = this.getEventTime(event);
        if (!timestamp) return null;
        return {
          timestamp,
          matchTimeSeconds: TelemetryGeometry.secondsBetween(matchStartTime, timestamp),
          itemId: event.item?.itemId,
          healAmount: event._T === 'LogHeal' ? event.healAmount : undefined,
        };
      })
      .filter((event): event is FightResetEvent => Boolean(event))
      .filter((event) => {
        const seconds = TelemetryGeometry.signedSecondsBetween(event.timestamp, decisiveTime);
        return seconds >= 0 && seconds <= COACHING_THRESHOLDS.contextWindowSeconds;
      })
      .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
  }

  private getBlueZoneDamage(
    playerPubgId: string,
    decisiveTime: Date,
    events: LogPlayerTakeDamage[],
    matchStartTime: Date
  ): FightContext['blueZoneDamage'] {
    const zoneEvents = events
      .filter(
        (event) =>
          event.victim?.accountId === playerPubgId && event.damageTypeCategory === 'Damage_BlueZone'
      )
      .map((event) => this.toFightDamageEvent(event, matchStartTime))
      .filter((event): event is FightDamageEvent => Boolean(event))
      .filter((event) => {
        const seconds = TelemetryGeometry.signedSecondsBetween(event.timestamp, decisiveTime);
        return seconds >= 0 && seconds <= COACHING_THRESHOLDS.zonePressureWindowSeconds;
      });
    return {
      damage: zoneEvents.reduce((sum, event) => sum + event.damage, 0),
      events: zoneEvents,
      windowSeconds: COACHING_THRESHOLDS.zonePressureWindowSeconds,
    };
  }

  private getClosestTeammate(
    player: MatchPlayerIdentity,
    playerPosition: Position | undefined,
    monitoredPlayers: readonly MatchPlayerIdentity[],
    analyses: ReadonlyMap<string, PlayerAnalysis>,
    decisiveTime: Date,
    damageEvents: LogPlayerTakeDamage[]
  ):
    | {
        player: MatchPlayerIdentity;
        distanceMeters: number;
        position: Position;
        confidence: 'high' | 'medium';
      }
    | undefined {
    if (!playerPosition || player.rosterId === null) return undefined;
    return monitoredPlayers
      .filter(
        (candidate) =>
          candidate.pubgId !== player.pubgId &&
          candidate.rosterId !== null &&
          candidate.rosterId === player.rosterId
      )
      .map((candidate) => {
        const analysis = analyses.get(candidate.pubgId);
        const latestDamagePosition = this.getLatestActorPosition(
          candidate.pubgId,
          decisiveTime,
          damageEvents
        );
        const position =
          latestDamagePosition ??
          (analysis ? this.getLastKnownPlayerPosition(analysis, decisiveTime) : undefined);
        return position
          ? {
              player: candidate,
              distanceMeters: TelemetryGeometry.distanceMeters(playerPosition, position),
              position,
              confidence: latestDamagePosition ? ('high' as const) : ('medium' as const),
            }
          : undefined;
      })
      .filter(
        (
          candidate
        ): candidate is {
          player: MatchPlayerIdentity;
          distanceMeters: number;
          position: Position;
          confidence: 'high' | 'medium';
        } => Boolean(candidate)
      )
      .sort((left, right) => left.distanceMeters - right.distanceMeters)[0];
  }

  private getLatestActorPosition(
    actorPubgId: string,
    decisiveTime: Date,
    events: LogPlayerTakeDamage[]
  ): Position | undefined {
    return events
      .map((event) => {
        const timestamp = this.getEventTime(event);
        const attackerPosition =
          event.attacker?.accountId === actorPubgId
            ? this.getActorPosition(event.attacker)
            : undefined;
        const victimPosition =
          event.victim?.accountId === actorPubgId ? this.getActorPosition(event.victim) : undefined;
        const position = attackerPosition ?? victimPosition;
        return timestamp && position ? { timestamp, position } : undefined;
      })
      .filter((entry): entry is { timestamp: Date; position: Position } => Boolean(entry))
      .filter((entry) => {
        const seconds = TelemetryGeometry.signedSecondsBetween(entry.timestamp, decisiveTime);
        return seconds >= 0 && seconds <= COACHING_THRESHOLDS.contextWindowSeconds;
      })
      .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())[0]?.position;
  }

  private getDamageFromPlayerToEnemy(
    playerPubgId: string | undefined,
    enemyPubgId: string | undefined,
    decisiveTime: Date,
    events: LogPlayerTakeDamage[],
    matchStartTime: Date
  ): FightDamageEvent[] {
    if (!playerPubgId || !enemyPubgId) return [];
    return events
      .filter(
        (event) =>
          event.attacker?.accountId === playerPubgId && event.victim?.accountId === enemyPubgId
      )
      .map((event) => this.toFightDamageEvent(event, matchStartTime))
      .filter((event): event is FightDamageEvent => Boolean(event))
      .filter((event) => {
        const seconds = TelemetryGeometry.signedSecondsBetween(event.timestamp, decisiveTime);
        return seconds >= 0 && seconds <= COACHING_THRESHOLDS.tradeDamageWindowSeconds;
      });
  }

  private getLastKnownPlayerPosition(
    analysis: PlayerAnalysis,
    decisiveTime: Date
  ): Position | undefined {
    const event = this.getDecisiveEvents(analysis)
      .map((decisiveEvent) => ({ decisiveEvent, timestamp: this.getEventTime(decisiveEvent) }))
      .filter(
        (entry): entry is { decisiveEvent: DecisiveEvent; timestamp: Date } =>
          entry.timestamp !== null && entry.timestamp.getTime() <= decisiveTime.getTime()
      )
      .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())[0]
      ?.decisiveEvent;
    return event ? this.getActorPosition(event.victim) : undefined;
  }

  private getRepositionDistanceMeters(
    damageTaken: FightDamageEvent[],
    playerPosition: Position | undefined
  ): number | undefined {
    const firstDamagePosition = damageTaken[0]?.position;
    return firstDamagePosition && playerPosition
      ? TelemetryGeometry.distanceMeters(firstDamagePosition, playerPosition)
      : undefined;
  }

  private getEnemyName(event: DecisiveEvent): string | undefined {
    return event._T === 'LogPlayerMakeGroggy' ? event.attacker?.name : event.killer?.name;
  }

  private getEnemyPubgId(event: DecisiveEvent): string | undefined {
    return event._T === 'LogPlayerMakeGroggy' ? event.attacker?.accountId : event.killer?.accountId;
  }

  private getEnemyPosition(event: DecisiveEvent): Position | undefined {
    return this.getActorPosition(
      event._T === 'LogPlayerMakeGroggy' ? event.attacker : event.killer
    );
  }

  private getActorPosition(actor?: ActorWithPosition): Position | undefined {
    const location = actor?.location;
    if (!location || typeof location.x !== 'number' || typeof location.y !== 'number')
      return undefined;
    return { x: location.x, y: location.y, z: location.z };
  }

  private getEventTime(event: { _D?: string }): Date | null {
    if (!event._D) return null;
    const parsed = new Date(event._D);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private groupContextsByPlayer(contexts: FightContext[]): Map<string, FightContext[]> {
    const grouped = new Map<string, FightContext[]>();
    for (const context of contexts) {
      const playerContexts = grouped.get(context.playerPubgId) ?? [];
      playerContexts.push(context);
      grouped.set(context.playerPubgId, playerContexts);
    }
    return grouped;
  }

  private getHeavyDamage(context: FightContext): FightDamageEvent | undefined {
    return context.damageTaken.find((event) => event.damage >= COACHING_THRESHOLDS.heavyDamage);
  }

  private getResetWindowSeconds(context: FightContext): number | undefined {
    const heavyDamage = this.getHeavyDamage(context);
    return heavyDamage ? context.matchTimeSeconds - heavyDamage.matchTimeSeconds : undefined;
  }

  private hasResetAfterHeavyDamage(context: FightContext): boolean {
    const heavyDamage = this.getHeavyDamage(context);
    if (!heavyDamage) return false;
    return context.resetEvents.some(
      (event) =>
        event.timestamp.getTime() > heavyDamage.timestamp.getTime() &&
        event.timestamp.getTime() <= context.timestamp.getTime()
    );
  }

  private isBadReset(context: FightContext): boolean {
    const resetWindow = this.getResetWindowSeconds(context);
    return Boolean(
      this.getHeavyDamage(context) &&
        resetWindow !== undefined &&
        resetWindow >= COACHING_THRESHOLDS.minimumResetWindowSeconds &&
        context.repeatedSameEnemy &&
        !this.hasResetAfterHeavyDamage(context) &&
        (context.repositionDistanceMeters === undefined ||
          context.repositionDistanceMeters < COACHING_THRESHOLDS.meaningfulRepositionMeters)
    );
  }

  private createDecisiveInsight(contexts: FightContext[]): CoachingInsight | null {
    const selected = contexts
      .map((context) => ({ context, score: this.scoreContext(context) }))
      .filter((entry) => entry.score > COACHING_THRESHOLDS.minimumInsightScore)
      .sort((left, right) => right.score - left.score)[0]?.context;
    if (!selected) return null;
    const claims = this.buildClaims(selected);
    if (claims.length === 0) return null;
    const hasZonePressure = this.hasMaterialZonePressure(selected);
    return {
      playerName: selected.playerName,
      category: 'decisive-mistake',
      kind: 'decisive-mistake',
      title: 'Decisive mistake',
      timestamp: selected.timestamp,
      matchTimeSeconds: selected.matchTimeSeconds,
      severity: 'high',
      confidence: this.lowestClaimConfidence(claims),
      evidence: claims.map((claim) => claim.text),
      recommendation: hasZonePressure
        ? 'Rotate earlier, break line of sight, heal, then re-engage from a new angle or with teammate pressure.'
        : 'Break line of sight, heal, then re-engage from a new angle or with teammate pressure.',
      betterPlay: [
        ...(hasZonePressure ? ['rotate earlier before taking optional fights'] : []),
        'break line of sight',
        'heal before re-engaging',
        'wait for teammate trade pressure or force a new angle',
      ],
      claims,
    };
  }

  private createPatternInsight(contexts: FightContext[]): CoachingInsight | null {
    const badResetContexts = contexts.filter((context) => this.isBadReset(context));
    if (badResetContexts.length < COACHING_THRESHOLDS.patternMinimumCount) return null;
    const latest = [...badResetContexts].sort(
      (left, right) => right.matchTimeSeconds - left.matchTimeSeconds
    )[0];
    const text = `Repeated ${badResetContexts.length} fights where heavy damage was followed by no reset.`;
    return {
      playerName: latest.playerName,
      category: 'pattern',
      kind: 'pattern',
      title: 'Pattern to fix',
      timestamp: latest.timestamp,
      matchTimeSeconds: latest.matchTimeSeconds,
      severity: 'medium',
      confidence: 'high',
      evidence: [text],
      recommendation:
        'Stop giving the same enemy a second clean fight after you are already damaged.',
      betterPlay: [
        'break line of sight',
        'heal before re-engaging',
        'wait for teammate trade pressure or force a new angle',
      ],
      claims: [
        {
          text,
          confidence: 'high',
          evidence: badResetContexts.map(
            (context) => `${context.playerName} at ${context.matchTimeSeconds}s`
          ),
        },
      ],
    };
  }

  private createFingerprintInsight(contexts: FightContext[]): CoachingInsight | null {
    if (contexts.length === 0) return null;
    const profiles = [
      {
        name: 'Aggressive re-peeker',
        count: contexts.filter((context) => this.isBadReset(context)).length,
        minimumCount: COACHING_THRESHOLDS.aggressiveRepeekMinimumCount,
        recommendation:
          'Treat first damage as a reset trigger: break line of sight, heal, then force a new angle.',
        betterPlay: ['break line of sight', 'heal before re-engaging', 'force a new angle'],
      },
      {
        name: 'Late-rotate fighter',
        count: contexts.filter((context) => this.hasMaterialZonePressure(context)).length,
        minimumCount: COACHING_THRESHOLDS.lateRotateMinimumCount,
        recommendation:
          'Choose the next position earlier and move before blue-zone damage turns the fight into a forced duel.',
        betterPlay: [
          'rotate earlier before taking optional fights',
          'move before blue-zone damage',
        ],
      },
      {
        name: 'Isolated entry',
        count: contexts.filter((context) => this.hasIsolatedTrade(context)).length,
        minimumCount: COACHING_THRESHOLDS.isolatedEntryMinimumCount,
        recommendation:
          'Start fights where the nearest teammate can trade damage, not merely stand nearby.',
        betterPlay: ['wait for teammate trade pressure', 'force a crossfire angle'],
      },
      {
        name: 'Low-conversion trader',
        count: contexts.filter((context) => this.hasLowDamageConversion(context)).length,
        minimumCount: COACHING_THRESHOLDS.lowConversionMinimumCount,
        recommendation:
          'Do not extend damage-negative trades; reset or reposition when return damage is not landing.',
        betterPlay: ['stop damage-negative trades', 'reposition before re-engaging'],
      },
    ]
      .filter((profile) => profile.count >= profile.minimumCount)
      .sort((left, right) => right.count - left.count);
    const profile = profiles[0];
    if (!profile) return null;
    const latest = [...contexts].sort(
      (left, right) => right.matchTimeSeconds - left.matchTimeSeconds
    )[0];
    const text = `${profile.name}: ${profile.count} of ${contexts.length} reviewed fights matched this telemetry pattern.`;
    return {
      playerName: latest.playerName,
      category: 'player-fingerprint',
      kind: 'player-fingerprint',
      title: 'Player fingerprint',
      timestamp: latest.timestamp,
      matchTimeSeconds: latest.matchTimeSeconds,
      severity: 'medium',
      confidence:
        profile.count >= COACHING_THRESHOLDS.highConfidenceProfileCount ? 'high' : 'medium',
      evidence: [text],
      recommendation: profile.recommendation,
      betterPlay: profile.betterPlay,
      claims: [
        {
          text,
          confidence:
            profile.count >= COACHING_THRESHOLDS.highConfidenceProfileCount ? 'high' : 'medium',
          evidence: contexts
            .filter((context) => this.contextMatchesProfile(context, profile.name))
            .map((context) => `${context.playerName} at ${context.matchTimeSeconds}s`),
        },
      ],
    };
  }

  private buildClaims(context: FightContext): CoachingClaim[] {
    const claims: CoachingClaim[] = [];
    const heavyDamage = this.getHeavyDamage(context);
    const seconds = this.getResetWindowSeconds(context);
    if (
      this.isBadReset(context) &&
      heavyDamage &&
      context.enemyName &&
      seconds !== undefined
    ) {
      claims.push({
        text: `${context.enemyName} hit you for ${heavyDamage.damage} damage, then ${seconds}s later you ${context.outcome === 'death' ? 'died' : 'got knocked'} to the same player before creating a reset.`,
        confidence: 'high',
        evidence: [
          `Took ${heavyDamage.damage} damage from ${context.enemyName}`,
          `${context.outcome === 'death' ? 'Died' : 'Got knocked'} ${seconds}s later`,
        ],
      });
    }
    if (
      context.tradeRangeConfidence !== 'low' &&
      context.closestTeammateName &&
      context.closestTeammateDistanceMeters !== undefined &&
      context.closestTeammateDistanceMeters > COACHING_THRESHOLDS.tradeRangeMeters
    ) {
      claims.push({
        text: `Your nearest tracked teammate appears to have been too far to trade at ${Math.round(context.closestTeammateDistanceMeters)}m away.`,
        confidence: context.tradeRangeConfidence,
        evidence: [`Closest tracked teammate: ${context.closestTeammateName}`],
      });
    }
    if (
      context.tradeRangeConfidence !== 'low' &&
      context.closestTeammateName &&
      context.closestTeammateDistanceMeters !== undefined &&
      context.closestTeammateDistanceMeters <= COACHING_THRESHOLDS.tradeRangeMeters &&
      context.enemyName &&
      context.closestTeammateDamageToEnemy.length === 0
    ) {
      claims.push({
        text: `${context.closestTeammateName} was ${Math.round(context.closestTeammateDistanceMeters)}m from you, but telemetry shows no damage from them to ${context.enemyName} in the ${COACHING_THRESHOLDS.tradeDamageWindowSeconds}s before you went down.`,
        confidence: context.tradeRangeConfidence,
        evidence: [
          `Closest tracked teammate: ${context.closestTeammateName}`,
          `Enemy distance: ${context.enemyDistanceMeters ? `${Math.round(context.enemyDistanceMeters)}m` : 'unknown'}`,
        ],
      });
    }
    if (
      context.tradeRangeConfidence !== 'low' &&
      context.closestTeammateName &&
      context.enemyName &&
      context.teammateAngleFromPlayerToEnemyDegrees !== undefined &&
      context.teammateAngleFromPlayerToEnemyDegrees <= COACHING_THRESHOLDS.stackedAngleDegrees
    ) {
      claims.push({
        text: `${context.closestTeammateName} was only ${context.teammateAngleFromPlayerToEnemyDegrees} degrees off your logged line to ${context.enemyName}; the positions were close together, not a separate angle.`,
        confidence: context.tradeRangeConfidence,
        evidence: [
          `Teammate angle from player-to-enemy line: ${context.teammateAngleFromPlayerToEnemyDegrees} degrees`,
        ],
      });
    }
    if (
      context.heightConfidence !== 'low' &&
      context.heightDeltaMeters !== undefined &&
      context.heightDeltaMeters > COACHING_THRESHOLDS.minimumHeightClaimMeters
    ) {
      claims.push({
        text: `${context.enemyName ?? 'The enemy'} appears to have had a ${Math.round(context.heightDeltaMeters)}m height advantage.`,
        confidence: context.heightConfidence,
        evidence: ['Enemy z-position was higher than player z-position'],
      });
    }
    const zonePressureClaim = this.buildZonePressureClaim(context);
    if (zonePressureClaim) claims.push(zonePressureClaim);
    return claims;
  }

  private buildZonePressureClaim(context: FightContext): CoachingClaim | null {
    if (!this.hasMaterialZonePressure(context)) return null;
    const damage = Math.round(context.blueZoneDamage.damage);
    return {
      text: `You took ${damage} blue-zone damage in the ${context.blueZoneDamage.windowSeconds}s before this fight, so the rotate was already costing health before the duel.`,
      confidence: 'high',
      evidence: [`Blue-zone damage before decisive event: ${damage}`],
    };
  }

  private scoreContext(context: FightContext): number {
    let score = context.outcome === 'death' ? this.weights.deathOutcome : this.weights.knockOutcome;
    if (this.isBadReset(context)) score += this.weights.badReset;
    if (context.tradeRangeConfidence !== 'low') score += this.weights.tradeRangeKnown;
    if (context.closestTeammateDamageToEnemy.length === 0) score += this.weights.noTeammateDamage;
    if (context.heightConfidence !== 'low') score += this.weights.heightKnown;
    return score;
  }

  private hasIsolatedTrade(context: FightContext): boolean {
    return (
      context.tradeRangeConfidence !== 'low' &&
      context.closestTeammateName !== undefined &&
      context.closestTeammateDamageToEnemy.length === 0
    );
  }

  private hasLowDamageConversion(context: FightContext): boolean {
    const damageTaken = context.damageTaken.reduce((sum, event) => sum + event.damage, 0);
    const damageDealt = context.damageDealt.reduce((sum, event) => sum + event.damage, 0);
    return (
      damageTaken >= COACHING_THRESHOLDS.heavyDamage &&
      damageDealt < damageTaken * COACHING_THRESHOLDS.lowDamageConversionRatio
    );
  }

  private contextMatchesProfile(context: FightContext, profileName: string): boolean {
    if (profileName === 'Aggressive re-peeker') return this.isBadReset(context);
    if (profileName === 'Late-rotate fighter') return this.hasMaterialZonePressure(context);
    if (profileName === 'Isolated entry') return this.hasIsolatedTrade(context);
    if (profileName === 'Low-conversion trader') return this.hasLowDamageConversion(context);
    return false;
  }

  private hasMaterialZonePressure(context: FightContext): boolean {
    return context.blueZoneDamage.damage >= COACHING_THRESHOLDS.materialBlueZoneDamage;
  }

  private lowestClaimConfidence(claims: CoachingClaim[]): CoachingRating {
    if (claims.some((claim) => claim.confidence === 'low')) return 'low';
    if (claims.some((claim) => claim.confidence === 'medium')) return 'medium';
    return 'high';
  }
}
