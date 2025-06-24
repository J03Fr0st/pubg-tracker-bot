export interface LogPlayerKillV2 {
  _D: string; // Timestamp of the event
  _T: string; // Event type, should be "LogPlayerKillV2"
  attackId: number;
  dBNOId?: number; // ID of the knockdown event, if applicable
  victimGameResult: GameResult;
  victim: Character;
  victimWeapon?: string; // Weapon used by the victim
  victimWeaponAdditionalInfo?: string[]; // Additional weapon details
  dBNOMaker?: Character; // Player who knocked the victim
  dBNODamageInfo?: DamageInfo; // Details of the knockdown damage
  finisher?: Character; // Player who finished off the victim
  finishDamageInfo?: DamageInfo; // Details of the finishing blow
  killer?: Character; // Player credited with the kill
  killerDamageInfo?: DamageInfo; // Damage details from the killer
  assists_AccountId?: string[]; // Account IDs of assisting players
  teamKillers_AccountId?: string[]; // Account IDs of teammates causing the death
  isSuicide?: boolean; // Indicates if the death was a suicide
}

export interface GameResult {
  rank: number; // Victim's rank in the match
  gameResult: string; // Outcome of the victim's game (e.g., "defeated", "winner")
  teamId: number; // Team ID of the victim
}

export interface Character {
  name: string; // Player's name
  teamId: number; // Player's team ID
  health: number; // Player's health at the time of the event
  location: Location; // Player's location coordinates
  ranking: number; // Player's ranking at the time of the event
  accountId: string; // Unique account ID of the player
  isInBlueZone?: boolean; // Indicates if the player was in the blue zone
  isInRedZone?: boolean; // Indicates if the player was in the red zone
}

export interface Location {
  x: number; // X coordinate of the location
  y: number; // Y coordinate of the location
  z: number; // Z coordinate of the location
}

export interface DamageInfo {
  damageCauserName: string; // Name of the damage source (e.g., "M416", "Bluezone")
  damageReason: string; // Reason for the damage (e.g., "HeadShot", "Explosion")
  damageTypeCategory: string; // Type of damage (e.g., "Damage_Gun", "Damage_Explosion")
  distance?: number; // Distance between the source and victim
  isThroughPenetrableWall?: boolean; // Indicates if the damage was through a penetrable object
}

export interface LogPlayerMakeGroggy {
  _D: string; // Timestamp of the event
  _T: string; // Event type, should be "LogPlayerMakeGroggy"
  attackId: number; // Unique ID for the attack
  attacker: Character; // Information about the attacker
  victim: Character; // Information about the victim
  damageReason: string; // Reason for the damage (e.g., "HeadShot", "Explosion")
  damageTypeCategory: string; // Type of damage (e.g., "Damage_Gun", "Damage_Explosion")
  damageCauserName: string; // Name of the weapon or cause of the damage
  damageCauserAdditionalInfo: string[]; // Additional details about the damage causer
  VictimWeapon: string; // Weapon being used by the victim
  VictimWeaponAdditionalInfo: string[]; // Additional details about the victim's weapon
  distance: number; // Distance between the attacker and the victim
  isAttackerInVehicle: boolean; // Whether the attacker was in a vehicle
  dBNOId: number; // Unique ID for the down-but-not-out state
  isThroughPenetrableWall: boolean; // Whether the attack passed through a penetrable wall
}

// Additional telemetry events for comprehensive analysis
export interface LogPlayerPosition {
  _D: string;
  _T: string;
  character: Character;
  elapsedTime: number;
  numAlivePlayers: number;
}

export interface LogPlayerTakeDamage {
  _D: string;
  _T: string;
  attackId: number;
  attacker?: Character;
  victim: Character;
  damageTypeCategory: string;
  damageReason: string;
  damage: number;
  damageLocation: string;
}

export interface LogGameStatePeriodic {
  _D: string;
  _T: string;
  gameState: {
    elapsedTime: number;
    numAliveTeams: number;
    numJoinPlayers: number;
    numStartPlayers: number;
    numAlivePlayers: number;
    safetyZonePosition: Location;
    safetyZoneRadius: number;
    poisonGasWarningPosition: Location;
    poisonGasWarningRadius: number;
    redZonePosition: Location;
    redZoneRadius: number;
  };
}

export interface LogZoneUpdate {
  _D: string;
  _T: string;
  zoneState: number;
  elapsedTime: number;
  safetyZonePosition: Location;
  safetyZoneRadius: number;
  poisonGasWarningPosition: Location;
  poisonGasWarningRadius: number;
}

export interface LogPlayerUseItem {
  _D: string;
  _T: string;
  character: Character;
  item: {
    itemId: string;
    stackCount: number;
    category: string;
    subCategory: string;
  };
}

export interface LogItemPickup {
  _D: string;
  _T: string;
  character: Character;
  item: {
    itemId: string;
    stackCount: number;
    category: string;
    subCategory: string;
  };
}

export interface LogPlayerRevive {
  _D: string;
  _T: string;
  reviver: Character;
  victim: Character;
}

