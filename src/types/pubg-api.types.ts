export interface PlayerSearchResult {
  data: {
    type: string;
    id: string;
    attributes: {
      name: string;
      shardId: string;
    };
    relationships: {
      matches: {
        data: Array<{
          type: string;
          id: string;
        }>;
      };
    };
  }[];
}

export interface PlayerStats {
  data: {
    type: string;
    attributes: {
      gameModeStats: {
        [key: string]: {
          assists: number;
          kills: number;
          damageDealt: number;
          wins: number;
          losses: number;
          winPoints: number;
        };
      };
    };
  };
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