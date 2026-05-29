import type { TelemetryPosition } from '../types/coaching.types';

export const TelemetryGeometry = {
  distanceMeters(left: TelemetryPosition, right: TelemetryPosition): number {
    const dx = left.x - right.x;
    const dy = left.y - right.y;
    return Math.round((Math.sqrt(dx * dx + dy * dy) / 100) * 10) / 10;
  },

  angleDegrees(
    origin: TelemetryPosition,
    firstTarget: TelemetryPosition,
    secondTarget: TelemetryPosition
  ): number | undefined {
    const first = { x: firstTarget.x - origin.x, y: firstTarget.y - origin.y };
    const second = { x: secondTarget.x - origin.x, y: secondTarget.y - origin.y };
    const firstLength = Math.sqrt(first.x * first.x + first.y * first.y);
    const secondLength = Math.sqrt(second.x * second.x + second.y * second.y);
    if (firstLength === 0 || secondLength === 0) {
      return undefined;
    }
    const cosine = (first.x * second.x + first.y * second.y) / (firstLength * secondLength);
    const bounded = Math.max(-1, Math.min(1, cosine));
    return Math.round((Math.acos(bounded) * 180) / Math.PI);
  },

  heightDeltaMeters(player: TelemetryPosition, enemy: TelemetryPosition): number | undefined {
    if (player.z === undefined || enemy.z === undefined) {
      return undefined;
    }
    return (enemy.z - player.z) / 100;
  },

  secondsBetween(start: Date, end: Date): number {
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  },

  signedSecondsBetween(start: Date, end: Date): number {
    return Math.round((end.getTime() - start.getTime()) / 1000);
  },
};
