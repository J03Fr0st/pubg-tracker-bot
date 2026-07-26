import type { TrackedPlayerIdentity } from '../types/analytics-results.types';
import type {
  ClosestTeammateFact,
  EnrichedTelemetryEncounter,
  EvidenceValue,
} from '../types/coaching-detector.types';
import type {
  NormalizedTelemetryEvent,
  PlayerCoreState,
  PlayerStateProjection,
  TelemetryEncounter,
  TelemetryTimeline,
  TimelinePosition,
} from '../types/coaching-timeline.types';

const CONTEXT_LOOKBACK_SECONDS = 15;
const POSITION_LOOKBACK_SECONDS = 10;

export class TelemetryContextEnricherService {
  public enrich(
    timeline: TelemetryTimeline,
    state: PlayerStateProjection,
    encounters: TelemetryEncounter[],
    monitoredPlayers: TrackedPlayerIdentity[]
  ): EnrichedTelemetryEncounter[] {
    const eventById = new Map(timeline.events.map((event) => [event.id, event]));
    return encounters.map((encounter) => {
      const events = encounter.eventIds
        .map((id) => eventById.get(id))
        .filter((event): event is NormalizedTelemetryEvent => Boolean(event));
      const contextEvents = timeline.events.filter(
        (event) =>
          event.matchTimeSeconds !== null &&
          event.matchTimeSeconds >= encounter.startTimeSeconds - CONTEXT_LOOKBACK_SECONDS &&
          event.matchTimeSeconds <= encounter.endTimeSeconds
      );
      const accountId = encounter.monitoredPlayer.accountId;
      const opponentAccountIds = new Set(encounter.opponentAccountIds);
      const beforeSourceIndex = Math.min(...events.map((event) => event.sourceIndex)) - 1;
      const coreStateAtStart = this.coreStateAt(
        state,
        eventById,
        accountId,
        encounter.startTimeSeconds,
        beforeSourceIndex
      );

      return {
        encounter,
        events,
        contextEvents,
        coreStateAtStart,
        actionableAtStart: coreStateAtStart === 'alive',
        damageTaken: this.sumDamage(events, accountId, opponentAccountIds, 'taken'),
        damageDealt: this.sumDamage(events, accountId, opponentAccountIds, 'dealt'),
        blueZoneDamage: this.sumBlueZoneDamage(contextEvents, accountId),
        armorDestroyed: this.booleanFact(
          events.filter(
            (event) => event.category === 'armor-destroy' && event.target?.accountId === accountId
          )
        ),
        recentVehicleExit: this.booleanFact(
          contextEvents.filter(
            (event) =>
              event.category === 'vehicle-exit' &&
              event.actor?.accountId === accountId &&
              event.matchTimeSeconds !== null &&
              (event.matchTimeSeconds < encounter.startTimeSeconds ||
                (event.matchTimeSeconds === encounter.startTimeSeconds &&
                  event.sourceIndex <= beforeSourceIndex))
          )
        ),
        closestTeammate: this.closestTeammate(
          contextEvents,
          state,
          eventById,
          encounter,
          monitoredPlayers,
          beforeSourceIndex
        ),
        healEvents: contextEvents.filter(
          (event) => event.category === 'heal' && event.actor?.accountId === accountId
        ),
        movementEvents: contextEvents.filter(
          (event) => event.category === 'position' && event.actor?.accountId === accountId
        ),
        utilityEvents: contextEvents.filter(
          (event) => event.category === 'utility' && event.actor?.accountId === accountId
        ),
      };
    });
  }

  private coreStateAt(
    projection: PlayerStateProjection,
    eventById: Map<string, NormalizedTelemetryEvent>,
    accountId: string,
    timeSeconds: number,
    atSourceIndex: number
  ): PlayerCoreState {
    const intervals = projection.players.get(accountId)?.core ?? [];
    let current: PlayerCoreState = 'disconnected';
    for (const interval of intervals) {
      const openedAtSourceIndex = eventById.get(interval.openedByEventId)?.sourceIndex ?? -1;
      if (
        interval.startTimeSeconds < timeSeconds ||
        (interval.startTimeSeconds === timeSeconds && openedAtSourceIndex <= atSourceIndex)
      ) {
        current = interval.state;
      }
    }
    return current;
  }

