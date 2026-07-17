import type { MatchResponse, Participant, Roster } from '@j03fr0st/pubg-ts';

function makeRoster(id: string, rank: number, participantIds: string[]): Roster {
  return {
    type: 'roster',
    id,
    attributes: {
      shardId: 'steam',
      stats: { rank, teamId: rank },
      won: rank === 1 ? 'true' : 'false',
    },
    relationships: {
      participants: {
        data: participantIds.map((participantId) => ({
          type: 'participant',
          id: participantId,
        })),
      },
      team: { data: null },
    },
  };
}

function makeParticipant(
  id: string,
  playerId: string,
  name: string,
  winPlace: number
): Participant {
  return {
    type: 'participant',
    id,
    attributes: {
      actor: '',
      shardId: 'steam',
      stats: {
        DBNOs: 0,
        assists: 0,
        boosts: 0,
        damageDealt: 0,
        deathType: '',
        headshotKills: 0,
        heals: 0,
        killPlace: 0,
        killPoints: 0,
        killPointsDelta: 0,
        killStreaks: 0,
        kills: 0,
        lastKillPoints: 0,
        lastWinPoints: 0,
        longestKill: 0,
        mostDamage: 0,
        name,
        playerId,
        rankPoints: 0,
        revives: 0,
        rideDistance: 0,
        roadKills: 0,
        swimDistance: 0,
        teamKills: 0,
        timeSurvived: 0,
        vehicleDestroys: 0,
        walkDistance: 0,
        weaponsAcquired: 0,
        winPlace,
        winPoints: 0,
        winPointsDelta: 0,
      },
    },
    relationships: {
      matches: { data: [{ type: 'match', id: 'match-xyz' }] },
    },
  };
}

export function makeMatchResponse(monitoredPlayerPubgId = 'account.1'): MatchResponse {
  return {
    data: {
      type: 'match',
      id: 'match-xyz',
      attributes: {
        createdAt: '2026-07-14T08:00:00.000Z',
        duration: 1800,
        gameMode: 'squad-fpp',
        mapName: 'Baltic_Main',
        isCustomMatch: false,
        patchVersion: '36.1.1',
        seasonState: 'progress',
        shardId: 'steam',
        stats: null,
        tags: null,
        titleId: 'bluehole-pubg',
        matchType: 'official',
      },
      relationships: {
        assets: { data: [{ type: 'asset', id: 'asset-1' }] },
        rosters: {
          data: [
            { type: 'roster', id: 'roster-1' },
            { type: 'roster', id: 'roster-2' },
          ],
        },
        rounds: { data: [] },
      },
    },
    included: [
      makeRoster('roster-1', 3, ['participant-1', 'participant-2']),
      makeRoster('roster-2', 10, ['participant-3']),
      makeParticipant('participant-1', monitoredPlayerPubgId, 'Player1', 3),
      makeParticipant('participant-2', 'account.2', 'TeamMate', 3),
      makeParticipant('participant-3', 'account.3', 'Opponent', 10),
      {
        type: 'asset',
        id: 'asset-1',
        attributes: {
          URL: 'https://telemetry.example.com/match.json',
          createdAt: '2026-07-14T08:00:00.000Z',
          description: '',
          name: 'telemetry',
        },
        relationships: {},
      },
    ],
    links: { self: 'https://api.pubg.com/shards/steam/matches/match-xyz' },
    meta: {},
  };
}
