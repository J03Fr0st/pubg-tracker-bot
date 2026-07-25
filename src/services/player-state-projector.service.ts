import type { TrackedPlayerIdentity } from '../types/analytics-results.types';
import type {
  NormalizedTelemetryEvent,
  PlayerActivityState,
  PlayerCoreState,
  PlayerStateInterval,
  PlayerStateProjection,
  ProjectedPlayerState,
  TelemetryTimeline,
  TimelineDiagnostic,
} from '../types/coaching-timeline.types';

interface MutablePlayerState {
  projected: ProjectedPlayerState;
  currentCore: PlayerStateInterval<PlayerCoreState>;
  stateBeforeDisconnect: PlayerCoreState;
  activeActivities: Map<PlayerActivityState, PlayerStateInterval<PlayerActivityState>>;
}

export class PlayerStateProjectorService {
  public project(
    timeline: TelemetryTimeline,
    monitoredPlayers: TrackedPlayerIdentity[]
  ): PlayerStateProjection {
    const diagnostics: TimelineDiagnostic[] = [];
    const states = new Map<string, MutablePlayerState>();

    for (const player of monitoredPlayers) {
      const initial: PlayerStateInterval<PlayerCoreState> = {
        state: 'alive',
        startTimeSeconds: 0,
        endTimeSeconds: null,
        openedByEventId: `initial-${player.accountId}`,
        confidence: 'high',
      };
      states.set(player.accountId, {
        projected: {
          identity: { ...player, confidence: 'high' },
          core: [initial],
          activities: [],
        },
        currentCore: initial,
        stateBeforeDisconnect: 'alive',
        activeActivities: new Map(),
      });
    }

    for (const event of timeline.events) {
      if (event.matchTimeSeconds === null) continue;
      this.applyCoreTransition(event, states, diagnostics);
      this.applyActivityTransition(event, states, diagnostics);
    }

    return {
      players: new Map([...states].map(([accountId, state]) => [accountId, state.projected])),
      diagnostics,
    };
  }

  private applyCoreTransition(
    event: NormalizedTelemetryEvent,
    states: Map<string, MutablePlayerState>,
    diagnostics: TimelineDiagnostic[]
  ): void {
    const targetState = event.target?.accountId ? states.get(event.target.accountId) : undefined;
    const actorState = event.actor?.accountId ? states.get(event.actor.accountId) : undefined;

    switch (event.category) {
      case 'knock':
        if (targetState) this.transition(targetState, 'knocked', event, ['alive'], diagnostics);
        return;
      case 'revive':
        if (targetState) {
          this.transition(targetState, 'alive', event, ['knocked', 'carried'], diagnostics);
        }
        return;
      case 'death':
        if (targetState) {
          this.transition(targetState, 'dead', event, ['alive', 'knocked', 'carried'], diagnostics);
        }
        return;
      case 'logout':
        if (actorState) {
          if (actorState.currentCore.state !== 'disconnected') {
            actorState.stateBeforeDisconnect = actorState.currentCore.state;
          }
          this.transition(
            actorState,
            'disconnected',
            event,
            ['alive', 'knocked', 'carried'],
            diagnostics
          );
        }
        return;
      case 'login':
        if (actorState) {
          this.transition(
            actorState,
            actorState.stateBeforeDisconnect,
            event,
            ['disconnected'],
            diagnostics
          );
        }
        return;
      case 'carry':
        if (actorState) this.applyCarryTransition(actorState, event, diagnostics);
        return;
      default:
        return;
    }
  }

  private applyCarryTransition(
    state: MutablePlayerState,
    event: NormalizedTelemetryEvent,
    diagnostics: TimelineDiagnostic[]
  ): void {
    const carryState = String(event.data.carryState ?? '').toLowerCase();
    if (carryState.includes('drop') || carryState.includes('release')) {
      this.transition(state, 'knocked', event, ['carried'], diagnostics);
      return;
    }
    if (carryState.includes('carry')) {
      this.transition(state, 'carried', event, ['knocked'], diagnostics);
      return;
    }
    this.addAmbiguousDiagnostic(state, event, 'Unknown carry state', diagnostics);
  }