  private sumDamage(
    events: NormalizedTelemetryEvent[],
    accountId: string,
    opponentAccountIds: Set<string>,
    direction: 'dealt' | 'taken'
  ): EvidenceValue<number> {
    const matching = events.filter(
      (event) =>
        event.category === 'damage' &&
        (direction === 'taken'
          ? event.target?.accountId === accountId &&
            event.actor?.accountId !== undefined &&
            opponentAccountIds.has(event.actor.accountId)
          : event.actor?.accountId === accountId &&
            event.target?.accountId !== undefined &&
            opponentAccountIds.has(event.target.accountId))
    );
    return {
      value: matching.reduce(
        (sum, event) => sum + (typeof event.data.damage === 'number' ? event.data.damage : 0),
        0
      ),
      evidenceEventIds: matching.map((event) => event.id),
    };
  }

  private sumBlueZoneDamage(
    events: NormalizedTelemetryEvent[],
    accountId: string
  ): EvidenceValue<number> {
    const matching = events.filter(
      (event) =>
        event.category === 'damage' &&
        event.target?.accountId === accountId &&
        String(event.data.damageTypeCategory ?? '')
          .toLowerCase()
          .includes('bluezone')
    );
    return {
      value: matching.reduce(
        (sum, event) => sum + (typeof event.data.damage === 'number' ? event.data.damage : 0),
        0
      ),
      evidenceEventIds: matching.map((event) => event.id),
    };
  }

  private booleanFact(events: NormalizedTelemetryEvent[]): EvidenceValue<boolean> {
    return { value: events.length > 0, evidenceEventIds: events.map((event) => event.id) };
  }

  private closestTeammate(
    events: NormalizedTelemetryEvent[],
    state: PlayerStateProjection,
    eventById: Map<string, NormalizedTelemetryEvent>,
    encounter: TelemetryEncounter,
    monitoredPlayers: TrackedPlayerIdentity[],
    atSourceIndex: number
  ): ClosestTeammateFact | undefined {
    const playerPosition = this.latestPosition(
      events,
      encounter.monitoredPlayer.accountId,
      encounter.startTimeSeconds,
      atSourceIndex
    );
    if (!playerPosition) return undefined;
    const monitoredTeamId = playerPosition.event.actor?.teamId;
    if (monitoredTeamId === undefined) return undefined;

    const facts: ClosestTeammateFact[] = [];
    for (const player of monitoredPlayers) {
      if (player.accountId === encounter.monitoredPlayer.accountId) continue;
      const teammatePosition = this.latestPosition(
        events,
        player.accountId,
        encounter.startTimeSeconds,
        atSourceIndex
      );
      if (!teammatePosition) continue;
      if (teammatePosition.event.actor?.teamId !== monitoredTeamId) continue;
      const sampleGap = Math.abs(
        (playerPosition.event.matchTimeSeconds ?? 0) -
          (teammatePosition.event.matchTimeSeconds ?? 0)
      );
      facts.push({
        ...player,
        distanceMeters: this.distance(playerPosition.position, teammatePosition.position) / 100,
        confidence: sampleGap <= 2 ? 'high' : 'medium',
        coreState: this.coreStateAt(
          state,
          eventById,
          player.accountId,
          encounter.startTimeSeconds,
          atSourceIndex
        ),
        evidenceEventIds: [playerPosition.event.id, teammatePosition.event.id],
      });
    }
    return facts.sort((left, right) => left.distanceMeters - right.distanceMeters)[0];
  }

  private latestPosition(
    events: NormalizedTelemetryEvent[],
    accountId: string,
    atSeconds: number,
    atSourceIndex: number
  ): { event: NormalizedTelemetryEvent; position: TimelinePosition } | undefined {
    let latest: { event: NormalizedTelemetryEvent; position: TimelinePosition } | undefined;
    for (const event of events) {
      const position = event.actorPosition;
      const seconds = event.matchTimeSeconds;
      if (
        event.category !== 'position' ||
        event.actor?.accountId !== accountId ||
        !position ||
        seconds === null ||
        seconds > atSeconds ||
        (seconds === atSeconds && event.sourceIndex > atSourceIndex) ||
        atSeconds - seconds > POSITION_LOOKBACK_SECONDS
      ) {
        continue;
      }
      if (!latest || seconds > (latest.event.matchTimeSeconds ?? 0)) {
        latest = { event, position };
      }
    }
    return latest;
  }

  private distance(left: TimelinePosition, right: TimelinePosition): number {
    const dx = left.x - right.x;
    const dy = left.y - right.y;
    const dz = (left.z ?? 0) - (right.z ?? 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}
