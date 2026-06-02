import {
  DamageInfoUtils,
  type LogHeal,
  type LogItemUse,
  type LogPlayerKillV2,
  type LogPlayerMakeGroggy,
  type LogPlayerTakeDamage,
} from '@j03fr0st/pubg-ts';
import type { MatchAnalysis, PlayerTelemetry } from '../types/analytics-results.types';
import type {
  FightContext,
  FightDamageEvent,
  FightOutcome,
  FightResetEvent,
  TelemetryPosition,
  ZonePressureEvidence,
} from '../types/coaching.types';
import { TelemetryGeometry } from '../utils/telemetry-geometry';

const CONTEXT_WINDOW_SECONDS = 45;
const TRADE_RANGE_METERS = 60;
const MEANINGFUL_REPOSITION_METERS = 15;
const HEIGHT_ADVANTAGE_METERS = 10;
const TRADE_DAMAGE_WINDOW_SECONDS = 10;
const ZONE_PRESSURE_WINDOW_SECONDS = 60;

type DecisiveEvent = LogPlayerKillV2 | LogPlayerMakeGroggy;
type ActorWithPosition = { name?: string; location?: TelemetryPosition };

export class FightContextBuilderService {
  public buildFightContexts(
    matchAnalysis: MatchAnalysis,
    trackedPlayerNames: string[],
    damageEvents: LogPlayerTakeDamage[] = [],
    resetEvents: Array<LogHeal | LogItemUse> = []
  ): FightContext[] {
    const contexts: FightContext[] = [];

    for (const playerName of trackedPlayerNames) {
      const analysis = matchAnalysis.playerAnalyses.get(playerName);
      if (!analysis) {
        continue;
      }

      for (const decisiveEvent of this.getDecisiveEvents(analysis)) {
        const context = this.buildContextForEvent(
          analysis,
          decisiveEvent,
          matchAnalysis,
          trackedPlayerNames,
          damageEvents,
          resetEvents
        );
        if (context) {
          contexts.push(context);
        }
      }
    }

    return contexts.sort((left, right) => right.matchTimeSeconds - left.matchTimeSeconds);
  }

  private buildContextForEvent(
    analysis: PlayerTelemetry,
    decisiveEvent: DecisiveEvent,
    matchAnalysis: MatchAnalysis,
    trackedPlayerNames: string[],
    damageEvents: LogPlayerTakeDamage[],
    resetEvents: Array<LogHeal | LogItemUse>
  ): FightContext | null {
    const timestamp = this.getEventTime(decisiveEvent);
    if (!timestamp) {
      return null;
    }

    const enemyName = this.getEnemyName(decisiveEvent);
    const outcome: FightOutcome = decisiveEvent._T === 'LogPlayerMakeGroggy' ? 'knock' : 'death';
    const matchTimeSeconds = TelemetryGeometry.secondsBetween(analysis.matchStartTime, timestamp);
    const damageTaken = this.getDamageTaken(
      analysis.playerName,
      timestamp,
      damageEvents,
      analysis.matchStartTime
    );
    const damageDealt = this.getDamageDealt(
      analysis.playerName,
      timestamp,
      damageEvents,
      analysis.matchStartTime
    );
    const recentResetEvents = this.getResetEvents(
      analysis.playerName,
      timestamp,
      resetEvents,
      analysis.matchStartTime
    );
    const blueZoneDamage = this.getBlueZoneDamage(
      analysis.playerName,
      timestamp,
      damageEvents,
      analysis.matchStartTime
    );
    const playerPosition = this.getVictimPosition(decisiveEvent);
    const enemyPosition = this.getEnemyPosition(decisiveEvent);
    const closestTeammate = this.getClosestTeammate(
      analysis.playerName,
      playerPosition,
      matchAnalysis,
      trackedPlayerNames,
      timestamp,
      damageEvents
    );
    const enemyDistanceMeters =
      playerPosition && enemyPosition
        ? TelemetryGeometry.distanceMeters(playerPosition, enemyPosition)
        : undefined;
    const closestTeammateToEnemyDistanceMeters =
      closestTeammate?.position && enemyPosition
        ? TelemetryGeometry.distanceMeters(closestTeammate.position, enemyPosition)
        : undefined;
    const teammateAngleFromPlayerToEnemyDegrees =
      playerPosition && enemyPosition && closestTeammate?.position
        ? TelemetryGeometry.angleDegrees(playerPosition, enemyPosition, closestTeammate.position)
        : undefined;
    const closestTeammateDamageToEnemy = this.getDamageFromPlayerToEnemy(
      closestTeammate?.name,
      enemyName,
      timestamp,
      damageEvents,
      analysis.matchStartTime
    );
    const repositionDistanceMeters = this.getRepositionDistanceMeters(damageTaken, playerPosition);
    const heightDeltaMeters =
      playerPosition && enemyPosition
        ? TelemetryGeometry.heightDeltaMeters(playerPosition, enemyPosition)
        : undefined;
    const repeatedSameEnemy =
      Boolean(enemyName) && damageTaken.some((event) => event.attackerName === enemyName);

    return {
      playerName: analysis.playerName,
      enemyName,
      outcome,
      timestamp,
      matchTimeSeconds,
      decisiveWeapon: this.getDecisiveWeapon(decisiveEvent),
      decisiveDamageTypeCategory: this.getDecisiveDamageTypeCategory(decisiveEvent),
      decisiveDamageReason: this.getDecisiveDamageReason(decisiveEvent),
      killerName:
        decisiveEvent._T === 'LogPlayerKillV2'
          ? this.getActorName(decisiveEvent.killer)
          : undefined,
      finisherName:
        decisiveEvent._T === 'LogPlayerKillV2'
          ? this.getActorName(decisiveEvent.finisher)
          : undefined,
      damageTaken,
      damageDealt,
      resetEvents: recentResetEvents,
      blueZoneDamage,
      playerPosition,
      enemyPosition,
      closestTeammateName: closestTeammate?.name,
      closestTeammatePosition: closestTeammate?.position,
      closestTeammateDistanceMeters: closestTeammate?.distanceMeters,
      closestTeammateToEnemyDistanceMeters,
      teammateAngleFromPlayerToEnemyDegrees,
      closestTeammateDamageToEnemy,
      enemyDistanceMeters,
      tradeRangeConfidence: closestTeammate ? closestTeammate.confidence : 'low',
      repositionDistanceMeters,
      repositionConfidence: repositionDistanceMeters === undefined ? 'low' : 'high',
      heightDeltaMeters,
      heightConfidence:
        heightDeltaMeters !== undefined && heightDeltaMeters >= HEIGHT_ADVANTAGE_METERS
          ? 'medium'
          : 'low',
      repeatedSameEnemy,
      claims: [],
    };
  }

