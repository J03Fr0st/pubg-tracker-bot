// Root Match Interface
interface MatchesResponse {
    data: MatchData;
    included: (Roster | Participant | Asset)[];
    links?: {
        self: string;
    };
    meta?: {};
}

// Match Data Interface
interface MatchData {
    type: string;
    id: string;
    attributes: MatchAttributes;
    relationships: {
        assets: RelationshipData;
        rosters: RelationshipData;
    };
}

// Match Attributes Interface
interface MatchAttributes {
    createdAt: string;
    duration: number;
    gameMode: string;
    mapName: string;
    isCustomMatch: boolean;
    seasonState: string;
    shardId: string;
    titleId: string;
    tags: null | Record<string, any>;
}

// Relationships for Rosters and Assets
interface RelationshipData {
    data: {
        type: string;
        id: string;
    }[];
}

// Roster Interface
interface Roster {
    type: string;
    id: string;
    attributes: RosterAttributes;
    relationships: {
        participants: RelationshipData;
        team: {
            data: null | {
                type: string;
                id: string;
            };
        };
    };
}

// Roster Attributes
interface RosterAttributes {
    shardId: string;
    stats: RosterStats;
    won: string;
}

// Roster Stats Interface
interface RosterStats {
    rank: number;
    teamId: number;
}

// Participant Interface (Player Stats)
interface Participant {
    type: string;
    id: string;
    attributes: ParticipantAttributes;
}

// Participant Attributes Interface
interface ParticipantAttributes {
    actor: string;
    shardId: string;
    stats: PlayerStats;
}

// Player Stats Interface
interface PlayerStats {
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
}

// Asset Interface (Telemetry Data)
interface Asset {
    type: string;
    id: string;
    attributes: AssetAttributes;
}

// Asset Attributes Interface
interface AssetAttributes {
    URL: string;
    name: string;
    description: string;
    createdAt: string;
}

