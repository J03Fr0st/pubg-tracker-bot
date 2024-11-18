// Root Match Interface
export interface MatchesResponse {
    data: MatchData;
    included: (Roster | Participant | Asset)[];
    links?: {
        self: string;
    };
    meta?: {};
    telemetryUrl?: string;
}

// Match Data Interface
export interface MatchData {
    type: string;
    id: string;
    attributes: MatchAttributes;
    relationships: {
        assets: RelationshipData;
        rosters: RelationshipData;
    };
}

// Match Attributes Interface
export interface MatchAttributes {
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
export interface RelationshipData {
    data: {
        type: string;
        id: string;
    }[];
}

// Roster Interface
export interface Roster {
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
export interface RosterAttributes {
    shardId: string;
    stats: RosterStats
}

// Roster Stats Interface
export interface RosterStats {
    rank: number;
    teamId: number;
}

// Participant export interface (Player Stats)
export interface Participant {
    type: string;
    id: string;
    attributes: ParticipantAttributes;
}

// Participant Attributes Interface
export interface ParticipantAttributes {
    actor: string;
    shardId: string;
    stats: PlayerStats;
}

// Player Stats Interface
export interface PlayerStats {
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

// Asset export interface (Telemetry Data)
export interface Asset {
    type: string;
    id: string;
    attributes: AssetAttributes;
}

// Asset Attributes Interface
export interface AssetAttributes {
    URL: string;
    name: string;
    description: string;
    createdAt: string;
}

