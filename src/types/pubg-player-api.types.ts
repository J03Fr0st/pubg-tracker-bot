export interface PlayersResponse {
    data: PlayerData[]
  }
  
  export interface PlayerData {
    type: string
    id: string
    attributes: Attributes
    relationships: Relationships
  }
  
  export interface Attributes {
    clanId: string
    name: string
    stats: any
    titleId: string
    shardId: string
    patchVersion: string
    banType: string
  }
  
  export interface Relationships {
    matches: Matches
  }
  
  export interface Matches {
    data: Match[]
  }
  
  export interface Match {
    type: string
    id: string
  }

export interface MatchDetails {
  data: {
    type: string;
    id: string;
    attributes: {
      createdAt: string;
      duration: number;
      gameMode: string;
      mapName: string;
    };
    relationships: {
      participants: {
        data: Array<{
          type: string;
          id: string;
        }>;
      };
    };
  };
} 