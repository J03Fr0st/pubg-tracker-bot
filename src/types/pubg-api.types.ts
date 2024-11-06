export interface PlayerData {
  id: string;
  type: string;
  attributes: {
    name: string;
    shardId: string;
    createdAt: string;
    updatedAt: string;
    patchVersion: string;
    titleId: string;
  };
  relationships: {
    matches: {
      data: Array<{
        type: string;
        id: string;
      }>;
    };
  };
}

export interface PlayersResponse {
  data: PlayerData[];
}

export interface MatchesResponse {
  data: MatchData;
  included: Array<Participant | any>;
} 