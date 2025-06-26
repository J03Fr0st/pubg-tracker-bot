export interface MatchMonitorPlayer {
    id: string;
    name: string;
}

export interface MatchMonitorPlayerMatchInfo {
    player: MatchMonitorPlayer;
    matches: MatchMonitorMatch[];
}

export interface MatchMonitorMatch {
    id: string;
}

export interface MatchMonitorMatchGroup {
    matchId: string;
    players: MatchMonitorPlayer[];
    createdAt: Date;
}
