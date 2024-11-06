// Root Players Interface
interface PlayersResponse {
    data: PlayerData[];
    links: {
        self: string;
    };
    meta: {};
}

// Player Data Interface
interface PlayerData {
    type: string;
    id: string;
    attributes: PlayerAttributes;
    relationships: {
        matches: RelationshipData;
    };
    links: {
        self: string;
    };
}

// Player Attributes Interface
interface PlayerAttributes {
    name: string;
    shardId: string;
    createdAt: string;
    updatedAt: string;
    patchVersion: string;
    titleId: string;
}

// Relationships for Matches
interface RelationshipData {
    data: MatchReference[];
}

// Match Reference Interface
interface MatchReference {
    type: string;
    id: string;
}

