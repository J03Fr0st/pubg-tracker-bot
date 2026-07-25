import type { TelemetryEvent } from '@j03fr0st/pubg-ts';
import type {
  NormalizedTelemetryEvent,
  TelemetryTimeline,
  TimelineDiagnostic,
  TimelineEventCategory,
  TimelineIdentity,
  TimelinePosition,
  TimelineScalar,
} from '../types/coaching-timeline.types';

const SOURCE_CATEGORIES = {
  LogArmorDestroy: 'armor-destroy',
  LogCarePackageLand: 'inventory',
  LogCarePackageSpawn: 'inventory',
  LogCharacterCarry: 'carry',
  LogEmPickupLiftOff: 'vehicle-enter',
  LogGameStatePeriodic: 'game-state',
  LogHeal: 'heal',
  LogItemAttach: 'inventory',
  LogItemDetach: 'inventory',
  LogItemDrop: 'inventory',
  LogItemEquip: 'inventory',
  LogItemPickup: 'inventory',
  LogItemPickupFromCarepackage: 'inventory',
  LogItemPickupFromLootBox: 'inventory',
  LogItemPickupFromVehicleTrunk: 'inventory',
  LogItemPutToVehicleTrunk: 'inventory',
  LogItemUnequip: 'inventory',
  LogItemUse: 'heal',
  LogMatchDefinition: 'match',
  LogMatchEnd: 'match',
  LogMatchStart: 'match',
  LogObjectDestroy: 'object',
  LogObjectInteraction: 'object',
  LogParachuteLanding: 'position',
  LogPhaseChange: 'phase',
  LogPlayerAttack: 'attack',
  LogPlayerCreate: 'login',
  LogPlayerDestroyProp: 'object',
  LogPlayerKill: 'death',
  LogPlayerKillV2: 'death',
  LogPlayerLogin: 'login',
  LogPlayerLogout: 'logout',
  LogPlayerMakeGroggy: 'knock',
  LogPlayerPosition: 'position',
  LogPlayerRevive: 'revive',
  LogPlayerTakeDamage: 'damage',
  LogPlayerUseFlareGun: 'utility',
  LogPlayerUseThrowable: 'utility',
  LogSwimEnd: 'swim-end',
  LogSwimStart: 'swim-start',
  LogVaultStart: 'position',
  LogVehicleDamage: 'vehicle-damage',
  LogVehicleDestroy: 'vehicle-destroy',
  LogVehicleLeave: 'vehicle-exit',
  LogVehicleRide: 'vehicle-enter',
  LogWeaponFireCount: 'attack',
  LogWheelDestroy: 'vehicle-wheel-destroy',
} as const satisfies Record<string, TimelineEventCategory>;

export const SUPPORTED_TELEMETRY_SOURCE_TYPES = Object.keys(SOURCE_CATEGORIES).sort();

type UnknownRecord = Record<string, unknown>;

export class TelemetryTimelineBuilderService {
  public build(rawEvents: TelemetryEvent[], matchStartTime: Date): TelemetryTimeline {
    const diagnostics: TimelineDiagnostic[] = [];
    const events = rawEvents.map((sourceEvent, sourceIndex) =>
      this.normalize(sourceEvent, sourceIndex, matchStartTime, diagnostics)
    );

    events.sort((left, right) => {
      if (left.timestamp && right.timestamp) {
        return (
          left.timestamp.getTime() - right.timestamp.getTime() ||
          left.sourceIndex - right.sourceIndex
        );
      }
      if (left.timestamp) return -1;
      if (right.timestamp) return 1;
      return left.sourceIndex - right.sourceIndex;
    });

    return { matchStartTime: new Date(matchStartTime), events, diagnostics };
  }