  private getDecisiveEvents(analysis: PlayerTelemetry): DecisiveEvent[] {
    return [...analysis.deathEvents, ...analysis.knockedDownEvents].sort((left, right) => {
      const leftTime = this.getEventTime(left)?.getTime() ?? 0;
      const rightTime = this.getEventTime(right)?.getTime() ?? 0;
      return rightTime - leftTime;
    });
  }

  private getDamageTaken(
    playerName: string,
    decisiveTime: Date,
    damageEvents: LogPlayerTakeDamage[],
    matchStartTime: Date
  ): FightDamageEvent[] {
    return damageEvents
      .filter((event) => this.getActorName(event.victim) === playerName)
      .map((event) => this.toFightDamageEvent(event, matchStartTime))
      .filter((event): event is FightDamageEvent => Boolean(event))
      .filter((event) => {
        const seconds = TelemetryGeometry.signedSecondsBetween(event.timestamp, decisiveTime);
        return seconds >= 0 && seconds <= CONTEXT_WINDOW_SECONDS;
      });
  }

  private getDamageDealt(
    playerName: string,
    decisiveTime: Date,
    damageEvents: LogPlayerTakeDamage[],
    matchStartTime: Date
  ): FightDamageEvent[] {
    return damageEvents
      .filter((event) => this.getActorName(event.attacker) === playerName)
      .map((event) => this.toFightDamageEvent(event, matchStartTime))
      .filter((event): event is FightDamageEvent => Boolean(event))
      .filter((event) => {
        const seconds = TelemetryGeometry.signedSecondsBetween(event.timestamp, decisiveTime);
        return seconds >= 0 && seconds <= CONTEXT_WINDOW_SECONDS;
      });
  }

  private toFightDamageEvent(
    event: LogPlayerTakeDamage,
    matchStartTime: Date
  ): FightDamageEvent | null {
    const timestamp = this.getEventTime(event);
    if (!timestamp) {
      return null;
    }

    return {
      timestamp,
      matchTimeSeconds: TelemetryGeometry.secondsBetween(matchStartTime, timestamp),
      attackerName: this.getActorName(event.attacker),
      victimName: this.getActorName(event.victim),
      damage: Math.round(event.damage),
      position: this.getActorPosition(event.victim),
    };
  }