  private applyActivityTransition(
    event: NormalizedTelemetryEvent,
    states: Map<string, MutablePlayerState>,
    diagnostics: TimelineDiagnostic[]
  ): void {
    if (!event.actor?.accountId || event.matchTimeSeconds === null) return;
    const state = states.get(event.actor.accountId);
    if (!state) return;

    if (event.category === 'vehicle-enter') {
      this.openActivity(state, 'in-vehicle', event);
    } else if (event.category === 'vehicle-exit') {
      this.closeActivity(state, 'in-vehicle', event);
    } else if (event.category === 'swim-start') {
      this.openActivity(state, 'swimming', event);
    } else if (event.category === 'swim-end') {
      this.closeActivity(state, 'swimming', event);
    } else if (event.category === 'heal') {
      if (state.currentCore.state !== 'alive') {
        this.addAmbiguousDiagnostic(
          state,
          event,
          `Heal observed while ${state.currentCore.state}`,
          diagnostics
        );
        return;
      }
      state.projected.activities.push({
        state: 'healing',
        startTimeSeconds: event.matchTimeSeconds,
        endTimeSeconds: event.matchTimeSeconds,
        openedByEventId: event.id,
        closedByEventId: event.id,
        confidence: 'high',
      });
    }
  }

  private transition(
    state: MutablePlayerState,
    next: PlayerCoreState,
    event: NormalizedTelemetryEvent,
    allowedFrom: PlayerCoreState[],
    diagnostics: TimelineDiagnostic[]
  ): void {
    if (event.matchTimeSeconds === null) return;
    if (!allowedFrom.includes(state.currentCore.state)) {
      this.addAmbiguousDiagnostic(
        state,
        event,
        `Cannot transition ${state.currentCore.state} to ${next}`,
        diagnostics
      );
      return;
    }

    state.currentCore.endTimeSeconds = event.matchTimeSeconds;
    state.currentCore.closedByEventId = event.id;
    const interval: PlayerStateInterval<PlayerCoreState> = {
      state: next,
      startTimeSeconds: event.matchTimeSeconds,
      endTimeSeconds: null,
      openedByEventId: event.id,
      confidence: 'high',
    };
    state.projected.core.push(interval);
    state.currentCore = interval;
  }

  private openActivity(
    state: MutablePlayerState,
    activity: PlayerActivityState,
    event: NormalizedTelemetryEvent
  ): void {
    if (event.matchTimeSeconds === null || state.activeActivities.has(activity)) return;
    const interval: PlayerStateInterval<PlayerActivityState> = {
      state: activity,
      startTimeSeconds: event.matchTimeSeconds,
      endTimeSeconds: null,
      openedByEventId: event.id,
      confidence: 'high',
    };
    state.projected.activities.push(interval);
    state.activeActivities.set(activity, interval);
  }

  private closeActivity(
    state: MutablePlayerState,
    activity: PlayerActivityState,
    event: NormalizedTelemetryEvent
  ): void {
    if (event.matchTimeSeconds === null) return;
    const interval = state.activeActivities.get(activity);
    if (!interval) return;
    interval.endTimeSeconds = event.matchTimeSeconds;
    interval.closedByEventId = event.id;
    state.activeActivities.delete(activity);
  }

  private addAmbiguousDiagnostic(
    state: MutablePlayerState,
    event: NormalizedTelemetryEvent,
    message: string,
    diagnostics: TimelineDiagnostic[]
  ): void {
    diagnostics.push({
      code: 'ambiguous-transition',
      eventId: event.id,
      sourceIndex: event.sourceIndex,
      accountId: state.projected.identity.accountId,
      message,
    });
  }
}
