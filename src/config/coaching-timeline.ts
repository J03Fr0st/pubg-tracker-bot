export interface CoachingTimelineThresholds {
  encounterInactivitySeconds: number;
  encounterSeparationCentimeters: number;
}

export const DEFAULT_COACHING_TIMELINE_THRESHOLDS: CoachingTimelineThresholds = {
  encounterInactivitySeconds: 20,
  encounterSeparationCentimeters: 15000,
};
