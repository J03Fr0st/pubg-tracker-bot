import { TelemetryGeometry } from '../../../src/utils/telemetry-geometry';

describe('TelemetryGeometry', () => {
  describe('distanceMeters', () => {
    it('returns 0 when positions coincide', () => {
      expect(TelemetryGeometry.distanceMeters({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0);
    });

    it('divides centimetre coordinates by 100 to produce metres', () => {
      expect(TelemetryGeometry.distanceMeters({ x: 0, y: 0 }, { x: 300, y: 400 })).toBe(5);
    });

    it('rounds to one decimal place', () => {
      expect(TelemetryGeometry.distanceMeters({ x: 0, y: 0 }, { x: 123, y: 0 })).toBe(1.2);
    });
  });

  describe('angleDegrees', () => {
    it('returns 0 when the two vectors point the same way', () => {
      expect(
        TelemetryGeometry.angleDegrees({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 })
      ).toBe(0);
    });

    it('returns 90 for perpendicular vectors', () => {
      expect(
        TelemetryGeometry.angleDegrees({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 })
      ).toBe(90);
    });

    it('returns undefined when either vector has zero length', () => {
      expect(
        TelemetryGeometry.angleDegrees({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })
      ).toBeUndefined();
    });
  });

  describe('heightDeltaMeters', () => {
    it('returns the z-delta in metres', () => {
      expect(
        TelemetryGeometry.heightDeltaMeters({ x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: 1100 })
      ).toBe(10);
    });

    it('returns undefined when z is missing on either side', () => {
      expect(
        TelemetryGeometry.heightDeltaMeters({ x: 0, y: 0 }, { x: 0, y: 0, z: 0 })
      ).toBeUndefined();
    });
  });

  describe('secondsBetween', () => {
    it('returns rounded non-negative seconds for unsigned variant', () => {
      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2024-01-01T00:00:02.400Z');
      expect(TelemetryGeometry.secondsBetween(start, end)).toBe(2);
    });

    it('clamps the unsigned variant to zero when end is before start', () => {
      const start = new Date('2024-01-01T00:00:10Z');
      const end = new Date('2024-01-01T00:00:00Z');
      expect(TelemetryGeometry.secondsBetween(start, end)).toBe(0);
    });

    it('signedSecondsBetween allows negatives', () => {
      const start = new Date('2024-01-01T00:00:10Z');
      const end = new Date('2024-01-01T00:00:00Z');
      expect(TelemetryGeometry.signedSecondsBetween(start, end)).toBe(-10);
    });
  });
});