export interface LogVehicleRide {
  _D: string;
  _T: string;
  character: Character;
  vehicle: {
    vehicleType: string;
    vehicleId: string;
    healthPercent: number;
    fuelPercent: number;
    feulPercent?: number; // PUBG typo in API
  };
  seatIndex: number;
}

export interface LogWeaponFireCount {
  _D: string;
  _T: string;
  character: Character;
  weaponId: string;
  fireCount: number;
}

// Analysis result types
export interface TelemetryAnalysisResult {
  matchId: string;
  teamPlayers: string[];
  teamRank: number;
  analysisTimestamp: string;
  criticalMistakes: CriticalMistake[];
  strategicRecommendations: StrategyRecommendation[];
  engagementAnalysis: EngagementAnalysis;
  positioningAnalysis: PositioningAnalysis;
  lootingAnalysis: LootingAnalysis;
  teamCoordinationAnalysis: TeamCoordinationAnalysis;
  overallRating: OverallPerformanceRating;
}

export interface CriticalMistake {
  type: 'POSITIONING' | 'ENGAGEMENT' | 'LOOTING' | 'ZONE_MANAGEMENT' | 'TEAM_COORDINATION';
  timestamp: string;
  player: string;
  description: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendation: string;
}

export interface StrategyRecommendation {
  category: 'EARLY_GAME' | 'MID_GAME' | 'LATE_GAME' | 'GENERAL';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  expectedImprovement: string;
}

export interface EngagementAnalysis {
  totalEngagements: number;
  wonEngagements: number;
  lostEngagements: number;
  averageEngagementDistance: number;
  weaponEffectiveness: WeaponEffectiveness[];
  engagementPositioning: EngagementPositioning;
  thirdPartySituations: number;
}

export interface WeaponEffectiveness {
  weapon: string;
  kills: number;
  shots: number;
  accuracy: number;
  averageDistance: number;
  recommendation: string;
}

export interface EngagementPositioning {
  highGroundAdvantage: number;
  coverUsage: number;
  overExtensions: number;
  recommendation: string;
}

export interface PositioningAnalysis {
  zoneManagement: ZoneManagement;
  rotationEfficiency: RotationEfficiency;
  compoundHolding: CompoundHolding;
  finalCirclePositioning: FinalCirclePositioning;
}

export interface ZoneManagement {
  lateRotations: number;
  blueZoneDamage: number;
  earlyRotations: number;
  rotationTiming: 'EXCELLENT' | 'GOOD' | 'POOR';
  recommendation: string;
}

export interface RotationEfficiency {
  averageRotationTime: number;
  routeEfficiency: number;
  vehicleUsage: number;
  recommendation: string;
}

export interface CompoundHolding {
  compoundsHeld: number;
  averageHoldTime: number;
  defensiveEffectiveness: number;
  recommendation: string;
}

export interface FinalCirclePositioning {
  finalCircleRank: number;
  centerControl: boolean;
  edgePlay: boolean;
  recommendation: string;
}

export interface LootingAnalysis {
  lootingEfficiency: LootingEfficiency;
  weaponChoices: WeaponChoices;
  healingManagement: HealingManagement;
  throwableUsage: ThrowableUsage;
}

export interface LootingEfficiency {
  earlyGameLootTime: number;
  midGameUpgrades: number;
  lateGameOptimization: number;
  recommendation: string;
}

export interface WeaponChoices {
  primaryWeapon: string;
  secondaryWeapon: string;
  weaponSynergy: number;
  attachmentOptimization: number;
  recommendation: string;
}

export interface HealingManagement {
  healingItemsUsed: number;
  healingEfficiency: number;
  lowHealthSituations: number;
  recommendation: string;
}

export interface ThrowableUsage {
  grenadesUsed: number;
  smokeUsage: number;
  flashbangUsage: number;
  effectiveness: number;
  recommendation: string;
}

export interface TeamCoordinationAnalysis {
  reviveEfficiency: ReviveEfficiency;
  teamSpreading: TeamSpreading;
  communicationEffectiveness: CommunicationEffectiveness;
  roleDistribution: RoleDistribution;
}

export interface ReviveEfficiency {
  totalRevives: number;
  successfulRevives: number;
  averageReviveTime: number;
  recommendation: string;
}

export interface TeamSpreading {
  averageTeamDistance: number;
  optimalSpreadMaintained: number;
  overExtensions: number;
  recommendation: string;
}

export interface CommunicationEffectiveness {
  coordinatedEngagements: number;
  simultaneousKnocks: number;
  focusFireEfficiency: number;
  recommendation: string;
}

export interface RoleDistribution {
  pointMan: string;
  support: string;
  fragger: string;
  igl: string;
  roleEffectiveness: number;
  recommendation: string;
}

export interface OverallPerformanceRating {
  overallScore: number;
  categoryScores: CategoryScores;
  improvementPotential: number;
  strengthsAndWeaknesses: StrengthsAndWeaknesses;
}

export interface CategoryScores {
  positioning: number;
  engagement: number;
  looting: number;
  teamwork: number;
  decision_making: number;
}

export interface StrengthsAndWeaknesses {
  strengths: string[];
  weaknesses: string[];
  priorityImprovements: string[];
}