  private getResetEvents(
    playerName: string,
    decisiveTime: Date,
    resetEvents: Array<LogHeal | LogItemUse>,
    matchStartTime: Date
  ): FightResetEvent[] {
    return resetEvents
      .filter((event) => this.getActorName(event.character) === playerName)
      .map((event) => {
        const timestamp = this.getEventTime(event);
        if (!timestamp) return null;
        const resetEvent: FightResetEvent = {
          timestamp,
          matchTimeSeconds: TelemetryGeometry.secondsBetween(matchStartTime, timestamp),
          itemId: event.item?.itemId,
          healAmount: event._T === 'LogHeal' ? event.healAmount : undefined,
        };
        return resetEvent;
      })
      .filter((event): event is FightResetEvent => Boolean(event))
      .filter((event) => {
        const seconds = TelemetryGeometry.signedSecondsBetween(event.timestamp, decisiveTime);
        return seconds >= 0 && seconds <= CONTEXT_WINDOW_SECONDS;
      })
      .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
  }

  private getBlueZoneDamage(
    playerName: string,
    decisiveTime: Date,
    damageEvents: LogPlayerTakeDamage[],
    matchStartTime: Date
  ): ZonePressureEvidence {
    const events = damageEvents
      .filter(
        (event) =>
          this.getActorName(event.victim) === playerName &&
          event.damageTypeCategory === 'Damage_BlueZone'
      )
      .map((event) => this.toFightDamageEvent(event, matchStartTime))
      .filter((event): event is FightDamageEvent => Boolean(event))
      .filter((event) => {
        const seconds = TelemetryGeometry.signedSecondsBetween(event.timestamp, decisiveTime);
        return seconds >= 0 && seconds <= ZONE_PRESSURE_WINDOW_SECONDS;
      });

    return {
      damage: events.reduce((sum, event) => sum + event.damage, 0),
      events,
      windowSeconds: ZONE_PRESSURE_WINDOW_SECONDS,
    };
  }

  private getClosestTeammate(
    playerName: string,
    playerPosition: TelemetryPosition | undefined,
    matchAnalysis: MatchAnalysis,
    trackedPlayerNames: string[],
    decisiveTime: Date,
    damageEvents: LogPlayerTakeDamage[]
  ):
    | {
        name: string;
        distanceMeters: number;
        position: TelemetryPosition;
        confidence: 'high' | 'medium';
      }
    | undefined {
    if (!playerPosition) {
      return undefined;
    }

    return trackedPlayerNames
      .filter((name) => name !== playerName)
      .map((name) => {
        const analysis = matchAnalysis.playerAnalyses.get(name);
        const latestDamagePosition = this.getLatestActorPosition(name, decisiveTime, damageEvents);
        const position =
          latestDamagePosition ??
          (analysis ? this.getLastKnownPlayerPosition(analysis) : undefined);
        return position
          ? {
              name,
              distanceMeters: TelemetryGeometry.distanceMeters(playerPosition, position),
              position,
              confidence: latestDamagePosition ? 'high' : 'medium',
            }
          : undefined;
      })
      .filter(
        (
          candidate
        ): candidate is {
          name: string;
          distanceMeters: number;
          position: TelemetryPosition;
          confidence: 'high' | 'medium';
        } => Boolean(candidate)
      )
      .sort((left, right) => left.distanceMeters - right.distanceMeters)[0];
  }