  private normalize(
    sourceEvent: TelemetryEvent,
    sourceIndex: number,
    matchStartTime: Date,
    diagnostics: TimelineDiagnostic[]
  ): NormalizedTelemetryEvent {
    const record = sourceEvent as unknown as UnknownRecord;
    const sourceType = sourceEvent._T;
    const category = this.categoryOf(sourceType);
    const known = sourceType in SOURCE_CATEGORIES;
    const timestamp = this.timestampOf(record._D);
    const id = `event-${sourceIndex}`;

    if (record._D === undefined) {
      diagnostics.push({
        code: 'missing-timestamp',
        sourceIndex,
        eventId: id,
        message: `${sourceType} has no timestamp`,
      });
    } else if (!timestamp) {
      diagnostics.push({
        code: 'invalid-timestamp',
        sourceIndex,
        eventId: id,
        message: `${sourceType} has an invalid timestamp`,
      });
    }
    if (!known) {
      diagnostics.push({
        code: 'unknown-event-type',
        sourceIndex,
        eventId: id,
        message: `${sourceType} is not supported by the installed telemetry contract`,
      });
    }

    const actorRecord = this.actorOf(record, sourceType);
    const targetRecord = this.recordOf(record.victim);

    return {
      id,
      sourceIndex,
      sourceType,
      category,
      known,
      evidenceEligible: known,
      timestamp,
      matchTimeSeconds: timestamp ? (timestamp.getTime() - matchStartTime.getTime()) / 1000 : null,
      actor: this.identityOf(actorRecord, this.directAccountIdOf(record, sourceType)),
      target: this.identityOf(targetRecord),
      actorPosition: this.positionOf(actorRecord?.location),
      targetPosition: this.positionOf(targetRecord?.location),
      data: this.dataOf(record),
      sourceEvent,
    };
  }

  private categoryOf(sourceType: string): TimelineEventCategory {
    return sourceType in SOURCE_CATEGORIES
      ? SOURCE_CATEGORIES[sourceType as keyof typeof SOURCE_CATEGORIES]
      : 'generic';
  }

  private actorOf(record: UnknownRecord, sourceType: string): UnknownRecord | undefined {
    if (sourceType === 'LogPlayerKill' || sourceType === 'LogPlayerKillV2') {
      return this.recordOf(record.killer);
    }
    if (sourceType === 'LogPlayerRevive') {
      return this.recordOf(record.reviver);
    }
    return (
      this.recordOf(record.attacker) ??
      this.recordOf(record.character) ??
      this.recordOf(record.instigator)
    );
  }

  private directAccountIdOf(record: UnknownRecord, sourceType: string): string | undefined {
    return sourceType === 'LogPlayerLogin' || sourceType === 'LogPlayerLogout'
      ? this.stringOf(record.accountId)
      : undefined;
  }

  private identityOf(
    record: UnknownRecord | undefined,
    directAccountId?: string
  ): TimelineIdentity | undefined {
    const accountId = directAccountId ?? this.stringOf(record?.accountId);
    const name = this.stringOf(record?.name);
    if (!accountId && !name) return undefined;
    return {
      accountId,
      name,
      confidence: accountId ? 'high' : 'medium',
    };
  }

  private positionOf(value: unknown): TimelinePosition | undefined {
    const record = this.recordOf(value);
    const x = this.numberOf(record?.x);
    const y = this.numberOf(record?.y);
    if (x === undefined || y === undefined) return undefined;
    const z = this.numberOf(record?.z);
    return z === undefined ? { x, y } : { x, y, z };
  }

  private dataOf(record: UnknownRecord): Readonly<Record<string, TimelineScalar>> {
    const item = this.recordOf(record.item);
    const weapon = this.recordOf(record.weapon);
    const vehicle = this.recordOf(record.vehicle);
    const gameState = this.recordOf(record.gameState);
    const values: Record<string, TimelineScalar | undefined> = {
      attackId: this.numberOf(record.attackId),
      carryState: this.stringOf(record.carryState),
      damage: this.numberOf(record.damage),
      damageCauserName: this.stringOf(record.damageCauserName),
      damageReason: this.stringOf(record.damageReason),
      damageTypeCategory: this.stringOf(record.damageTypeCategory),
      fireCount: this.numberOf(record.fireCount),
      healAmount: this.numberOf(record.healAmount),
      itemId: this.stringOf(item?.itemId),
      numAlivePlayers:
        this.numberOf(record.numAlivePlayers) ?? this.numberOf(gameState?.numAlivePlayers),
      objectType: this.stringOf(record.objectType),
      phase: this.numberOf(record.phase),
      seatIndex: this.numberOf(record.seatIndex),
      vehicleId: this.stringOf(vehicle?.vehicleId),
      weaponId: this.stringOf(weapon?.itemId) ?? this.stringOf(record.weaponId),
      wheelIndex: this.numberOf(record.wheelIndex),
    };

    return Object.fromEntries(
      Object.entries(values).filter(
        (entry): entry is [string, TimelineScalar] => entry[1] !== undefined
      )
    );
  }

  private timestampOf(value: unknown): Date | null {
    if (typeof value !== 'string') return null;
    const timestamp = new Date(value);
    return Number.isNaN(timestamp.getTime()) ? null : timestamp;
  }

  private recordOf(value: unknown): UnknownRecord | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as UnknownRecord)
      : undefined;
  }

  private stringOf(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private numberOf(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }
}
