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
