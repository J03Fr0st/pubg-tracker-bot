export interface PlayerMatchStats {
    name: string;
    stats: {
        rank: number;
        kills: number;
        damageDealt: number;
        timeSurvived: number;
        headshotKills: number;
        assists: number;
        boosts: number;
        heals: number;
        killPlace: number;
        longestKill: number;
        revives: number;
        walkDistance: number;
        weaponsAcquired: number;
        winPlace: number;
    };
}

export interface MatchGroupSummary {
    matchId: string;
    mapName: string;
    gameMode: string;
    playedAt: string;
    players: PlayerMatchStats[];
    teamRank?: number;
} 