  private getLatestActorPosition(
    actorName: string,
    decisiveTime: Date,
    damageEvents: LogPlayerTakeDamage[]
  ): TelemetryPosition | undefined {
    return damageEvents
      .map((event) => {
        const timestamp = this.getEventTime(event);
        const attackerPosition =
          this.getActorName(event.attacker) === actorName
            ? this.getActorPosition(event.attacker)
            : undefined;
        const victimPosition =
          this.getActorName(event.victim) === actorName
            ? this.getActorPosition(event.victim)
            : undefined;
        const position = attackerPosition ?? victimPosition;
        return timestamp && position ? { timestamp, position } : undefined;
      })
      .filter((entry): entry is { timestamp: Date; position: TelemetryPosition } => Boolean(entry))
      .filter((entry) => {
        const seconds = TelemetryGeometry.signedSecondsBetween(entry.timestamp, decisiveTime);
        return seconds >= 0 && seconds <= CONTEXT_WINDOW_SECONDS;
      })
      .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())[0]?.position;
  }

  private getDamageFromPlayerToEnemy(
    playerName: string | undefined,
    enemyName: string | undefined,
    decisiveTime: Date,
    damageEvents: LogPlayerTakeDamage[],
    matchStartTime: Date
  ): FightDamageEvent[] {
    if (!playerName || !enemyName) {
      return [];
    }

    return damageEvents
      .filter(
        (event) =>
          this.getActorName(event.attacker) === playerName &&
          this.getActorName(event.victim) === enemyName
      )
      .map((event) => this.toFightDamageEvent(event, matchStartTime))
      .filter((event): event is FightDamageEvent => Boolean(event))
      .filter((event) => {
        const seconds = TelemetryGeometry.signedSecondsBetween(event.timestamp, decisiveTime);
        return seconds >= 0 && seconds <= TRADE_DAMAGE_WINDOW_SECONDS;
      });
  }

  private getLastKnownPlayerPosition(analysis: PlayerTelemetry): TelemetryPosition | undefined {
    const decisiveEvent = this.getDecisiveEvents(analysis)[0];
    return decisiveEvent ? this.getVictimPosition(decisiveEvent) : undefined;
  }

  private getRepositionDistanceMeters(
    damageTaken: FightDamageEvent[],
    playerPosition: TelemetryPosition | undefined
  ): number | undefined {
    const firstDamagePosition = damageTaken[0]?.position;
    if (!firstDamagePosition || !playerPosition) {
      return undefined;
    }

    return TelemetryGeometry.distanceMeters(firstDamagePosition, playerPosition);
  }

  private getEnemyName(event: DecisiveEvent): string | undefined {
    return event._T === 'LogPlayerMakeGroggy'
      ? this.getActorName(event.attacker)
      : this.getActorName(event.killer);
  }

  private getDecisiveWeapon(event: DecisiveEvent): string | undefined {
    return event._T === 'LogPlayerMakeGroggy'
      ? event.damageCauserName
      : this.getKillDamageCauserName(event);
  }

  private getDecisiveDamageTypeCategory(event: DecisiveEvent): string | undefined {
    return event._T === 'LogPlayerMakeGroggy'
      ? event.damageTypeCategory
      : this.getKillDamageInfo(event)?.damageTypeCategory;
  }

  private getDecisiveDamageReason(event: DecisiveEvent): string | undefined {
    return event._T === 'LogPlayerMakeGroggy'
      ? event.damageReason
      : this.getKillDamageInfo(event)?.damageReason;
  }

  private getKillDamageCauserName(kill: LogPlayerKillV2): string | undefined {
    return (
      this.getKillDamageInfo(kill)?.damageCauserName ??
      (kill as LogPlayerKillV2 & { damageCauserName?: string }).damageCauserName
    );
  }

  private getKillDamageInfo(kill: LogPlayerKillV2) {
    const finishDamage = DamageInfoUtils.getFirst(kill.finishDamageInfo);
    if (finishDamage?.damageCauserName && finishDamage.damageCauserName !== 'None') {
      return finishDamage;
    }

    const killerDamage = DamageInfoUtils.getFirst(kill.killerDamageInfo);
    if (killerDamage?.damageCauserName && killerDamage.damageCauserName !== 'None') {
      return killerDamage;
    }

    return null;
  }

  private getVictimPosition(event: DecisiveEvent): TelemetryPosition | undefined {
    return this.getActorPosition(event.victim);
  }

  private getEnemyPosition(event: DecisiveEvent): TelemetryPosition | undefined {
    return event._T === 'LogPlayerMakeGroggy'
      ? this.getActorPosition(event.attacker)
      : this.getActorPosition(event.killer);
  }

  private getActorName(actor?: ActorWithPosition): string | undefined {
    return actor?.name;
  }

  private getActorPosition(actor?: ActorWithPosition): TelemetryPosition | undefined {
    const location = actor?.location;
    if (!location || typeof location.x !== 'number' || typeof location.y !== 'number') {
      return undefined;
    }

    return {
      x: location.x,
      y: location.y,
      z: typeof location.z === 'number' ? location.z : undefined,
    };
  }

  private getEventTime(event: { _D?: string }): Date | null {
    if (!event._D) {
      return null;
    }

    const parsed = new Date(event._D);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}

export const FIGHT_CONTEXT_THRESHOLDS = {
  contextWindowSeconds: CONTEXT_WINDOW_SECONDS,
  tradeRangeMeters: TRADE_RANGE_METERS,
  meaningfulRepositionMeters: MEANINGFUL_REPOSITION_METERS,
  heightAdvantageMeters: HEIGHT_ADVANTAGE_METERS,
  tradeDamageWindowSeconds: TRADE_DAMAGE_WINDOW_SECONDS,
};
