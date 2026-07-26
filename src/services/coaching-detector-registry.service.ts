import type {
  CoachingDetector,
  CoachingDetectorResult,
  EnrichedTelemetryEncounter,
} from '../types/coaching-detector.types';

export class CoachingDetectorRegistryService {
  public constructor(private readonly detectors: CoachingDetector[]) {}

  public run(encounters: EnrichedTelemetryEncounter[]): CoachingDetectorResult[] {
    return encounters.flatMap((encounter) =>
      this.detectors.map((detector) => {
        try {
          return detector.detect(encounter);
        } catch {
          return {
            kind: 'suppressed' as const,
            detectorId: detector.id,
            encounterId: encounter.encounter.id,
            reason: 'detector-failed' as const,
            evidenceEventIds: [],
          };
        }
      })
    );
  }
}
