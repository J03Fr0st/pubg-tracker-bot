// Root Players Interface
export interface PlayersResponse {
  data: PlayerData[];
  links?: {
    self: string;
  };
  meta?: {};
}

// Player Data Interface
export interface PlayerData {
  type: string;
  id: string;
  attributes: PlayerAttributes;
  relationships: {
    matches: RelationshipData;
  };
  links?: {
    self: string;
  };
}

// Player Attributes Interface
export interface PlayerAttributes {
  name: string;
  shardId: string;
  createdAt: string;
  updatedAt: string;
  patchVersion: string;
  titleId: string;
}

// Relationships for Matches
export interface RelationshipData {
  data: MatchReference[];
}

// Match Reference Interface
export interface MatchReference {
  type: string;
  id: string;
}
