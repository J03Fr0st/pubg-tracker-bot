import { CoachingDetectorRegistryService } from '../../../src/services/coaching-detector-registry.service';
import type {
  CoachingDetector,
  EnrichedTelemetryEncounter,
} from '../../../src/types/coaching-detector.types';

const encounter = {
  encounter: {
    id: 'encounter-1',
    monitoredPlayer: {
      accountId: 'account.player',
      name: 'Player',
      confidence: 'high',
    },
  },
} as EnrichedTelemetryEncounter;

describe('CoachingDetectorRegistryService', () => {
  it('isolates one detector failure and preserves other detector results', () => {
    const candidateDetector: CoachingDetector = {
      id: 'candidate',
      detect: () => ({
        kind: 'not-applicable',
        detectorId: 'candidate',
        encounterId: 'encounter-1',
      }),
    };
    const failedDetector: CoachingDetector = {
      id: 'failed',
      detect: () => {
        throw new Error('broken detector');
      },
    };

    const results = new CoachingDetectorRegistryService([failedDetector, candidateDetector]).run([
      encounter,
    ]);

    expect(results).toEqual([
      {
        kind: 'suppressed',
        detectorId: 'failed',
        encounterId: 'encounter-1',
        reason: 'detector-failed',
        evidenceEventIds: [],
      },
      {
        kind: 'not-applicable',
        detectorId: 'candidate',
        encounterId: 'encounter-1',
      },
    ]);
  });
});
