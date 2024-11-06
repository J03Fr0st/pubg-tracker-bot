export interface MatchReference {
  type: string;
  id: string;
}

export interface MatchData {
  id: string;
  type: string;
  attributes: {
    gameMode: string;
    mapName: string;
    duration: number;
    createdAt: string;
    isCustomMatch: boolean;
    seasonState: string;
    shardId: string;
  };
}

export interface Participant {
  type: 'participant';
  id: string;
  attributes: {
    stats: {
      DBNOs: number;
      assists: number;
      boosts: number;
      damageDealt: number;
      deathType: string;
      headshotKills: number;
      heals: number;
      killPlace: number;
      killStreaks: number;
      kills: number;
      longestKill: number;
      name: string;
      revives: number;
      rideDistance: number;
      roadKills: number;
      swimDistance: number;
      teamKills: number;
      timeSurvived: number;
      vehicleDestroys: number;
      walkDistance: number;
      weaponsAcquired: number;
      winPlace: number;
    };
  };
} 